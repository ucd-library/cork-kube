import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import open from 'open';
import yaml from 'js-yaml';
import init from '../lib/init-env.js';

const program = new Command();

const ROOT_URL = 'http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/';
const CONTEXT='docker-desktop';
const CONTEXT_FLAG='--context docker-desktop';

program
  .command('create')
  .description('create kubernetes dashboard for docker-desktop')
  .argument('<env>', 'project environment')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(async (env, opts) => {    
    await init(env, opts);

    let corkKubeConfig = config.corkKubeConfig;
    if( corkKubeConfig.context != 'docker-desktop' ) {
      console.error('This command is only for docker-desktop');
      process.exit
    }

    await kubectl.apply(config.DASHBOARD_URL, null, {context: CONTEXT});

    try {
      await kubectl.exec(`kubectl create serviceaccount ${CONTEXT_FLAG} -n kubernetes-dashboard admin-user`);
    } catch(e) {}
    
    try {
      await kubectl.exec(`kubectl create clusterrolebinding admin-user-cluster-admin ${CONTEXT_FLAG} --clusterrole=cluster-admin --serviceaccount=kubernetes-dashboard:admin-user`);
    } catch(e) {}

    console.log(`
Run 'kubectl edit deployment kubernetes-dashboard ${CONTEXT_FLAG} -n kubernetes-dashboard'

Add the following to the spec.containers.args section:
  - --token-ttl=86400

To increase the token ttl to 24 hours.  Otherwise the token will expire in 30 minutes.  Frustating!
Make sure to run 'kubectl proxy' to access the dashboard`)
  });

program
  .command('token')
  .description('get access token for dashboard')
  .argument('<env>', 'project environment')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(async (env, opts) => {
    await init(env, opts);

    let corkKubeConfig = config.corkKubeConfig;
    let token;

    if( corkKubeConfig.platform == 'docker-desktop' ) {
      token = await kubectl.exec(`kubectl create token ${kubectl.getContextNsFlags(true)} -n kubernetes-dashboard --duration=720h admin-user`);
    } else if ( corkKubeConfig.platform == 'microk8s' ) {
      token = await kubectl.exec(`kubectl create token ${kubectl.getContextNsFlags(true)} default`);
    } else {
      console.error('This command is only for docker-desktop or microk8s contexts');
      process.exit(1);
    }

    console.log('\nToken:');
    console.log(token);
  });

program
  .command('proxy')
  .description('start kubectl proxy to access dashboard')
  .argument('<env>', 'project environment')
  .option('-o, --open', 'open browser to dashboard')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(async (env, opts) => {
    await init(env, opts);

    let corkKubeConfig = config.corkKubeConfig;
    if( corkKubeConfig.platform != 'docker-desktop' ) {
      console.error('This command is only for docker-desktop');
      process.exit
    }

    console.log('visit ' + ROOT_URL);

    if( opts.open ) {
      let namespace = kubectl.getNamespace();
      setTimeout(async () => { 
        namespace = await namespace;
        open(ROOT_URL+'#/pod?namespace='+namespace);
      }, 1000);
    }

    await kubectl.exec(`kubectl proxy ${kubectl.getContextNsFlags(true)}`);
  });

program
  .command('open')
  .description('open dashboard in browser')
  .action(async () => {
    // let namespace = await kubectl.getNamespace();
    // open(ROOT_URL+'#/pod?namespace='+namespace);
    open(ROOT_URL+'#/pod');
  });


program.parse(process.argv);