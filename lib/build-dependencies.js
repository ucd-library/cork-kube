import config from '../lib/config.js';
import fs from 'fs';
import path from 'path';
import exec from './exec.js';
import fetch from 'node-fetch';

class BuildDependencies {

  constructor() {
    this.REG_REPO = {
      NAME : 'cork-build-registry',
      URL : 'https://github.com/ucd-library/cork-build-registry'
    }
    this.githubShaCache = new Map();
  }

  async load(opts={}) {
    if( this.dependencies ) {
      return this.dependencies;
    }

    config.init();
    this.config = config.data.build || {};
    let rootDir = config.BUILD_ROOT;
    let dependenciesDir;

    if( this.config.dependenciesDir ) {
      dependenciesDir = this.config.dependenciesDir;
      if( !fs.existsSync(dependenciesDir) ) {
        console.error(`Defined dependencies directory not found: ${dependenciesDir}`);
        process.exit(1);
      }
    } else {
      dependenciesDir = path.join(rootDir, this.REG_REPO.NAME);
      this.config.dependenciesDir = dependenciesDir;
      await this.pullRepository(dependenciesDir, this.REG_REPO.URL, 'main');
    }

    dependenciesDir = path.join(dependenciesDir, 'repositories');
    let dependencies = fs.readdirSync(dependenciesDir)
      .filter(f => f.match(/.json$/))
      .map(f => JSON.parse(fs.readFileSync(path.join(dependenciesDir, f), 'utf-8')));

    this.dependencies = {};
    for( let d of dependencies ) {
      this.dependencies[d.repository.split('/').pop()] = d;
    }

    return this.dependencies;
  }

  async pullRepository(dir, url, version) {
    if( fs.existsSync(dir) ) {
      let result = await exec(`git -C ${dir} diff --shortstat`);
      let gitInfo = await this.gitInfo(dir);
      let pullRequired = result.stdout.trim() !== '';
      let checkoutRequired = (gitInfo.branch != version && gitInfo.tag != version);

      if( pullRequired || checkoutRequired ) {
        console.log(`Updating ${dir} to ${version}`);
      }

      if( pullRequired ) {
        console.warn(`Directory ${dir} is dirty.  Attempting hard reset before updating`);
        await exec(`git -C ${dir} reset --hard`, null, {output: 'realtime'});
      }
   
      if( checkoutRequired ) {
        console.log(`Checking out ${version} in ${dir}`);
        await exec(`git -C ${dir} checkout ${version}`, null, {output: 'realtime'});
      }

      await exec(`git -C ${dir} pull`);
    } else {
      console.log(`Cloning ${url} to ${dir}`);
      await exec(`git -c advice.detachedHead=false clone ${url} --branch ${version} --depth 1 ${dir}`, null, {output: 'realtime'});
    }
  }

  async fetchGithubSha(projectPath, type, version) {
    let cacheKey = `${projectPath}/${type}/${version}`;
    if( this.githubShaCache.has(cacheKey) ) {
      return this.githubShaCache.get(cacheKey);
    }

    let resp;
    try {
      let apiType = type == 'tag' ? 'tags' : 'heads';
      resp = await fetch(`https://api.github.com/repos${projectPath}/git/ref/${apiType}/${version}`)
      resp = await resp.json();
    } catch(e) {
      resp = null;
    }

    if( !resp ) {
      console.error(`Could not find ${type} ${version} for ${projectPath}`);
      process.exit(1);
    }

    this.githubShaCache.set(cacheKey, resp.object.sha);

    return resp.object.sha;
  }

  async fetchDockerfileInfo(registry, image, tag) {
    let regUrl = new URL('http://'+registry);
    let resp = await fetch(`https://${regUrl.hostname}/v2/${regUrl.pathname}/${image}/manifests/${tag}`);
    let manifest = await resp.json();
    let digest = manifest.config.digest;
    resp = await fetch(`https://${regUrl.hostname}/v2/${regUrl.pathname}/${image}/blobs/${digest}`);
    resp = await resp.json();
    return resp.config;
  }

  async fetchCorkBuildFile(project, version, opts={}) {
    let projInfo = this.dependencies[project];
    if( !projInfo ) {
      console.error(`Project ${project} not found`);
      process.exit(1);
    }

    let builds = projInfo.builds || {};
    let build = builds[version];
    if( !build ) {
      build = builds['*'];
    }

    if( !build ) {
      console.error(`No build configuration found for ${project} version ${version}`);
      process.exit(1);
    }

    let repoUrl = new URL(projInfo.repository);
    let type = '';

    // first try for a tag
    let buildConfig;
    try {
      buildConfig = await fetch(`https://raw.githubusercontent.com/${repoUrl.pathname}/refs/tags/${version}/.cork-build`)
      buildConfig = await buildConfig.json();
      type = 'tag';
    } catch(e) {
      buildConfig = null;
    }

    if( !buildConfig ) {
      try {
        buildConfig = await fetch(`https://raw.githubusercontent.com/${repoUrl.pathname}/refs/heads/${version}/.cork-build`)
        buildConfig = await buildConfig.json();
        type = 'branch';
      } catch(e) {
        buildConfig = null;
      }
    }

    if( !buildConfig ) {
      console.error(`No .cork-build build file found for ${project} version ${version}`);
      process.exit(1);
    }

    return {type, buildConfig};
  }

  async validateImages(project, version) {
    await this.load();

    let {type, buildConfig} = await this.fetchCorkBuildFile(project, version);

    let projInfo = this.dependencies[project];
    let repoUrl = new URL(projInfo.repository);
    let labelName = project.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()+'_SHA';

    let result = [];

    for( let image in buildConfig.images ) {
      let sha = await this.fetchGithubSha(repoUrl.pathname, type, version);
      let shortSha = sha.substring(0, 7);

      let dockerInfo = {};
      try {
        dockerInfo = await this.fetchDockerfileInfo(buildConfig.registry, image, version);
      } catch(e) {}

      result.push({
        image: buildConfig.registry+'/'+image+':'+version,
        imageExists: dockerInfo ? true : false,
        githubCommitSha : sha,
        imageLabels: dockerInfo?.Labels,
        imageShaLabel: labelName,
        valid : dockerInfo?.Labels?.[labelName] == shortSha
      });
    }

    return result;
  }

  getBuildGraph(project, version, opts={}, graph={}) {
    let projInfo = this.dependencies[project];
    if( !projInfo ) {
      console.error(`Project ${project} not found`);
      process.exit(1);
    }

    let builds = projInfo.builds || {};
    let build = builds[version];
    if( !build ) {
      build = builds['*'];
    }

    if( !build ) {
      console.error(`No build configuration found for ${project} version ${version}
  - Options: ${Object.keys(builds).join(', ')}`);
      process.exit(1);
    }
    
    if( !graph[project] ) {
      graph[project] = {
        version, 
        url: projInfo.repository
      };
      let localDir = this.getLocalDir(projInfo.repository, opts);
      if( localDir ) graph[project].localDir = localDir;
    }

    graph[project].dependencies = {};
    let dGraph = graph[project].dependencies;

    for( let depProjName in build ) {
      let version = build[depProjName];
      let projectUrl = projInfo.dependencies[depProjName];
      let project = projectUrl.split('/').pop();

      let item = {
        version: version, 
        url: projectUrl
      };
      let localDir = this.getLocalDir(projectUrl, opts);
      if( localDir ) item.localDir = localDir;

      dGraph[project] = item;
      this.getBuildGraph(project, version, opts, dGraph);
    }

    return graph;
  }

  getLocalDir(url, opts) {
    if( opts.useRemote && opts.useRemote.includes(url) ) {
      return null;
    }
    if( !config.data?.build?.localRepos ) {
      return null;
    }
    for( let name in config.data.build.localRepos ) {
      if( opts.useRemote && opts.useRemote.includes(name) ) {
        continue;
      }
      if( config.data.build.localRepos[name].url == url ) {
        return config.data.build.localRepos[name].dir;
      }
    }
    return null;
  }

  get() {
    return this.dependencies;
  }

  async gitInfo(dir) {
    var resp = await exec(`git -C ${dir} remote -v`);

    let remote = resp.stdout.split('\n')[0]
                            .split('\t')[1]
                            .replace(/\s.*/, '')
    if( remote.match(/^git@/) ) {
      remote = remote.replace(':', '/')
        .replace(/^git@/, 'https://')
    }
    remote = remote.replace(/.git$/, '');
    let name = remote.split('/').pop();

    resp = await exec(`git -C ${dir} log -1 --pretty=%h`);
    let commit = resp.stdout.trim();

    let tag = '';
    try {
      resp = await exec(`git -C ${dir} describe --tags --exact-match`);
      tag = resp.stdout.trim();
    } catch(e) {}

    resp = await exec(`git -C ${dir} rev-parse --abbrev-ref HEAD`);
    let branch = resp.stdout.trim();

    resp = await exec(`git -C ${dir} log -1 --pretty=format:"%ct"`);
    let date = new Date(parseInt(resp.stdout.trim()) * 1000).toISOString();

    return {remote, commit, tag, branch, name, date};
  }
}

const inst = new BuildDependencies();
export default inst;