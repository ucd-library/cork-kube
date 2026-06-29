import { Command } from 'commander';
import init from '../lib/init-env.js';

const program = new Command();

program
  .description('Activate gcloud and kubectl configurations for a project environment')
  .argument('<env>', 'environment to activate')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .option('--use-env-kubeconfig', 'use KUBECONFIG environment variable value for --kubeconfig flag')
  .option('--context <context>', 'override kubectl context name')
  .action((env, opts) => init(env, opts, true));

program.parse(process.argv);