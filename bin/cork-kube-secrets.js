import { Command } from 'commander';
import init from '../lib/init-env.js';
import config from '../lib/config.js';
import deploy from '../lib/deploy.js';
import kubectl from '../lib/kubectl.js';
import colors from 'colors';


const program = new Command();

program
  .command('deploy')
  .argument('<env>', 'environment to to deploy')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .option('-s, --secret <name>', 'only deploy a specific secret')
  .option('-r, --redeploy', 'redeploy secret, deletes it first, if it exists')
  .action(async (env, opts) => {
    env = await init(env, opts);

    if( opts.secret ) {
      await deploy.removeSecret(opts.secret);
      await deploy.secret(opts.secret, env);
    } else {
      await deploy.secrets(env, opts);
    }
  });

program.parse(process.argv);