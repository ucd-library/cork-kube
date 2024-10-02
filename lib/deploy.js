import path from 'path';
import config from './config.js';
import apply from './apply.js';
import fs from 'fs';
import kubectl from './kubectl.js';
import {exec} from 'child_process';
import gcloud from './gcloud.js';
import colors from 'colors';
import yaml from 'js-yaml';
import os from 'os';

class Deploy {

  constructor() {
    this.LOAD_DELIMINATOR = '##----------RENDERED-----------##';
    this.configCache = new Map();
  }

  async all(env, debug=false) {
    let c = config.data.local;
    if( !c ) {
      console.error(`Config file does not exist: ${config.localFile}`);
      process.exit(1);
    }

    for( let service of c.services ) {
      await this.service(service.name, env, debug);
    }
  }

  async service(serviceName, env, debug) {
    let c = await this.renderTemplate(serviceName, env);

    if( debug ) {
      console.log(`--- Cork Kube Service Config ---`);
      console.log(JSON.stringify(c, null, 2));
      console.log(`\n--- Kubernetes Config ---`);
      c.dryRun = true;
      c.quiet = true;
    }

    await apply(c.path, c);
  }

  async secrets(env, opts={}) {
    let c = config.data.local;

    let secrets = c?.secrets?.[env];
    if( !secrets ) {
      console.error(`Secrets not found for environment ${env}`);
      process.exit(1);
    }

    let currentSecrets = await kubectl.getSecrets();
    let currentConfigMaps = await kubectl.getConfigMaps();

    for( let secret of secrets ) {
      if( currentSecrets.includes(secret.k8sName) || currentConfigMaps.includes(secret.k8sName) ) {
        if( opts.redeploy ) {
          console.log(colors.yellow(`Removing secret ${secret.k8sName}`));

          if( secret.kubeconfig ) {
            await kubectl.delete('configmap', secret.k8sName);
          } else {
            await kubectl.delete('secret', secret.k8sName);
          }
        } else {
          continue;
        }
      }

      await this.secret(secret.k8sName, env);
    }
  }

  async secret(secretName, env) {
    let c = config.data.local;

    let secrets = c?.secrets?.[env];
    if( !secrets ) {
      console.error(`Secrets not found for environment ${env}`);
      process.exit(1);
    }

    let secret = secrets.find(s => s.k8sName == secretName);
    if( !secret ) {
      console.error(`Secret ${secretName} not found in env ${env} in config: ${config.localFile}`);
      process.exit(1);
    }

    if( secret.kubeconfig ) {
      this.kubeconfig(env, secret.k8sName);
      return;
    }

    console.log(`Deploying secret ${colors.green(secret.k8sName)}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-kube-'));
    
    try {
      let cliFlags = [];
      for( let mapping of secret.mappings ) {
        let contents = await gcloud.getSecret(mapping.gcsmName);
        let file = path.join(tmpDir, mapping.k8sProperty);
        fs.writeFileSync(file, contents);

        console.log(` - Adding ${colors.green(mapping.k8sProperty)} from gcsm secret ${colors.green(mapping.gcsmName)}`);
        cliFlags.push({
          property : mapping.k8sProperty,
          file : file
        });
      }

      let output = await kubectl.createSecret(secret.k8sName, cliFlags);
    } catch(e) {
      console.error(e);
    }

    fs.rmSync(tmpDir, {recursive: true});
  }

  async remove(serviceName, env) {
    let c = await this.renderTemplate(serviceName, env);

    let {templates} = await kubectl.renderKustomizeTemplates(c.path, c.overlay);
    for( let template of templates ) {
      let {stdout} = await kubectl.delete(template.kind.toLowerCase(), template.metadata.name);
      console.log(stdout.trim());
    }
  }

  async renderTemplate(serviceName, env, opts={}) {
    let c = config.data.local;
    
    if( !c ) {
      console.error(`Config file does not exist: ${config.localFile}`);
      process.exit(1);
    }

    let service = c.services.find(s => s.name == serviceName);
    if( !service ) {
      console.error(`Service ${service} not found in config: ${config.localFile}`);
      process.exit(1);
    }

    let envConfig = service?.environments?.[env];
    if( env && !envConfig ) {
      if( !opts.quiet ) {
        console.warn(`Environment ${env} not found for service ${serviceName}. Using overlay=${env}`);
      }
      envConfig = {overlay: env};
    }
    if( !envConfig ) envConfig = {};

    let serviceTemplates = [];
    this._asArray(service.template).forEach(t => serviceTemplates.push(this.getServiceTemplate(c, t)));
    this._asArray(envConfig.template).forEach(t => serviceTemplates.push(this.getServiceTemplate(c, t)));

    c = this._merge(service, envConfig, ...serviceTemplates);

    if( !c.path ) {
      console.error(`No path defined for service ${service}`);
      process.exit(1);
    }

    let result = {
      name : c.name[0],
      path : c.path[0],
      group : c.group || [],
    }

    let templateVars = Object.assign({}, process.env, {
      __DIRNAME : config.localDir
    });

    if( c.config ) {
      for( let file of c.config ) {
        let tmp;
        let filename = file?.file || file;

        if( path.parse(filename).ext == '.sh' ) {
          tmp = await this._loadShConfig(file);
        } else if( !opts.quiet ) {
          console.warn(`Unsupported config file type: ${filename}`);
        }
        if( !tmp ) continue;
        templateVars = Object.assign(templateVars, tmp);
      }
    }

    if( c.edit ) {
      c.edit.forEach(e => {
        if( !e.jsonpath ) {
          console.error(`No jsonpath defined for edit ${e}`);
          process.exit(1);
        }
        if( !e.value ) {
          console.error(`No value defined for edit ${e}`);
          process.exit(1);
        }
      });
      result.edit = c.edit.map(e => this._renderTemplateVars(e.jsonpath+"="+e.value, templateVars));
    }

    if( c.sourceMount ) {
      result.sourceMount = c.sourceMount.map(m => this._makeAbsolute(this._renderTemplateVars(m, templateVars)));
    }

    if( c.overlay ) {
      result.overlay = c.overlay.map(o => this._renderTemplateVars(o, templateVars));
    }

    if( c.localDev && c.localDev.length && c.localDev[0] === true ) {
      result.localDev = true;
    }

    return result;
  }

  getServiceTemplate(config, templateName) {
    return config?.serviceTemplates?.[templateName] || {};
  }

  async kubeconfig(env, propertyName) {
    let c = config.data.local;

    let envConfig = c?.environments?.[env];
    if( !envConfig ) {
      console.error(`Environment not found ${env}`);
      process.exit(1);
    }

    if( envConfig.platform !== 'docker-desktop' ) {
      console.error(`Kubeconfig injection only supported for docker-desktop environments`);
      process.exit(1);
    }

    let kubeconfig = path.join(os.homedir(), '.kube', 'config');
    kubeconfig = yaml.load(fs.readFileSync(kubeconfig, 'utf8'));
    let cluster = kubeconfig.clusters.find(c => c.name == 'docker-desktop');
    cluster.server = 'https://kubernetes.docker.internal:6443';

    console.log(`Injecting kubeconfig into k8s configmap as ${propertyName}`);

    try {
      await kubectl.exec(`kubectl create clusterrolebinding ${envConfig.namespace}-cluster-admin \
    --clusterrole=cluster-admin \
    --serviceaccount=${envConfig.namespace}:default`)
    } catch(e) {}

    try {
      await kubectl.delete('configmap', propertyName);
    } catch(e) {}

    let tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-kube-'));
    fs.writeFileSync(path.join(tmpdir, 'kubeconfig'), yaml.dump(kubeconfig));
    try {
      await kubectl.exec(`kubectl create configmap ${propertyName} --from-file=kubeconfig=${path.join(tmpdir, 'kubeconfig')}`);
    } catch(e) {
      console.error(e);
    }
    fs.rmSync(tmpdir, {recursive: true});
  }

  _asArray(value) {
    if( value === undefined ) return [];
    if( Array.isArray(value) ) return value;
    return [value];
  }

  _renderTemplateVars(value, vars) {
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

  _merge(...args) {
    let out = {};
    for( let arg of args ) {
      if( !arg ) continue;
      for( let key in arg ) {
        if( out[key] ) {
          out[key].push(...this._asArray(arg[key]));
        } else {
          out[key] = this._asArray(arg[key]);
        };
      }
    }
    return out;
  }

  _makeAbsolute(p) {
    if( path.isAbsolute(p) ) return p;
    return path.resolve(config.localDir, p);
  }

  _loadShConfig(fileConfig) {
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
    let argStr = Object.keys(args).map(k => `${k}=${args[k]}`).join('\n');

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
          if( error ) return reject(error);
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
}

const inst = new Deploy();
export default inst;