#!/usr/bin/env node

import { Command } from 'commander';
import apply from '../lib/apply.js';
import kubectl from '../lib/kubectl.js';

const program = new Command();

program
  .argument('<root-directory>', 'root kustomize directory containing base and overlay directories')
  .option('-o, --overlay <overlay-name>', 'overlay name to apply') 
  .option('-e, --edit <jsonpath=value...>', 'Edit a yaml value via jsonpath')
  .option('-m, --source-mount <path...>', 'Path to source mounts file.  More Info: https://github.com/ucd-library/cork-kube?tab=readme-ov-file#source-mount-file')
  .option('-l, --local-dev', 'Strip known local development configurations; resources, nodeSelector, imagePullPolicy=Always')
  .option('--local-dev-remote', 'Just like --local-dev but keeps imagePullPolicy=Always.  Useful for remote images')
  .option('-q, --quiet', 'No output')
  .option('-s, --show-unused-edits', 'Show edit commands that did not match')
  .option('-d, --dry-run', 'Print templates to stdout without applying')
  .option('--use-env-kubeconfig', 'use KUBECONFIG environment variable value for --kubeconfig flag')
  .action(async (templateDir, opts) => {
    if( opts.useEnvKubeconfig ) {
      if( !process.env.KUBECONFIG ) {
        console.error('KUBECONFIG environment variable is not set');
        process.exit(1);
      }
      kubectl.setRuntimeParams({ kubeconfigFile: process.env.KUBECONFIG });
    }
    await apply(templateDir, opts);
  });

program.parse(process.argv);