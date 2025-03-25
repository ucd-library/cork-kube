import config from './config.js';
import path from 'path';
import fs from 'fs';
import {exec} from 'child_process';


class TemplateConfig {
  constructor() {
    this.LOAD_DELIMINATOR = '##----------RENDERED-----------##';
    this.configCache = new Map();
  }

  /**
   * @method render
   * @description Replace variables in a string with key/value pairs
   * 
   * @param {String} value string to render
   * @param {Object} vars key/value pairs to replace in value
   * @returns {String} rendered string
   */
  render(value, vars) {
    let matches = value.match(/\$\{(.+?)\}/g);
    if( !matches ) return value;

    for( let match of matches ) {
      let key = match.replace(/\$\{|\}/g, '');
      let val = vars[key];
      if( val === undefined ) {
        console.error(`Variable ${key} not found`);
        process.exit(1);
      }
      value = value.replace(match, val);
    }
    return value;
  }

  async getVariables(opts) {
    let templateVars = Object.assign({}, process.env, {
      __DIRNAME : config.localDir,
      __ENV: opts.env,
      __LOCAL_DEV_REGISTRY: config?.data?.build?.localDevRegistry || config.LOCAL_DEV_REGISTERY
    });

    if( opts.config ) {
      for( let file of opts.config ) {
        let tmp;
        let filename = file?.file || file;

        if( path.parse(filename).ext == '.sh' ) {
          try {
            tmp = await this._loadShConfig(file, templateVars);
            if( opts.debug ) {
              console.log(`--- Loaded config file ${filename} ---`);
              console.log(JSON.stringify(tmp, null, 2));
            }
          } catch(e) {
            console.error(`Error loading config file ${filename}:`, e);
            process.exit(1);
          }
        } else if( !opts.quiet ) {
          console.warn(`Unsupported config file type: ${filename}`);
        }
        if( !tmp ) continue;
        templateVars = Object.assign(templateVars, tmp);
      }
    }

    return templateVars;
  }

  _loadShConfig(fileConfig, templateVars) {
    if( this.configCache.has(fileConfig) ) {
      return this.configCache.get(fileConfig);
    }
  
    let file, args={};
    if( typeof fileConfig === 'object' ) {
      file = fileConfig.file;
      args = fileConfig.args || {};
    } else {
      file = fileConfig;
    }
  
    file = this._makeAbsolute(file);
    let argStr = Object.keys(args).map(k => `${k}=${this.render(args[k], templateVars)}`).join('\n');
  
    if( !fs.existsSync(file) ) {
      console.error(`Config file does not exist: ${file}`);
      process.exit(1);
    }
  
    let contents = fs.readFileSync(file, 'utf8');
    contents = `set -o allexport;
  
  ${argStr}
  
  ${contents}
  echo "${this.LOAD_DELIMINATOR}"
  node -e "console.log(JSON.stringify(process.env))"`;
  
    return new Promise((resolve, reject) => {
      exec(contents, 
        {shell: '/bin/bash'},
        (error, stdout, stderr) => {
          if( error ) return reject({stdout, stderr, error});
          try {
            let result = JSON.parse(stdout.split(this.LOAD_DELIMINATOR)[1]);
            this.configCache.set(fileConfig, result);
            resolve(result);
          } catch(e) {
            reject(e);
          } 
        }
      )
    });
  }

  _makeAbsolute(p) {
    if( path.isAbsolute(p) ) return p;
    return path.resolve(config.localDir, p);
  }
  
}

const inst = new TemplateConfig();
export default inst;



