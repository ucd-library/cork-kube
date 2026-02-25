import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import colors from 'colors';
import os from 'os';
import path from 'path';
import fs from 'fs';
import buildDependencies from '../lib/build-dependencies.js';


async function init(env, opts, activate=false) {

  config.init(opts.config, {project: opts.project});

  if( !config.data.local ) {
    console.error(`Config file does not exist: ${config.localFile}`);
    process.exit(1);
  }

  let corkKubeConfig = config.data.local;
  let project = corkKubeConfig.project;
  let authEnvFlagSet = process.env.GOOGLE_APPLICATION_CREDENTIALS ? true : false;

  if( !project ) {
    console.error(`Project name not found in config: ${config.localFile}`);
    process.exit(1);
  }

  console.log(`Using ${colors.green(env)} environment for project ${colors.green(project)}`);

  if( !corkKubeConfig.environments[env] ) {
    console.error(`Environment ${env} not found in config: ${config.localFile}. Options: ${Object.keys(corkKubeConfig.environments).join(', ')}`);
    process.exit(1);
  }

  let projectAccount = config.data?.global?.[project]?.account;
  let environments = corkKubeConfig.environments;

  corkKubeConfig = corkKubeConfig.environments[env];
  if( corkKubeConfig.alias ) {
    let alias = corkKubeConfig.alias;
    if( !environments[alias] ) {
      console.error(`Alias config ${alias} not found in config: ${config.localFile}`);
      process.exit(1);
    }

    console.log(` - Alias for: ${colors.green(corkKubeConfig.alias)}`);

    let aliasCorkKubeConfig = environments[alias];
    corkKubeConfig = Object.assign({}, aliasCorkKubeConfig, corkKubeConfig);
    corkKubeConfig.env = env;
    corkKubeConfig.alias = alias;
  } else {
    corkKubeConfig.env = env;
  }

  if( !corkKubeConfig.project ) {
    console.error(`No cloud project not defined for environment ${env} in config: ${config.localFile}`);
    process.exit(1);
  }

  if( !corkKubeConfig.platform ) {
    console.error(`Platform not defined for environment ${env} in config: ${config.localFile}`);
    process.exit(1);
  }


  corkKubeConfig.account = projectAccount;
  config.corkKubeConfig = corkKubeConfig;
  corkKubeConfig.configuration = corkKubeConfig.project+'-'+env;

  corkKubeConfig.gitInfo = await buildDependencies.gitInfo(path.dirname(config.localFile));

  let configurations = await gcloud.getConfigurations();
  let gcloudConfig = configurations.find(c => c.name == corkKubeConfig.configuration);

  if( !gcloudConfig ) {
    console.log(`\n💥 Configuration ${colors.yellow(corkKubeConfig.configuration)} not found`);
    console.log(`Creating new configuration...`);
    await gcloud.createConfiguration(corkKubeConfig);
    gcloudConfig = (await gcloud.getConfigurations()).find(c => c.name == corkKubeConfig.configuration);
  }
  gcloudConfig = gcloudConfig.properties;

  if( authEnvFlagSet && !projectAccount ) {
    console.log(`\n💥 GOOGLE_APPLICATION_CREDENTIALS environment variable is set and no email register for project`);
    corkKubeConfig.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  } else if( projectAccount) {
    if( gcloudConfig.core.account != projectAccount ) {
      console.log(` - Setting gcloud configuration ${colors.yellow(corkKubeConfig.configuration)} account to ${colors.green(projectAccount)}`);
      await gcloud.setConfigurationProperty(corkKubeConfig.configuration, 'core/account', projectAccount);
      gcloudConfig = (await gcloud.getConfigurations()).find(c => c.name == corkKubeConfig.configuration);
      gcloudConfig = gcloudConfig.properties;
    }
  } else if( !gcloudConfig.core.account  ) {
    console.log(`\n💥 You have not set your default account for this project`);
    console.log(`
* Run: ${colors.green(`cork-kube project set -p ${project} -e [account-email]`)} to set account`);
    process.exit(1);
  }

  if( authEnvFlagSet && corkKubeConfig.keyFile ) {
    console.log(` - Activating service account from ${colors.green(corkKubeConfig.keyFile)}`);
    await gcloud.activateServiceAccount(corkKubeConfig);
  }

  if( gcloudConfig.core.project != corkKubeConfig.project ) {
    console.log(` - Setting gcloud configuration ${colors.yellow(corkKubeConfig.configuration)} project to ${colors.green(corkKubeConfig.project)}`);
    await gcloud.setConfigurationProperty(corkKubeConfig.configuration, 'project', corkKubeConfig.project);
  }

  if( gcloudConfig.compute.zone != corkKubeConfig.zone ) {
    console.log(` - Setting gcloud configuration ${colors.yellow(corkKubeConfig.configuration)} zone to ${colors.green(corkKubeConfig.zone)}`);
    await gcloud.setConfigurationProperty(corkKubeConfig.configuration, 'compute/zone', corkKubeConfig.zone);
  }

  // handle k8s context
  let kubeconfig = corkKubeConfig.kubeconfig || {};

  if( corkKubeConfig.platform == 'docker-desktop' ) {
    corkKubeConfig.context = kubeconfig.context || 'docker-desktop';
  } else if( corkKubeConfig.platform == 'microk8s' ) {
    corkKubeConfig.context = kubeconfig.context || `${project}-${env}-microk8s`;
  } else if ( corkKubeConfig.platform == 'gke' ) {
    corkKubeConfig.context = `gke_${corkKubeConfig.project}_${corkKubeConfig.zone}_${corkKubeConfig.cluster}`;
  } else {
    console.error(`Unknown platform: ${corkKubeConfig.platform}`);
    process.exit(1);
  }

  // load the kubeconfig file
  let kubeconfigFile = kubectl.DEFAULT_KUBECONFIG;
  if( kubeconfig.file ) {
    file = path.join(os.homedir(), '.kube', kubeconfig.file);
  } else if( corkKubeConfig.platform === 'microk8s' ) {
    kubeconfigFile = path.join(os.homedir(), '.kube', `${project}-${env}-microk8s-config`);
  }
  if( !fs.existsSync(kubeconfigFile) ) {
    console.log(`\n💥 Kubeconfig file ${colors.yellow(kubeconfigFile)} not found`);
    if( kubeconfig.secret ) {
      console.log(` - Fetching kubeconfig file from secret: ${colors.green(kubeconfig.secret)}`);
      let key = await gcloud.getSecret(kubeconfig.secret, corkKubeConfig);
      fs.writeFileSync(kubeconfigFile, key);
    }
  }

  kubectl.setRuntimeParams({
    context: corkKubeConfig.context,
    namespace: corkKubeConfig.namespace || 'default',
    kubeconfigFile
  });

  let kubeContexts = await kubectl.getContexts();
  let k8sContextExists = kubeContexts.find(c => c == corkKubeConfig.context) ? true : false;

  if( !k8sContextExists ) {
    if( corkKubeConfig.platform == 'gke' ) {
      console.log(`\n💥 Context ${colors.yellow(corkKubeConfig.context)} not found`);
      console.log(`Creating new context...`);
      // get the current context
      let currentContext = await kubectl.getCurrentContext();
      // get the credentials for the gke cluster
      // this switches the context to the gke cluster
      await gcloud.setGkeContext(corkKubeConfig);
      // switch back to the original context
      if( currentContext ) {
        await kubectl.setContext(currentContext);
      }
    } else {
      console.error(`💥 Context ${corkKubeConfig.context} not found.  Unable to create context for platform ${corkKubeConfig.platform}`);
      process.exit(1);
    }
  }

  if( activate ) {
    console.log(`Activating gcloud configuration: ${colors.green(corkKubeConfig.configuration)}`);
    await gcloud.activateConfiguration(corkKubeConfig.configuration);
    if( corkKubeConfig.platform == 'gke' ) {
      console.log(`Fetching auth from GKE cluster: ${colors.green(corkKubeConfig.cluster)}`);
      await gcloud.setGkeContext(corkKubeConfig);
    }
    console.log(`Using kubectl config: ${colors.green(kubeconfigFile)}`);
    console.log(`Activating kubectl context: ${colors.green(corkKubeConfig.context)}`);
    await kubectl.setContext(corkKubeConfig.context);

    if( kubeconfigFile != kubectl.DEFAULT_KUBECONFIG) {
      console.log(`
Run the following command to set the kubeconfig file for this terminal session:
${colors.blue(`export KUBECONFIG=${kubeconfigFile}`)}
`);
    }

    let kubectlConfig = await kubectl.getConfig();
    if( corkKubeConfig.namespace != kubectlConfig.namespace ) {
      console.log(` - Setting default ${colors.green('kubectl namespace')} from ${colors.yellow(kubectlConfig.namespace)} to ${colors.green(corkKubeConfig.namespace)}`);
      await kubectl.setNamespace(corkKubeConfig.namespace);
    }
  }

  return config.corkKubeConfig.env;
}

export default init;