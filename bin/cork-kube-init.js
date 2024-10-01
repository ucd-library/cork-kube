import { Command } from 'commander';
import init from '../lib/init-env.js';

const program = new Command();

program
  .argument('<env>', 'environment to initialize')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .action(init);

program.parse(process.argv);