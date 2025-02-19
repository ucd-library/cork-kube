#!/usr/bin/env node

import { Command, Option } from 'commander';
import config from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import os from 'os';

const program = new Command();

program
  .command('set')
  .option('-p, --project <project>', 'Project to set email account for')
  .option('-e, --email <email>', 'User account to use for project')
  .option('-c, --config <config>', 'path to project config file')
  .option('-k, --kubeconfig-file <kubeconfigFile>', 'path to kubeconfig file for a project environment. Use [environment]:[path] to set a kubeconfig file for a environment.  Ex: microk8s:~/.kube/microk8s-config')
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

    if( opts.kubeconfigFile ) {
      if( !project && !opts.project ) {
        console.error(`Project name not provided`);
        process.exit(1);
      }
      if( !project ) project = opts.project;

      let parts = opts.kubeconfigFile.split(':');
      if( parts.length < 2 ) {
        console.error(`Invalid kubeconfig file format.  Use [environment]:[path]`);
        process.exit(1);
      }

      let environment = parts[0];
      let kubeconfigFile = parts[1];
      if( kubeconfigFile.match(/^~/) ) {
        kubeconfigFile = path.join(os.homedir(), kubeconfigFile.replace(/^~/, ''));
      }
      if( !path.isAbsolute(kubeconfigFile) ) {
        kubeconfigFile = path.resolve(process.cwd(), kubeconfigFile);
      }
      if( !fs.existsSync(kubeconfigFile) ) {
        console.error(`Kubeconfig file does not exist: ${kubeconfigFile}`);
        process.exit(1);
      }

      config.data.global[project] = config.data.global[project] || {};
      if( !config.data.global[project].env ) {
        config.data.global[project].env = {};
      }
      if( !config.data.global[project].env[environment] ) {
        config.data.global[project].env[environment] = {};
      }
      config.data.global[project].env[environment].kubeconfigFile = kubeconfigFile;
      console.log(`setting kubeconfig file location for ${project} environment ${environment} to ${kubeconfigFile}`);
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