#!/usr/bin/env node

import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import colors from 'colors';

const program = new Command();

program
  .argument('<env>', 'environment to initialize')
  .option('-c, --config <config>', 'path to config file')
  .action(async (env, opts) => {
    config.init(opts.config);

    if( !config.data.local ) {
      console.error(`Config file does not exist: ${config.localFile}`);
      process.exit(1);
    }

    let corkKubeConfig = config.data.local;
    let project = corkKubeConfig.project;

    if( !project ) {
      console.error(`Project name not found in config: ${config.localFile}`);
      process.exit(1);
    }

    if( !corkKubeConfig.environments[env] ) {
      console.error(`Environment ${env} not found in config: ${env}. Options: ${Object.keys(corkKubeConfig.environments).join(', ')}`);
      process.exit(1);
    }

    let projectAccount = config.data?.global?.[project]?.account;
    if( !projectAccount ) {
      projectAccountSet = false;
      console.warn(colors.yellow(`\n* No account registered for project: ${project}`));
      console.warn(`* Run: ${colors.green(`cork-kube set-account ${project} [email]`)} to set account`);
      console.warn(`* Initializing will proceed assuming account is already correct\n`);
    }

    corkKubeConfig = corkKubeConfig.environments[env];
    let gcloudConfig = await gcloud.getConfig();    
    let kubectlConfig = await kubectl.getConfig();

    console.log(`Initializing ${colors.green(env)} environment`);

    if( projectAccount != gcloudConfig.account ) {
      if( gcloudConfig.account ) {
        console.log(`\n💥 Account mismatch.  gcloud logged in with ${colors.yellow(gcloudConfig.account)} but ${colors.yellow(projectAccount)} is required`);
      } else {
        console.log(`\n💥 your are not logged in with gcloud`);
      }
      console.log(`
* Run: ${colors.green(`gcloud auth login`)} to login with correct account
* Or run: ${colors.green(` gcloud config configurations activate [configuration-name]`)} if you have multiple accounts
`);
      process.exit(1);
    }

    if( corkKubeConfig.project != gcloudConfig.project ) {
      console.log(` - Setting ${colors.green('gcloud project')} from ${colors.yellow(gcloudConfig.project)} to ${colors.green(corkKubeConfig.project)}`);
      await gcloud.setProject(corkKubeConfig.project);
    }

    if( corkKubeConfig.platform == 'docker-desktop' ) {
      if( kubectlConfig.context != 'docker-desktop' ) {
        console.log(` - Setting ${colors.green('kubectl context')} from ${colors.yellow(kubectlConfig.context)} to ${colors.green('docker-desktop')}`);
        await kubectl.setContext('docker-desktop');
      }
    } else if ( corkKubeConfig.platform == 'gke' ) {
      let context = `gke_${corkKubeConfig.project}_${corkKubeConfig.zone}_${corkKubeConfig.cluster}`;
      if( kubectlConfig.context != context ) {
        console.log(` - Setting ${colors.green('kubectl context')} from ${colors.yellow(kubectlConfig.context)} to ${colors.green(context)}`);
        let resp = await gcloud.setGkeContext(corkKubeConfig);
      } else if ( gcloudConfig.account != kubectlConfig.user ) {
        console.log(` - Setting ${colors.green('kubectl context')}, user do not match: gcloud=${gcloudConfig.account} kubectl=${kubectlConfig.user}`);
        let resp = await gcloud.setGkeContext(corkKubeConfig);
      }
    } else {
      console.error(`Unknown platform: ${corkKubeConfig.platform}`);
      process.exit(1);
    }

    if( corkKubeConfig.namespace != kubectlConfig.namespace ) {
      console.log(` - Setting default ${colors.green('kubectl namespace')} from ${colors.yellow(kubectlConfig.namespace)} to ${colors.green(corkKubeConfig.namespace)}`);
      await kubectl.setNamespace(corkKubeConfig.namespace);
    }

  });

program.parse(process.argv);