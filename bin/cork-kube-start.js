import { Command } from 'commander';
import init from '../lib/init-env.js';
import config from '../lib/config.js';
import deploy from '../lib/deploy.js';
import kubectl from '../lib/kubectl.js';

const program = new Command();

program
  .argument('<env>', 'environment to start')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .option('-s, --service <name>', 'only deploy a specific service')
  .option('-g, --group <name>', 'only deploy a specific group of services')
  .option('-r, --redeploy', 'redeploy service, deletes it first then deploys. A service must be specified')
  .option('-d, --debug', 'debug service deployment')
  .option('--ignore-source-mounts', 'ignore source mounts when deploying')
  .action(async (env, opts) => {
    if( opts.service && opts.group ) {
      console.error('Cannot specify both service and group, please choose one');
      process.exit(1);
    }

    env = await init(env, opts);
    let corkKubeConfig = config.corkKubeConfig;

    console.log('');

    let namespaces = await kubectl.getNamespaces(corkKubeConfig);
    if( !namespaces.includes(corkKubeConfig.namespace) ) {
      console.log(`Creating namespace ${corkKubeConfig.namespace}`);
      if( !opts.debug ) {
        await kubectl.createNamespace(corkKubeConfig.namespace, corkKubeConfig);
      }
    }

    if( config.data.local.secrets && !opts.service && !opts.group ) {
      await deploy.secrets(opts);
    }

    let groupServices = [];
    if( opts.group ) {
      for( let service of config.data.local.services ) {
        groupServices.push(
          await deploy.renderTemplate(service.name, {
            quiet: true, 
            debug: opts.debug,
            ignoreSourceMounts: opts.ignoreSourceMounts
          })
        );
      }

      groupServices = groupServices
        .filter(s => s.group.includes(opts.group));
    }

    if( opts.redeploy && !opts.debug) {
      if( opts.group ) {
        for( let service of groupServices ) {
          try {
            console.log(`Removing ${service.name}`);
            await deploy.remove(service.name);
            console.log();
          } catch(e) {
            console.warn(e.message);
          }
        }
      } else if ( opts.service ) {
        try {
          await deploy.remove(opts.service);
        } catch(e) {
          console.warn(e.message);
        }
      } else {
        for( let service of config.data.local.services ) {
          try {
            console.log(`Removing ${service.name}`);
            await deploy.remove(service.name);
            console.log();
          } catch(e) {
            console.warn(e.message);
          }
        }
      }
    }

    if( opts.group ) {
      for( let service of groupServices ) {
        await deploy.service(service.name, opts);
      }
    } else if( opts.service ) {
      await deploy.service(opts.service, opts);
    } else {
      await deploy.all(opts);
    }
  });

program.parse(process.argv);