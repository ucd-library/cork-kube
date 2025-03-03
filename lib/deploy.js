import path from 'path';
import config from './config.js';
import apply from './apply.js';
import fs from 'fs';
import kubectl from './kubectl.js';
import gcloud from './gcloud.js';
import colors from 'colors';
import yaml from 'js-yaml';
import os from 'os';
import templateConfig from './template-config.js';

class Deploy {

  constructor() {
    this.NO_REMOVE_KINDS = ['PersistentVolumeClaim', 'PersistentVolume', 'Service'];
  }

  async all(env, opts={}) {
    let c = config.data.local;
    if( !c ) {
      console.error(`Config file does not exist: ${config.localFile}`);
      process.exit(1);
    }

    for( let service of c.services ) {
      await this.service(service.name, env, opts);
    }
  }

  async service(serviceName, env, opts={}) {
    if( typeof opts !== 'object' ) {
      opts = {debug: opts};
    }

    let corkKubeConfig = config.corkKubeConfig;
    let c = await this.renderTemplate(serviceName, env, opts);
    if( c.ignore ) {
      console.log(`Skipping service ${c.name}, ignore flag set\n`);
      return;
    }

    if( opts.debug ) {
      console.log(`--- Cork Kube Service Config ---`);
      console.log(JSON.stringify(c, null, 2));
      console.log(`\n--- Kubernetes Config ---`);
      c.dryRun = true;
      c.quiet = true;
    }

    await apply(c.path, c, corkKubeConfig);
  }

  async removeSecret(name, currentSecrets, currentConfigMaps) {
    let corkKubeConfig = config.corkKubeConfig;

    if( !currentSecrets ) {
      currentSecrets = await kubectl.getSecrets(corkKubeConfig);
    } 
    if( !currentConfigMaps ) {
      currentConfigMaps = await kubectl.getConfigMaps(corkKubeConfig);
    }
  
    if( currentSecrets.includes(name) ) {
      console.log(colors.yellow(`Removing secret ${name}`));
      await kubectl.delete('secret', name, corkKubeConfig);
    } else if( currentConfigMaps.includes(name) ) {
      console.log(colors.yellow(`Removing configMap ${name}`));
      await kubectl.delete('configmap', name, corkKubeConfig);
    }
  }

  async secrets(env) {
    let c = config.data.local;
    let corkKubeConfig = config.corkKubeConfig;

    let secrets = c?.secrets?.[env];
    if( !secrets ) {
      console.error(`Secrets not found for environment ${env}`);
      process.exit(1);
    }

    let currentSecrets = await kubectl.getSecrets(corkKubeConfig);
    let currentConfigMaps = await kubectl.getConfigMaps(corkKubeConfig);

    for( let secret of secrets ) {
      await this.removeSecret(secret.k8sName, currentSecrets, currentConfigMaps);
      await this.secret(secret.k8sName, env);
    }
  }

  async secret(secretName, env) {
    let corkKubeConfig = config.corkKubeConfig;
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
      await this.kubeconfig(env, secret.k8sName);
      return;
    }

    console.log(`Deploying secret ${colors.green(secret.k8sName)}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-kube-'));
    
    try {
      let cliFlags = [];
      for( let mapping of secret.mappings ) {
        let contents = await gcloud.getSecret(mapping.gcsmName, corkKubeConfig);
        let file = path.join(tmpDir, mapping.k8sProperty || mapping.gcsmName);
        fs.writeFileSync(file, contents);

        console.log(` - Adding ${colors.green(mapping.k8sProperty || '')} from gcsm secret ${colors.green(mapping.gcsmName)}`);
        cliFlags.push({
          property : mapping.k8sProperty,
          file : file,
          fromEnvFile : mapping.fromEnvFile
        });
      }

      let output = await kubectl.createSecret(secret.k8sName, cliFlags, corkKubeConfig);
    } catch(e) {
      console.error(e);
    }

    fs.rmSync(tmpDir, {recursive: true});
  }

  async remove(serviceName, env) {
    let c = await this.renderTemplate(serviceName, env);
    let corkKubeConfig = config.corkKubeConfig;

    if( c.ignore ) {
      console.log(`Skipping removal of ${c.name}, ignore flag set\n`);
      return;
    }

    let {templates} = await kubectl.renderKustomizeTemplates(c.path, c.overlay);
    for( let template of templates ) {
      if( this.NO_REMOVE_KINDS.includes(template.kind) ) {
        console.log(`Skipping removal of ${template.kind} ${template.metadata.name}`);
        continue;
      }
      console.log(`Removing ${template.kind} ${template.metadata.name}`);

      let {stdout, stderr} = await kubectl.delete(template.kind.toLowerCase(), template.metadata.name, corkKubeConfig);
      if( stdout ) console.log(stdout.trim());
      if( stderr ) console.error(stderr);
    }
  }

  async restart(serviceName, env) {
    let c = await this.renderTemplate(serviceName, env);
    let corkKubeConfig = config.corkKubeConfig;

    if( c.ignore ) {
      console.log(`Skipping restart of ${c.name}, ignore flag set\n`);
    }

    let {templates} = await kubectl.renderKustomizeTemplates(c.path, c.overlay);
    for( let template of templates ) {
      if( !['StatefulSet', 'Deployment', 'DaemonSet'].includes(template.kind) ) {
        console.log(`Skipping restart of ${template.kind}/${template.metadata.name}\n`);
        continue;
      }

      let {stdout, stderr} = await kubectl.restart(template.kind.toLowerCase(), template.metadata.name, corkKubeConfig);
      if( stdout ) console.log(stdout.trim());
      if( stderr ) console.error(stderr);
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
      console.error(`Service ${serviceName} not found in config: ${config.localFile}`);
      process.exit(1);
    }

    let envConfig = service?.environments?.[env];
    if( env && !envConfig ) {
      if( !opts.quiet ) {
        console.log(`No environment ${colors.yellow(env)} found for service ${colors.yellow(serviceName)}. Using ${colors.yellow(`overlay=${env}`)}`);
      }
      envConfig = {overlay: env};
    }
    if( !envConfig ) envConfig = {};

    if( !envConfig.overlay ) {
      if( !opts.quiet ) {
        console.log(`No overlay specified in ${colors.yellow(env)} found for service ${colors.yellow(serviceName)}. Using ${colors.yellow(`overlay=${env}`)}`);
      }
      envConfig.overlay = env;
    }

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
      ignore : c.ignore || false,
      group : c.group || [],
    }

    if( result.ignore ) {
      return result;
    }

    let templateVars = await templateConfig.getVariables({
      config: c.config, 
      debug: opts.debug,
      quiet: opts.quiet,
      env
    });

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
      result.edit = c.edit.map(e => templateConfig.render(e.jsonpath+"="+e.value, templateVars));
    }

    if( c.sourceMount && !opts.ignoreSourceMounts ) {
      result.sourceMount = c.sourceMount.map(m => this._makeAbsolute(templateConfig.render(m, templateVars)));
    }

    if( c.overlay ) {
      result.overlay = c.overlay.map(o => templateConfig.render(o, templateVars));
    }

    if( c.localDev && c.localDev.length && c.localDev[0] === true ) {
      result.localDev = true;
    } else if ( c.localDevRemote && c.localDevRemote.length && c.localDevRemote[0] === true ) {
      result.localDevRemote = true;
    }

    return result;
  }

  getServiceTemplate(config, templateName) {
    return config?.serviceTemplates?.[templateName] || {};
  }

  async kubeconfig(env, propertyName) {
    let c = config.data.local;
    let corkKubeConfig = config.corkKubeConfig;
    let kubeconfig = config.data?.global?.[corkKubeConfig.project]?.env?.[env]?.kubeconfigFile;

    let envConfig = c?.environments?.[env];
    if( !envConfig ) {
      console.error(`Environment not found ${env}`);
      process.exit(1);
    }

    if( envConfig.platform !== 'docker-desktop' && envConfig.platform !== 'microk8s' ) {
      console.error(`Kubeconfig injection only supported for docker-desktop environments`);
      process.exit(1);
    }

    if( !kubeconfig ) {
      kubeconfig = path.join(os.homedir(), '.kube', 'config');
    }

    kubeconfig = yaml.load(fs.readFileSync(kubeconfig, 'utf8'));
    let cluster = kubeconfig.clusters.find(c => c.name == envConfig.context);

    if( env.platform === 'docker-desktop' ) {
      cluster.server = 'https://kubernetes.docker.internal:6443';
    }

    console.log(`Injecting kubeconfig into k8s configmap as ${propertyName}`);

    try {
      let cFlag = kubectl.getContextNsFlags(true);
      await kubectl.exec(`kubectl create clusterrolebinding ${envConfig.namespace}-cluster-admin \
    ${cFlag} \
    --clusterrole=cluster-admin \
    --serviceaccount=${envConfig.namespace}:default`)
    } catch(e) {}

    try {
      await kubectl.delete('configmap', propertyName, corkKubeConfig);
    } catch(e) {}

    let tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-kube-'));
    fs.writeFileSync(path.join(tmpdir, 'kubeconfig'), yaml.dump(kubeconfig));
    try {
      let cnsFlag = kubectl.getContextNsFlags();
      await kubectl.exec(`kubectl create configmap ${propertyName} ${cnsFlag} --from-file=kubeconfig=${path.join(tmpdir, 'kubeconfig')}`);
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

}

const inst = new Deploy();
export default inst;