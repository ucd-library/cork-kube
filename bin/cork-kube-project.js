#!/usr/bin/env node

import { Command, Option } from 'commander';
import config from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

const program = new Command();

program
  .command('set')
  .option('-p, --project <project>', 'Project to set email account for')
  .option('-e, --email <email>', 'User account to use for project')
  .option('-c, --config <config>', 'path to project config file')
  .action(async (opts) => {
    let project = '';

    config.init();
    config.data.global = config.data.global || {};

    if( opts.config ) {
      if( !path.isAbsolute(opts.config) ) {
        opts.config = path.resolve(process.cwd(), opts.config);
      }
      if( fs.existsSync(opts.config) && fs.lstatSync(opts.config).isDirectory() ) {
        opts.config = path.join(opts.config, '.cork-kube-config');
      }
      if( !fs.existsSync(opts.config) ) {
        console.error(`Config file does not exist: ${opts.config}`);
        process.exit(1);
      }

      project = JSON.parse(fs.readFileSync(opts.config, 'utf-8')).project;
      if( !project ) {
        console.error(`Project name not found in config: ${opts.config}`);
        process.exit(1);
      }

      config.data.global[project] = config.data.global[project] || {};
      config.data.global[project].config = opts.config;
      console.log(`setting project config for ${project} to ${opts.config}`);
    }

    if( opts.email ) {
      if( !project && !opts.project ) {
        console.error(`Project name not provided`);
        process.exit(1);
      }
      if( !project ) project = opts.project;

      config.data.global[project] = config.data.global[project] || {};
      config.data.global[project].account = opts.email;
      console.log(`setting user account for ${project} to ${opts.email}`);
    }

    config.saveGlobal();
  });

program
  .command('list')
  .addOption(new Option('-o, --output <format>', 'output format').choices(['json', 'yaml']).default('yaml'))
  .action(async () => {
    config.init();
    if( program.output == 'json' ) {
      console.log(JSON.stringify(config.data.global, null, 2));
      return;
    }
    console.log(yaml.dump(config.data.global));
  });

program.parse(process.argv);