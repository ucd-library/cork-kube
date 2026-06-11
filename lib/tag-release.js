import exec from './exec.js';
import buildDependencies from './build-dependencies.js';
import readline from 'readline';

class TagRelease {

  /**
   * Resolve the GitHub owner/repo string for a given project name or the current directory.
   * If project is provided, loads the build registry to find the repo URL.
   * Otherwise uses `gh repo view` against the current directory.
   * @param {string} [project] - cork-kube project name (optional)
   * @param {object} [opts={}]
   * @returns {Promise<string>} owner/repo, e.g. "ucd-library/cork-kube"
   */
  async resolveRepo(project, opts={}) {
    if( project ) {
      await buildDependencies.load(opts);
      let info = buildDependencies.dependencies[project];
      if( !info ) {
        console.error(`Unknown project: ${project}. Run "cork-kube build list" to see available projects.`);
        process.exit(1);
      }
      // repository is a full URL like https://github.com/owner/repo
      let url = info.repository.replace(/\.git$/, '');
      let match = url.match(/github\.com[/:]([\w-]+\/[\w.-]+)/);
      if( !match ) {
        console.error(`Cannot parse GitHub owner/repo from repository URL: ${info.repository}`);
        process.exit(1);
      }
      return match[1];
    }

    // No project given — detect from the current directory
    let result;
    try {
      result = await exec('gh repo view --json nameWithOwner -q .nameWithOwner');
    } catch(e) {
      console.error('No --project specified and could not detect a GitHub repository in the current directory.');
      console.error('Run from inside a GitHub-tracked repo or pass --project <name>.');
      process.exit(1);
    }

    let repo = result.stdout.trim();
    if( !repo || repo === 'null' ) {
      console.error('No --project specified and could not detect a GitHub repository in the current directory.');
      process.exit(1);
    }
    return repo;
  }

  /**
   * Fetch the latest commit on a branch via the GitHub API.
   * @param {string} repo - owner/repo string
   * @param {string} branch
   * @returns {Promise<{sha: string, message: string, author: string}>}
   */
  async getLatestCommit(repo, branch) {
    let {stdout} = await exec(
      `gh api repos/${repo}/branches/${branch} --jq '[.commit.sha, .commit.commit.message, .commit.commit.author.name] | @tsv'`
    );
    let [sha, message, author] = stdout.trim().split('\t');
    return {sha, message: (message || '').split('\\n')[0].trim(), author: author || ''};
  }

  /**
   * Fetch the last N commits on a branch via the GitHub API.
   * @param {string} repo - owner/repo string
   * @param {string} branch
   * @param {number} [count=3]
   * @returns {Promise<Array<{sha: string, message: string, author: string}>>}
   */
  async getRecentCommits(repo, branch, count=3) {
    let {stdout} = await exec(
      `gh api "repos/${repo}/commits?sha=${branch}&per_page=${count}" --jq '.[] | [.sha, .commit.message, .commit.author.name] | @tsv'`
    );
    return stdout.trim().split('\n').filter(Boolean).map(line => {
      let [sha, message, author] = line.split('\t');
      return {sha: sha.slice(0, 7), message: (message || '').split('\\n')[0].trim(), author: author || ''};
    });
  }

  /**
   * Fetch the most recent semver tag in the repository.
   * Non-semver tags (e.g. feature flags, named snapshots) are ignored.
   * @param {string} repo - owner/repo string
   * @returns {Promise<string>} tag name, or empty string if none exist
   */
  async getLatestTag(repo) {
    try {
      let {stdout} = await exec(`gh api repos/${repo}/tags --jq '.[].name'`);
      let semver = /^v?\d+\.\d+\.\d+/;
      let tag = stdout.trim().split('\n').find(t => semver.test(t.trim()));
      return tag ? tag.trim().replace(/^v/, '') : '';
    } catch(e) {
      return '';
    }
  }

  /**
   * Prompt the user with a yes/no question via stdin.
   * @param {string} question
   * @returns {Promise<boolean>}
   */
  async confirm(question) {
    let rl = readline.createInterface({input: process.stdin, output: process.stdout});
    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'y');
      });
    });
  }

  /**
   * Tag the latest commit on a branch with the given version tag.
   * @param {string} branch - branch to tag
   * @param {string} newTag - new version tag to apply
   * @param {object} [opts={}]
   * @param {string} [opts.project] - cork-kube project name; if omitted, detected from cwd
   * @param {boolean} [opts.dryRun] - print actions without executing
   */
  async run(branch, newTag, opts={}) {
    let repo = await this.resolveRepo(opts.project, opts);

    let latestCommit, latestTag;
    try {
      [latestCommit, latestTag] = await Promise.all([
        this.getLatestCommit(repo, branch),
        this.getLatestTag(repo)
      ]);
    } catch(e) {
      console.error(`Failed to fetch branch/tag info: ${e.message}`);
      process.exit(1);
    }

    let shortSha = latestCommit.sha.slice(0, 7);

    let priorCommits;
    try {
      // fetch 4 so we can skip the first (already shown as the latest commit)
      let commits = await this.getRecentCommits(repo, branch, 4);
      priorCommits = commits.slice(1);
    } catch(e) {
      console.error(`Failed to fetch prior commits: ${e.message}`);
      process.exit(1);
    }

    console.log(`\nRepository : ${repo}`);
    console.log(`Branch     : ${branch}`);
    console.log(`Commit     : ${shortSha}  ${latestCommit.message}`);
    console.log(`Author     : ${latestCommit.author}`);
    console.log(`Tag        : ${latestTag || '(none)'} -> ${newTag}`);

    if( priorCommits.length ) {
      console.log('\nPrior commits:');
      for( let c of priorCommits ) {
        console.log(`  ${c.sha}  ${c.message}  (${c.author})`);
      }
    }

    console.log('');

    if( opts.dryRun ) {
      console.log(`[dry-run] Would create tag ${newTag} on commit ${shortSha}`);
      return;
    }

    let approved = await this.confirm(`Create tag ${newTag} on ${shortSha}? [y/N] `);
    if( !approved ) {
      console.log('Aborted.');
      process.exit(0);
    }

    try {
      await exec(
        `gh api repos/${repo}/git/refs --method POST --field ref="refs/tags/${newTag}" --field sha="${latestCommit.sha}"`
      );
    } catch(e) {
      console.error(`Failed to create tag: ${e.message}`);
      process.exit(1);
    }

    console.log(`Tagged ${shortSha} as ${newTag} on ${repo}`);
  }
}

const inst = new TagRelease();
export default inst;
