import { Command } from 'commander';
import config from '../lib/config.js';
import build from '../lib/build.js';
import buildDependencies from '../lib/build-dependencies.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const program = new Command();

program
  .command('gcb')
  .description('submit a project build to Google Cloud Build')
  .requiredOption('-p, --project <project>', 'project name')
  .requiredOption('-v, --version <version>', 'version to build')
  .option('--no-cache', 'do not use cache when building images')
  .option('-d, --dry-run', 'just print the gcloud command')
  .action(async (opts) => {
    if( opts.cache === undefined ) {
      opts.cache = true;
    }
    build.googleCloudBuild(opts.project, opts.version, opts);
  });


program
  .command('exec')
  .description('execute a project build')
  .requiredOption('-p, --project <project>', 'project name')
  .requiredOption('-v, --version <version>', 'version to build')
  .option('-m, --production', 'production build.  Use real registry names and push images to the defined registry')
  .option('--no-push', 'do not push images to the registry.  Use this with production builds to just build the images to build image but not push, which is the default for production')
  .option('-r, --use-remote <repoNameOrUrl>', 'use remote git repository instead of configured local directory')
  .option('-d, --dry-run', 'dry run build.  Just prints the docker build commands')
  .option('-s, --tag-selection <selectionType>', 'tag selection type.  Default: auto.  Options: force-tag (git tag), force-branch (git branch).  Can be comma separated list of project=selectionType')
  .option('-o, --override-tag <tag>', 'override tag for the build.  Can be comma separated list of project=tag')
  .option('-f, --filter <filter>', 'filter image names to build.  Can be comma separated list of project names')
  .option('--depth <depth>', 'depth of dependencies to build.  Default: 1, the current project.  Use ALL to build all dependencies')
  .option('--increment-build-number', 'increment the build number for the project.  The build number is set as a label on the image')
  .option('--no-cache', 'do not use cache when building images')
  .action(async (opts) => {
    if( opts.useRemote ) {
      opts.useRemote = opts.useRemote.split(/(,| )/g)
        .map(i => i.trim());
    }

    if( opts.depth ) {
      if( opts.depth !== 'ALL' ) {
        opts.depth = parseInt(opts.depth);
      }
    } else {
      opts.depth = 1;
    }

    // don't build dependencies in production
    // should only build the current project
    if( opts.production ) {
      opts.depth = 1;
      if( opts.noPush === true ) {
        console.warn('using --no-push flag.  Images will not push to the registry');
      }
    }

    if( opts.filter ) {
      opts.filter = opts.filter.split(/(,| )/g)
        .map(i => i.trim());
    } else {
      opts.filter = [];
    }

    // check for this as env var to allow for caching
    if( process.env.CORK_BUILD_USE_CACHE || process.env._CORK_BUILD_USE_CACHE ) {
      let useCache = process.env.CORK_BUILD_USE_CACHE || process.env._CORK_BUILD_USE_CACHE;
      opts.cache = useCache === 'true';
    } else if( opts.cache === undefined ) {
      opts.cache = true;
    }

    build.exec(opts);
  });

program
  .command('register-local-repo')
  .description('register a local repository to use')
  .argument('<dir>', 'repository directory')
  .action(async (dir) => {
    if( !path.isAbsolute(dir) ) {
      dir = path.resolve(process.cwd(), dir);
    }

    if( !fs.existsSync(dir) ) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }

    config.init();

    if( !config.data.build.localRepos ) {
      config.data.build.localRepos = {};
    }

    let gitInfo = await buildDependencies.gitInfo(dir);
    if( !gitInfo.name ) {
      console.error(`Could not find repository name for ${dir}.  Is it a git repository?`);
      process.exit(1);
    }

    config.data.build.localRepos[gitInfo.name] = {
      dir,
      url: gitInfo.remote
    }

    console.log(`Registered repository ${gitInfo.name} (${gitInfo.remote}) to ${dir}`);

    config.saveGlobal();
  });

program
  .command('list')
  .description('list all projects and their versions')
  .option('-p, --project <project>', 'filter to a project name')
  .option('-n, --names', 'just list project names')
  .option('-i, --images', 'list images names')
  .action(async (opts) => {
    await buildDependencies.load();

    let list = {};
    for( let project in buildDependencies.dependencies ) {
      if( opts.project && project !== opts.project ) {
        continue;
      }

      let info = buildDependencies.dependencies[project];
      list[project] = {
        url : info.repository,
        versions : []
      };

      if( opts.names ) continue;

      for( let version in info.builds ) {
        if( opts.images ) {
          let v = {version, images: []};
          list[project].versions.push(v);
          let {buildFile} = await buildDependencies.fetchCorkBuildFile(project, version);
          for( let image in buildFile.images ) {
            v.images.push(buildFile.registry+'/'+image+':'+version);
          }
        } else {
          list[project].versions.push(version);
        }
      }
    }

    if( opts.names ) {
      list = Object.keys(list);
    }

    console.log(yaml.dump(list));
  });

program
  .command('validate')
  .description('validate a dockerfile for a project')
  .option('-p, --project <project>', 'project name')
  .option('-v, --version <version>', 'project version')
  .action(async (opts) => {
    let result = await buildDependencies.validateImages(opts.project, opts.version);
    console.log(yaml.dump(result));
  });

program
  .command('show-local-repos')
  .description('show locally configured repositories')
  .action(async () => {
    config.init();
    let localRepos = config.data.build.localRepos || {};
    console.log(yaml.dump(localRepos));
  });

program
  .command('set-registry-location')
  .argument('<dir>', 'location of the build registry')
  .description('set the location of the build registry')
  .action(async (dir) => {
    config.init();

    if( !path.isAbsolute(dir) ) {
      dir = path.resolve(process.cwd(), dir);
    }
    if( !fs.existsSync(dir) ) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }

    config.data.build.dependenciesDir = dir;
    config.saveGlobal();
  });

program
  .command('reset-registry-location')
  .description('use the default location of the build registry')
  .action(async () => {
    config.init();
    delete config.data.build.dependenciesDir;
    config.saveGlobal();
  });


program.parse(process.argv);