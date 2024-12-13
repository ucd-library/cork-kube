import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import kubectl from './kubectl.js';
import localDevClean from './local-dev-clean.js';
import srcMounts from './src-mounts.js';
import jsonpath from 'jsonpath';
import colors from 'colors';

let quiet = false;

function resolve(file) {
  if (!path.isAbsolute(file)) {
    return path.resolve(process.cwd(), file);
  }
  return file;
}

function log(...args) {
  if( quiet != true ) {
    console.log(...args);
  }
}

async function apply(templateDir, opts, corkKubeConfig) {
  templateDir = resolve(templateDir);
  quiet = opts.quiet;

  let {templatePath, templates, name, usedOverlay} = await kubectl.renderKustomizeTemplates(templateDir, opts.overlay);
  log(`Applying ${colors.yellow(name)}: ${templateDir}`);
  log(` - Overlay: ${colors.yellow(usedOverlay)}`);
  log(` - Templates Found (${colors.yellow(templates.length)}): ${colors.yellow(templates.map(t => t.kind+'/'+t?.metadata?.name).join(', '))}`);
  
  if( opts.edit ) {
    templates.forEach(template => {
      opts.edit.forEach(edit => {
        let [match, exp, value] = edit.replace(/(^"|"$)/g, '').match(/(.*)=(.*)/);
        if( !match ) return;
        let used = false;
        exp = exp.replace(/'/g, '"');

        try {
          jsonpath.apply(template, exp, item => {
            log(` - Editing ${template.kind} ${colors.yellow(exp)} to ${colors.yellow(value)}`);
            used = true;
            return value;
          });
        } catch(e) {
          log(` - ${colors.red('Error')}: ${e.message}`);
          log(`  \\-> ${colors.yellow(exp)} in ${template.kind} ${template.metadata.name}`);
        }

        if( !used && opts.showUnusedEdits ) {
          log(` - ${colors.yellow('Warning')}: No match found for ${colors.yellow(exp)} in ${template.kind} ${template.metadata.name}`);
        }
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

      let highlight = colors.yellow(srcMountList.length+' source mounts');
      log(` - Applying ${highlight} from ${srcMountFile}`);
      srcMounts(templates, srcMountList);
    });
  }

  if( opts.localDev ) {
    log(' - Cleaning local development configurations');
    localDevClean(templates, log);
  } else if ( opts.localDevRemote ) {
    log(' - Cleaning local development configurations (remote)');
    localDevClean(templates, log, {keepImagePull: true});
  }

  if( opts.dryRun ) {
    console.log(templates.map(t => yaml.dump(t)).join('---\n'));
    return;
  }

  for( let template of templates ) {
    let output = await kubectl.apply(template, { isJson: true, stdin: true}, corkKubeConfig);
    if( output.stderr ) {
      console.error(output.stderr);
      process.exit(1);
    }
    if( output.stdout ) {
      console.log(output.stdout);
    }
  }

  log(''); // newline
}

export default apply;