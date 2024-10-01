#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

const program = new Command();
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))).version;

program
  .name('cork-kube')
  .version(version)
  .command('apply', 'Apply a kustomize template with optional source mounts and local development configurations')
  .command('create-overlay', 'Create a new kustomize overlay')
  .command('dashboard', 'Kubernetes dashboard helper commands')
  .command('init', 'Initialize gcloud and kubectl for a projects environment')
  .command('project', 'Set user account or register config file to use for project')
  .command('status', 'Get the status of gcloud and kubectl')
  .command('stop', 'Stop all running services for a projects environment').alias('down')
  .command('start', 'Start all services for a projects environment').alias('up')
  .command('secrets', 'Deploy secrets from Google Cloud to a projects environment')

program.parse(process.argv);