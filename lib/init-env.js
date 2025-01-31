import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import colors from 'colors';

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
    console.error(`Environment ${env} not found in config: ${env}. Options: ${Object.keys(corkKubeConfig.environments).join(', ')}`);
    process.exit(1);
  }

  let projectAccount = config.data?.global?.[project]?.account;

  corkKubeConfig = corkKubeConfig.environments[env];
  corkKubeConfig.account = projectAccount;
  config.corkKubeConfig = corkKubeConfig;
  corkKubeConfig.configuration = corkKubeConfig.project+'-'+env;

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

//   if( projectAccount && projectAccount != gcloudConfig.account ) {
//     console.log(`\n💥 Account mismatch.  gcloud logged in with ${colors.yellow(gcloudConfig.account)} but ${colors.yellow(projectAccount)} is required`);
//     console.log(`
// * Run: ${colors.green(`gcloud auth login`)} to login with correct account
// * Or run: ${colors.green(` gcloud config configurations activate [configuration-name]`)} if you have multiple accounts
// `);
//     process.exit(1);
//   }


  // if( !projectAccount ) {
  //   console.warn(colors.yellow(`\n* No account registered for project: ${project}`));
  //   console.warn(`* Run: ${colors.green(`cork-kube set-account ${project} [email]`)} to set account`);
  //   console.warn(`* Initializing will proceed assuming ${gcloudConfig.account} account is already correct\n`);
  // }

  // if( corkKubeConfig.project != gcloudConfig.project ) {
  //   console.log(` - Setting ${colors.green('gcloud project')} from ${colors.yellow(gcloudConfig.project)} to ${colors.green(corkKubeConfig.project)}`);
  //   await gcloud.setProject(corkKubeConfig.project);
  // }

  if( corkKubeConfig.platform == 'docker-desktop' ) {
    // if( kubectlConfig.context != 'docker-desktop' ) {
    //   console.log(` - Setting ${colors.green('kubectl context')} from ${colors.yellow(kubectlConfig.context)} to ${colors.green('docker-desktop')}`);
    //   await kubectl.setContext('docker-desktop');
    // }
    corkKubeConfig.context = 'docker-desktop';
  } else if ( corkKubeConfig.platform == 'gke' ) {
    corkKubeConfig.context = `gke_${corkKubeConfig.project}_${corkKubeConfig.zone}_${corkKubeConfig.cluster}`;
    // if( kubectlConfig.context != context ) {
    //   console.log(` - Setting ${colors.green('kubectl context')} from ${colors.yellow(kubectlConfig.context)} to ${colors.green(context)}`);
    //   let resp = await gcloud.setGkeContext(corkKubeConfig);
    // } else if ( gcloudConfig.account != kubectlConfig.user ) {
    //   console.log(` - Setting ${colors.green('kubectl context')}, user do not match: gcloud=${gcloudConfig.account} kubectl=${kubectlConfig.user}`);
    //   let resp = await gcloud.setGkeContext(corkKubeConfig);
    // }
  } else {
    console.error(`Unknown platform: ${corkKubeConfig.platform}`);
    process.exit(1);
  }

  
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
    console.log(`Activating kubectl context: ${colors.green(corkKubeConfig.context)}`);
    await kubectl.setContext(corkKubeConfig.context);
  }

  let kubectlConfig = await kubectl.getConfig();
  if( corkKubeConfig.namespace != kubectlConfig.namespace ) {
    console.log(` - Setting default ${colors.green('kubectl namespace')} from ${colors.yellow(kubectlConfig.namespace)} to ${colors.green(corkKubeConfig.namespace)}`);
    await kubectl.setNamespace(corkKubeConfig.namespace);
  }

  return config;
}

export default init;