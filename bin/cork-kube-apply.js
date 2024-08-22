#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import kubectl from '../lib/kubectl.js';
import localDevClean from '../lib/local-dev-clean.js';
import srcMounts from '../lib/src-mounts.js';
import jsonpath from 'jsonpath';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))).version;
let verbose = false;

function resolve(file) {
  if (!path.isAbsolute(file)) {
    return path.resolve(process.cwd(), file);
  }
  return file;
}

function log(...args) {
  if( verbose ) {
    console.log(...args);
  }
}

program
  .name('cork-kube-apply')
  .argument('<root-directory>', 'root kustomize directory containing base and overlay directories')
  .version(version)
  .option('-o, --overlay <overlay-name>', 'overlay name to apply') 
  .option('-e, --edit <jsonpath=value...>', 'Edit a yaml value via jsonpath')
  // .option('-r, --remove <jsonpath>', 'Remove a yaml value via jsonpath')
  .option('-m, --source-mount <path...>', 'Path to source mounts file')
  .option('-l, --local-dev', 'Strip known local development configurations; resources, intended-for, etc')
  .option('-v, --verbose', 'Verbose output')
  .option('-d, --dry-run', 'Print templates to stdout without applying')
  .action(async (templateDir, opts) => {
    templateDir = resolve(templateDir);

    let templates = await kubectl.renderKustomizeTemplates(templateDir, opts.overlay);
    verbose = opts.verbose;
    
    if( opts.edit ) {
      templates.forEach(template => {
        opts.edit.forEach(edit => {
          let [match, exp, value] = edit.match(/(.*)=(.*)/);
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
            console.log(srcMountDir, mount.hostPath);
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