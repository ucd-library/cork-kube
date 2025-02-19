import { Command, Option } from 'commander';
import init from '../lib/init-env.js';
import config from '../lib/config.js';
import deploy from '../lib/deploy.js';
import kubectl from '../lib/kubectl.js';
import tty from '../lib/tty.js';

const program = new Command();

program
  .command('exec')
  .description('execute a command in a running pod')
  .argument('<env>', 'project environment')
  .argument('<service>', 'service name')
  .option('-p, --project <project>', 'project name')
  .option('-c, --config <path>', 'optional container name')
  .option('-n, --container <container>', 'optional container name')
  .addOption(new Option('-e, --command <command>', 'command to execute').default('bash'))
  .addOption(new Option('-t, --tag <tag>', 'Tag to filter "service" by.').default('app'))
  .action(async (env, service, opts) => {
    await init(env, opts);
    let corkKubeConfig = config.corkKubeConfig;

    let pod = await kubectl.getRunningPodByTag(service, opts.tag, corkKubeConfig);

    if( !pod ) {
      console.log(`No running pods found for ${opts.tag}=${service} and status.phase=Running`);
      process.exit(-1);
    }

    let args = ['exec', '-ti', pod];
    if( opts.container ) {
      args.push('-c', opts.container);
    }

    let cnsFlags = kubectl.getContextNsFlags().trim();
    if( cnsFlags ) args.push(cnsFlags);
    
    if( opts.command !== 'bash' ) {
      opts.command = `bash -c "${opts.command}"`;
    }

    args.push('--', opts.command);

    let cmd = ['kubectl', ...args].join(' ');
    console.log(`executing: ${cmd}`);

    await tty.exec('kubectl', args);
  });

program
  .command('port-forward')
  .description('port forward to a running pod')
  .argument('<env>', 'project environment')
  .argument('<service>', 'service name')
  .argument('<localPort:podPort>', 'local port to forward:pod port')
  .option('-p, --project <project>', 'project name')
  .option('-c, --config <path>', 'optional container name')
  .action(async (env, service, ports, opts) => {
    await init(env, opts);
    let corkKubeConfig = config.corkKubeConfig;

    let pod = await kubectl.getRunningPodByTag(service, opts.tag, corkKubeConfig);

    if( !pod ) {
      console.log(`No running pods found for ${opts.tag}=${service} and status.phase=Running`);
      process.exit(-1);
    }

    let args = ['port-forward', pod, ports];
    if( opts.container ) {
      args.push('-c', opts.container);
    }

    let cnsFlags = kubectl.getContextNsFlags().trim();
    if( cnsFlags ) args.push(cnsFlags);

    let cmd = ['kubectl', ...args].join(' ');
    console.log(`executing: ${cmd}`);

    await tty.exec('kubectl', args);
  });


program
  .command('logs')
  .description('log a running pod. This will filter out terminating pods.')
  .argument('<env>', 'project environment')
  .argument('<service>', 'service name')
  .option('-p, --project <project>', 'project name')
  .option('-c, --config <path>', 'optional container name')
  .option('-n, --container <container>', 'optional container name')
  .addOption(new Option('-t, --tag <tag>', 'Tag to filter "service" by.').default('app'))
  .action(async (env, service, opts) => {
    await init(env, opts);
    let corkKubeConfig = config.corkKubeConfig;

    let pods = await kubectl.getPodsByTag(service, opts.tag, corkKubeConfig);
    pods = pods.items
      .filter(p => p.metadata.deletionTimestamp == null)
      .map(p => p.metadata.name);
    
    if( !pods.length ) {
      console.log(`No running pods found for ${opts.tag}=${service}`);
      process.exit(-1);
    }
    let pod = pods[0];

    let args = ['logs', pod];
    
    let cnsFlags = kubectl.getContextNsFlags().trim();
    if( cnsFlags ) {
      args.push(cnsFlags);
    }
    
    if( opts.container ) {
      args.push('-c', opts.container);
    }

    args.push('-f');
    
    let cmd = ['kubectl', ...args].join(' ');
    console.log(`executing: ${cmd}`);

    await tty.exec('kubectl', args);
  });

program.parse(process.argv);