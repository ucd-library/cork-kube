#!/usr/bin/env node

import { Command } from 'commander';
import edit from '../lib/edit.js';

const program = new Command();

program
  .argument('<root-directory>', 'root kustomize directory containing base and overlay directories')
  .option('-o, --overlay <overlay-name>', 'overlay name to apply') 
  .requiredOption('-f, --filename <filename>', 'filename to edit') 
  .requiredOption('-e, --edit <jsonpath=value...>', 'Edit a yaml value via jsonpath')
  .option('-r, --replace', 'Replace the file with the edited version, instead of printing to stdout')
  .action(edit);

program.parse(process.argv);