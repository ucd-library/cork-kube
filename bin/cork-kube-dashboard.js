import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import open from 'open';
import yaml from 'js-yaml';
import init from '../lib/init-env.js';

const program = new Command();

const ROOT_URL = 'http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/';

program
  .command('create')
  .description('create kubernetes dashboard for docker-desktop')
  .action(async (env, opts) => {    
    let kubectlConfig = await kubectl.getConfig();
    if( kubectlConfig?.context != 'docker-desktop' ) {
      console.error(`This command only works with docker-desktop context`);
      process.exit(1);
    }

    await kubectl.apply(config.DASHBOARD_URL);

    try {
      await kubectl.exec('kubectl create serviceaccount -n kubernetes-dashboard admin-user');
    } catch(e) {}
    
    try {
      await kubectl.exec('kubectl create clusterrolebinding admin-user-cluster-admin --clusterrole=cluster-admin --serviceaccount=kubernetes-dashboard:admin-user');
    } catch(e) {}

    console.log(`
Run 'kubectl edit deployment kubernetes-dashboard -n kubernetes-dashboard'

Add the following to the spec.containers.args section:
  - --token-ttl=86400"

To increase the token ttl to 24 hours.  Otherwise the token will expire in 30 minutes.  Frustating!
Make sure to run 'kubectl proxy' to access the dashboard`)
  });

program
  .command('token')
  .description('get access token for dashboard')
  .action(async () => {
    let token = await kubectl.exec('kubectl create token -n kubernetes-dashboard --duration=720h admin-user');
    console.log(token);
  });

program
  .command('proxy')
  .description('start kubectl proxy to access dashboard')
  .option('-o, --open', 'open browser to dashboard')
  .action(async (opts) => {
    console.log('visit ' + ROOT_URL);

    if( opts.open ) {
      let namespace = kubectl.getNamespace();
      setTimeout(async () => { 
        namespace = await namespace;
        open(ROOT_URL+'#/pod?namespace='+namespace);
      }, 1000);
    }

    await kubectl.exec('kubectl proxy');
  });

program
  .command('open')
  .description('open dashboard in browser')
  .action(async () => {
    let namespace = await kubectl.getNamespace();
    open(ROOT_URL+'#/pod?namespace='+namespace);
  });


program.parse(process.argv);