#!/usr/bin/env node

import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import path from 'path';
import fs from 'fs';
import colors from 'colors';

const program = new Command();

program
  .argument('<env>', 'environment to initialize')
  .option('-c, --config <config>', 'path to config file')
  .action(async (env, opts) => {
    if( !opts.config ) {
      opts.config = path.resolve(process.cwd(), '.cork-kube-config');
    } else {
      if( !path.isAbsolute(opts.config) ) {
        opts.config = path.resolve(process.cwd(), opts.config);
      }
    }

    if( fs.existsSync(opts.config) && fs.lstatSync(opts.config).isDirectory() ) {
      opts.config = path.join(opts.config, '.cork-kube-config');
    }

    if( !fs.existsSync(opts.config) ) {
      console.error(`Config file does not exist: ${opts.config}`);
      process.exit(1);
    }

    let corkKubeConfig = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));

    if( !corkKubeConfig[env] ) {
      console.error(`Environment ${env} not found in config: ${env}. Options: ${Object.keys(corkKubeConfig).join(', ')}`);
      process.exit(1);
    }
    corkKubeConfig = corkKubeConfig[env];
    let gcloudConfig = await gcloud.getConfig();    
    let kubectlConfig = await kubectl.getConfig();

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