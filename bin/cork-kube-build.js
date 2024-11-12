import { Command } from 'commander';
import init from '../lib/init-env.js';
import config from '../lib/config.js';
import build from '../lib/build.js';
import buildDependencies from '../lib/build-dependencies.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import kubectl from '../lib/kubectl.js';

const program = new Command();

// program
//   .argument('<env>', 'environment to start')
//   .requiredOption('-l, --location <location>', 'location of the build')
//   .option('-c, --config <config>', 'path to config file')
//   .option('-p, --project <project>', 'project name')
//   .option('-i, --image <name>', 'only build a specific')
//   // .option('-g, --group <name>', 'only build a specific group of images')
//   .option('-r, --redeploy', 'redeploy service, deletes it first then deploys. A service must be specified')
//   .option('-x, --no-docker-logs', 'do not show docker logs during build')
//   .option('-d, --debug', 'debug/dry run build.  Just prints the docker build command')
//   .action(async (env, opts) => {
//     config.init(opts.config, opts);
    
//     if( !config.data.local.build ) {
//       console.error(`No build configuration found in ${config.localFile}`);
//       process.exit(1);
//     }

//     if( opts.image ) {
//       let imageConfig = config.data.local.build.image.find(i => i.name == opts.image);
//       if( !imageConfig ) {
//         console.error(`Image ${opts.image} not found in .cork-kube-config build.image`);
//         process.exit(1);
//       }
//       await build.buildImage(opts.image, env, opts.location, config.data.local.build || {}, opts);
//       console.log('');
//       return;
//     }

//     for( let image of config.data.local.build.images ) {
//       await build.buildImage(image.name, env, opts.location, config.data.local.build || {}, opts);
//     }

//   });



program
  .command('exec')
  .description('execute a project build')
  .requiredOption('-p, --project <project>', 'project name')
  .requiredOption('-v, --version <version>', 'version to build')
  .option('-m, --production', 'production build.  Use real registry names and push images to the defined registry')
  .option('-r, --use-remote <repoNameOrUrl>', 'use remote git repository instead of configured local directory')
  .option('-d, --dry-run', 'dry run build.  Just prints the docker build commands')
  .option('-s, --tag-selection <selectionType>', 'tag selection type.  Default: auto.  Options: force-tag (git tag), force-branch (git branch).  Can be comma separated list of project=selectionType')
  .option('-o, --override-tag <tag>', 'override tag for the build.  Can be comma separated list of project=tag')
  .option('--depth <depth>', 'depth of dependencies to build.  Default: 1, the current project.  Use ALL to build all dependencies')
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

program.command('show')
  .description('show build configuration')
  .requiredOption('-p, --project <project>', 'project name')
  .requiredOption('-v, --version <version>', 'version to build')
  .option('-r, --use-remote <repoNameOrUrl>', 'use remote git repository instead of configured local directory')
  .option('-o, --output <file>', 'output format, json, yaml, text. Default: text')
  .action(async (opts) => {
    if( opts.useRemote ) {
      opts.useRemote = opts.useRemote.split(/(,| )/g)
        .map(i => i.trim());
    }
    buildDependencies.load();
    let graph = buildDependencies.getBuildGraph(opts.project, opts.version, opts);
    if( opts.output == 'json' ) {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }
    if( opts.output == 'yaml' ) {
      console.log(yaml.dump(graph));
      return;
    } 

    let root = graph[opts.project];

    console.log(`Project: ${opts.project}`);
    if( root.localDir ) {
      console.log(`Local Directory: ${root.localDir}`);
    } else {
      console.log(`Version: ${opts.version}`);
      console.log(`Repository: ${root.url}`);
    }
    console.log(`Dependencies:`);
    printDependencies(root.dependencies);
  });

function printDependencies(deps, depth=1) {
  for( let dep in deps ) {
    let info = deps[dep];
    if( info.localDir ) {
      console.log(`${'  '.repeat(depth)}- ${dep} ${info.localDir}`);
    } else {
      console.log(`${'  '.repeat(depth)}- ${dep} ${info.url} v${info.version}`);
    }
    printDependencies(info.dependencies, depth+1);
  }
}

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