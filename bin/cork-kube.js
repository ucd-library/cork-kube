#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();

program
  .name('cork-kube')
  .command('apply', 'Apply a kustomize template with optional source mounts and local development configurations')
  .command('build', 'Build a docker image for a project')
  .command('create-overlay', 'Create a new kustomize overlay')
  .command('dashboard', 'Kubernetes dashboard helper commands')
  .command('pod', 'helpers for executing a command or logging a pod')
  .command('init', 'Initialize gcloud and kubectl for a projects environment')
  .command('project', 'Set user account or register config file to use for project')
  .command('status', 'Get the status of gcloud and kubectl')
  .command('stop', 'Stop running services for a projects environment').alias('down')
  .command('start', 'Start services for a projects environment').alias('up')
  .command('restart', 'Rolling restart services for a projects environment')
  .command('secrets', 'Deploy secrets from Google Cloud to a projects environment')
  .command('version', 'Show the version of cork-kube')

program.parse(process.argv);