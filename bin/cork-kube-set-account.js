#!/usr/bin/env node

import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import colors from 'colors';

const program = new Command();

program
  .argument('<project>', 'Project to set account for')
  .argument('<email>', 'User account to use for project')
  .action(async (project, email) => {

    config.init();
    config.data.global = config.data.global || {};
    config.data.global[project] = config.data.global[project] || {};
    config.data.global[project].account = email;
    config.saveGlobal();

    console.log(`setting user account for ${project} to ${email}`);
  });

program.parse(process.argv);