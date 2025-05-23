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
  .option('--cork-build-registry <url>', 'override default remote cork-build-registry location')
  .option('--gcb-project <gcbProject>', 'Google Cloud Build project to submit the build to')
  .option('--no-cache', 'do not use cache when building images')
  .option('--high-cpu', 'use high cpu machine type for build')
  .option('--depth <depth>', 'build depth.  Default: 1, the current project.  Use ALL to build all dependencies')
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
  .option('--use-registry <projects>', 'use the registry for the given projects even in dev build.  Comma separated list of project names')
  .option('--cork-build-registry <url>', 'override default remote cork-build-registry location')
  .option('--local-dev-registry <registry>', 'use the provided local dev registry for the build instead of the default: localhost/local-dev')
  .option('--no-cache', 'do not use cache when building images')
  .option('--no-cache-from', 'do not use --cache-from when building images, speeds up local development')
  .action(async (opts) => {
    if( opts.useRemote ) {
      opts.useRemote = opts.useRemote.split(/(,| )/g)
        .map(i => i.trim());
    }

    if( opts.useRegistry ) {
      opts.useRegistry = opts.useRegistry.split(/(,| )/g)
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
      if( opts.depth !== 1 ) {
        console.warn('Running production build with depth set to: '+opts.depth);
      }
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
  .option('--cork-build-registry <url>', 'override default remote cork-build-registry location')
  .action(async (opts) => {
    await buildDependencies.load(opts);

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
          let {buildConfig} = await buildDependencies.fetchCorkBuildFile(project, version);
          for( let image in buildConfig.images ) {
            v.images.push(buildConfig.registry+'/'+image+':'+version);
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
  .option('--cork-build-registry <url>', 'override default remote cork-build-registry location')
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
  .command('reset-cork-registry-location')
  .description('use the remote location of the build registry')
  .action(async () => {
    config.init();
    delete config.data.build.dependenciesDir;
    config.saveGlobal();
  });

program.command('show-config')
  .description('show the current local build configuration')
  .option('-i, --include-local-repos', 'include local repositories in the output')
  .action(async (opts) => {
    config.init();
    if( !opts.includeLocalRepos ) {
      delete config.data.build.localRepos;
    }
    console.log(yaml.dump(config.data.build));
  });

program
  .command('set-config')
  .option('-p, --gcb-project <project>', 'GCB project to use for builds')
  .option('-r, --cork-registry <cork-registry>', 'cork registry to use for images')
  .option('-d, --docker-registry <ghHost:docker-registry>', 'set local docker registry to use for images')
  .option('-l, --push-local <enable>', 'push local builds to images to the registry')
  .description('GCB project to use for builds')
  .action(async (args) => {
    config.init();

    if( args.pushLocal ) {
      console.log('Setting push local: '+args.pushLocal);
      config.data.build.pushLocalDev = args.pushLocal === 'true';
    }
    if( args.gcbProject ) {
      console.log('Setting GCB project: '+args.gcbProject);
      config.data.build.gcbProject = args.gcbProject;
    }
    if( args.dockerRegistry ) {
      let [host, registry] = args.dockerRegistry.split(':');
      if( !host || !registry ) {
        console.error('Invalid docker registry format. Use <Github Project Url>:<Google Artifact Registry Path>');
        process.exit(1);
      }

      console.log('Setting local dev docker for project = '+host+' registry: '+registry);
      if( !config.data.build.localDevRegistry ) {
        config.data.build.localDevRegistry = {};
      }
      config.data.build.localDevRegistry[host] = registry;
    }
    if( args.corkRegistry ) {
      if( args.corkRegistry.match(/^(https?:\/\/|git@)/) ) {
        console.log('Setting registry url: '+args.corkRegistry);
        config.data.build.registryUrl = args.corkRegistry;
        config.saveGlobal();
        return;
      }
  
      if( !path.isAbsolute(args.corkRegistry) ) {
        args.corkRegistry = path.resolve(process.cwd(), args.corkRegistry);
      }
      if( !fs.existsSync(args.corkRegistry) ) {
        console.error(`Directory not found: ${args.corkRegistry}`);
        process.exit(1);
      }
  
      console.log('Setting local registry dir: '+args.corkRegistry);
      config.data.build.dependenciesDir = args.corkRegistry;
    }

    config.saveGlobal();
  });

program.parse(process.argv);