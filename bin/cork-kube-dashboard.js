import { Command } from 'commander';
import init from '../lib/init-env.js';
import kubectl from '../lib/kubectl.js';
import exec from '../lib/exec.js';

const program = new Command();

program
  .description('Open Headlamp Kubernetes UI')
  .argument('<env>', 'project environment to activate before opening')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(async (env, opts) => {
    await init(env, opts);

    let kubeconfigFile = kubectl.runtimeParams?.kubeconfigFile;
    if( kubeconfigFile && kubeconfigFile !== kubectl.DEFAULT_KUBECONFIG && !process.env.KUBECONFIG ) {
      console.error(`This environment uses a custom kubeconfig: ${kubeconfigFile}`);
      console.error(`Set KUBECONFIG in your terminal first, then run this command again:`);
      console.error(`  export KUBECONFIG=${kubeconfigFile}`);
      process.exit(1);
    }

    await exec('open -a Headlamp');
  });

program.parse(process.argv);
