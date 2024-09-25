#!/usr/bin/env node

import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import yaml from 'js-yaml';

const program = new Command();


program
  .addOption(new Option('-o, --output <format>', 'output format').choices(['json', 'yaml']).default('yaml'))
  .action(async (cmd) => {
    let config = await gcloud.getConfig();    
    let gcloudConfig = {
      project: config.project,
      account: config.account
    };
    let kubectlConfig = await kubectl.getConfig();

    let resp = {
      gcloud: gcloudConfig,
      kubectl: kubectlConfig
    };

    if( cmd.output == 'json' ) {
      console.log(JSON.stringify(resp, null, 2));
      return;
    } 
    console.log(yaml.dump(resp));
  });

program.parse(process.argv);