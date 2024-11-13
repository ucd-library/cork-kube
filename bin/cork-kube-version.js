#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

const program = new Command();
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))).version;

program
  .action(() => {
    console.log(version);
  });
program.parse(process.argv);