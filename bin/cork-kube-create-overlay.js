#!/usr/bin/env node

import { Command } from 'commander';
import init from '../lib/init-overlay.js';
const program = new Command();

program
  .argument('<root-directory>', 'init kustomize overlay directory.  Root directory should be directory containing base directory')
  .argument('<overlay-name>', 'name of the overlay to create')
  .option('-f, --force', 'force overlay initialization, overwriting existing overlay')
  .option('-i, --ignore <type...>', 'ignore resource types, ex: Secret,ConfigMap')
  .option('-t, --tag-name <name>', 'use a specific tag name for images for the overlay')
  .action((rootDir, overlayName, opts) => {
    opts.overlayName = overlayName;
    console.log(`Initializing overlay in ${rootDir}`);
    init(rootDir, opts);
  });

program.parse(process.argv);