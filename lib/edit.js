import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';
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

async function edit(templateDir, opts) {
  templateDir = resolve(templateDir);
  
  if( !opts.filename.endsWith('.yaml') && !opts.filename.endsWith('.yml') ) {
    opts.filename += '.yaml';
  }

  let templatePath;
  if( opts.overlay ) {
    templatePath = path.join(templateDir, 'overlays', opts.overlay, opts.filename);
  } else {
    templatePath = path.join(templateDir, 'base', opts.filename);
  }

  if( !fs.existsSync(templatePath) ) {
    console.error(`Template ${templatePath} not found`);
    process.exit(1);
  }

  let template = yaml.load(fs.readFileSync(templatePath, 'utf8'));

  if( opts.edit ) {
    opts.edit.forEach(edit => {
      let [match, exp, value] = edit.replace(/(^"|"$)/g, '').match(/(.*)=(.*)/);
      if( !match ) return;
      let used = false;
      exp = exp.replace(/'/g, '"');

      try {
        jsonpath.apply(template, exp, item => {
          used = true;
          return value;
        });
      } catch(e) {
        log(` - ${colors.red('Error')}: ${e.message}`);
        log(`  \\-> ${colors.yellow(exp)} in ${template.kind} ${template.metadata.name}`);
        process.exit(1);
      }
    });
  }

  if( opts.replace ) {
    fs.writeFileSync(templatePath, yaml.dump(template));
  } else {
    console.log(yaml.dump(template));
  }
}

export default edit;