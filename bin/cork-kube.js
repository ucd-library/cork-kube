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
  .command('init', 'Initialize gcloud and kubectl for a project')
  .command('status', 'Get the status of gcloud and kubectl')
  .command('init-overlay', 'Initialize a new overlay')

program.parse(process.argv);