import { Command } from 'commander';
import init from '../lib/init-env.js';
import kubectl from '../lib/kubectl.js';
import exec from '../lib/exec.js';
import os from 'os';

const program = new Command();

async function isHeadlampRunning() {
  try {
    if( os.platform() === 'win32' ) {
      let {stdout} = await exec('tasklist /FI "IMAGENAME eq Headlamp.exe" /NH');
      return stdout.toLowerCase().includes('headlamp');
    } else {
      // macOS and Linux
      await exec('pgrep -ix headlamp');
      return true;
    }
  } catch(e) {
    return false;
  }
}

async function openHeadlamp() {
  if( os.platform() === 'darwin' ) {
    await exec('open -a Headlamp');
  } else if( os.platform() === 'win32' ) {
    await exec('start Headlamp');
  } else {
    // Linux — try headlamp binary directly
    await exec('headlamp');
  }
}

program
  .description('Open Headlamp Kubernetes UI')
  .argument('<env>', 'project environment to activate before opening')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(async (env, opts) => {
    await init(env, opts, true);

    let kubeconfigFile = kubectl.runtimeParams?.kubeconfigFile;
    let isCustomKubeconfig = kubeconfigFile && kubeconfigFile !== kubectl.DEFAULT_KUBECONFIG;

    if( isCustomKubeconfig && process.env.KUBECONFIG !== kubeconfigFile ) {
      console.error(`This environment requires a custom kubeconfig: ${kubeconfigFile}`);
      console.error(`Set KUBECONFIG in your terminal first, then run this command again:`);
      console.error(`  export KUBECONFIG=${kubeconfigFile}`);
      process.exit(1);
    }

    if( !isCustomKubeconfig && process.env.KUBECONFIG ) {
      console.error(`This environment uses the default kubeconfig but KUBECONFIG is set to: ${process.env.KUBECONFIG}`);
      console.error(`Unset KUBECONFIG in your terminal first, then run this command again:`);
      console.error(`  unset KUBECONFIG`);
      process.exit(1);
    }

    if( await isHeadlampRunning() ) {
      console.error('Headlamp is already running and may have been launched with a different KUBECONFIG setting.');
      console.error('Please close Headlamp first, then run this command again.');
      process.exit(1);
    }

    await openHeadlamp();
  });

program.parse(process.argv);
