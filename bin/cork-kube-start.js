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
  .option('-r, --redeploy', 'redeploy service, deletes it first then deploys. A service must be specified')
  .option('-d, --debug', 'debug service deployment')
  .action(async (env, opts) => {
    await init(env, opts);

    let envConfig = config.data.local.environments[env];
    let namespaces = await kubectl.getNamespaces();
    if( !namespaces.includes(envConfig.namespace) ) {
      console.log(`Creating namespace ${envConfig.namespace}`);
      if( !opts.debug ) {
        await kubectl.createNamespace(envConfig.namespace);
      }
    }

    if( config.data.local.secrets && !opts.service) {
      await deploy.secrets(env, opts);
    }

    if( opts.redeploy && !opts.debug) {
      if( !opts.service ) {
        console.error('Service name is required for redeploy');
        process.exit(1);
      }
      await deploy.remove(opts.service, env);
    }

    if( opts.service ) {
      await deploy.service(opts.service, env, opts.debug);
    } else {
      await deploy.all(env, opts.debug);
    }
  });

program.parse(process.argv);