#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import kubectl from '../lib/kubectl.js';
import localDevClean from '../lib/local-dev-clean.js';
import srcMounts from '../lib/src-mounts.js';
import jsonpath from 'jsonpath';

const program = new Command();
let quite = false;

function resolve(file) {
  if (!path.isAbsolute(file)) {
    return path.resolve(process.cwd(), file);
  }
  return file;
}

function log(...args) {
  if( quite != true ) {
    console.log(...args);
  }
}

program
  .argument('<root-directory>', 'root kustomize directory containing base and overlay directories')
  .option('-o, --overlay <overlay-name>', 'overlay name to apply') 
  .option('-e, --edit <jsonpath=value...>', 'Edit a yaml value via jsonpath')
  .option('-m, --source-mount <path...>', 'Path to source mounts file.  More Info: https://github.com/ucd-library/cork-kube?tab=readme-ov-file#source-mount-file')
  .option('-l, --local-dev', 'Strip known local development configurations; resources, nodeSelector, imagePullPolicy=Always')
  .option('-q, --quite', 'No output')
  .option('-d, --dry-run', 'Print templates to stdout without applying')
  .action(async (templateDir, opts) => {
    templateDir = resolve(templateDir);

    let {templatePath, templates} = await kubectl.renderKustomizeTemplates(templateDir, opts.overlay);
    log(`Applying ${templatePath} with ${templates.length} templates`);
    quite = opts.quite;
    
    if( opts.edit ) {
      templates.forEach(template => {
        opts.edit.forEach(edit => {
          let [match, exp, value] = edit.replace(/(^"|"$)/g, '').match(/(.*)=(.*)/);
          if( !match ) return;

          jsonpath.apply(template, exp, item => {
            log(`Editing ${template.kind} ${exp} to ${value}`);
            return value;
          });
        });
      });
    }

    if( opts.sourceMount ) {
      opts.sourceMount.forEach(srcMountFile => {
        srcMountFile = resolve(srcMountFile);
        let srcMountDir = path.dirname(srcMountFile);
        let srcMountList = JSON.parse(fs.readFileSync(srcMountFile, 'utf8'));

        srcMountList.forEach(mount => {
          if( !path.isAbsolute(mount.hostPath) ) {
            mount.hostPath = path.resolve(srcMountDir, mount.hostPath);
          }
        });

        log(`Applying source mounts from ${srcMountFile}. ${srcMountList.length} mounts found.`);
        srcMounts(templates, srcMountList);
      });
    }

    if( opts.localDev ) {
      log('Cleaning local development configurations');
      localDevClean(templates);
    }

    if( opts.dryRun ) {
      console.log(templates.map(t => yaml.dump(t)).join('---\n'));
      return;
    }

    for( let template of templates ) {
      let output = await kubectl.apply(template, { isJson: true, stdin: true});
      if( output.stderr ) {
        console.error(output.stderr);
        process.exit(1);
      }
      if( output.stdout ) {
        console.log(output.stdout);
      }
    }
  })

program.parse(process.argv);