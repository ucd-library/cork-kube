import exec from './exec.js'
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import os from 'os';

class KubectlWrapper {

  constructor() {
    this.DEFAULT_KUBECONFIG = path.join(os.homedir(), '.kube', 'config');
    // this.kubeconfigFile = null;
    this.runtimeParams = {};
  }

  setRuntimeParams(opts={}) {
    if( opts.kubeconfigFile ) {
      this.runtimeParams.kubeconfigFile = opts.kubeconfigFile;
    }
    if( opts.context ) {
      this.runtimeParams.context = opts.context;
    }
    if( opts.namespace ) {
      this.runtimeParams.namespace = opts.namespace;
    }
  }

  async getConfig() {
    let context = '';
    let namespace = '';
    let user = '';

    try {
      context = await this.getCurrentContext();
    } catch(e) {
      context = e.message;
    }
    try {
      namespace = await this.getNamespace();
    } catch(e) {
      namespace = e.message;
    }
    try {
      user = await this.getCurrentUser();
    } catch(e) {
      user = e.message;
    }

    return {
      context,
      namespace,
      user,
      kubeconfigFile : process.env.KUBECONFIG || this.kubeconfigFile
    }
  }

  async setContext(context) {
    // ensure the current default context is blank so we never accendentally use it
    await exec(`kubectl config unset current-context`);
    return exec(`kubectl ${this.getKubeconfigFlag()} config use-context ${context}`);
  }

  async getContexts() {
    let {stdout} = await exec(`kubectl ${this.getKubeconfigFlag()} config view -o jsonpath="{.contexts[*].name}"`);
    return stdout.split(' ').map(c => c.trim());
  }

  setNamespace(namespace) {
    return exec(`kubectl ${this.getKubeconfigFlag()} config set-context --current --namespace=${namespace}`);
  }

  async getCurrentContext() {
    try {
      let {stdout} = await exec(`kubectl ${this.getKubeconfigFlag()} config current-context`);
      return stdout.trim();
    } catch(e) {}

    return null;
  }

  async getNamespace(opts={}) {
    let cnsFlags = this.getContextNsFlags(true);
    let {stdout} = await exec(`kubectl config view ${cnsFlags} --minify --output 'jsonpath={..namespace}'`);
    return stdout.trim();
  }

  async getCurrentUser(opts={}) {
    try {
      let cnsFlags = this.getContextNsFlags(true);
      // if you don't have access, requests can take a long time, so we set a timeout
      let {stdout} = await exec(`kubectl auth whoami ${cnsFlags} --request-timeout=5s -o=jsonpath="{.status.userInfo.username}"`);
      return stdout.trim();
    } catch(e) {
      return '';
    }
  }

  async getNamespaces(opts={}) {
    try {
      let cnsFlags = this.getContextNsFlags(true);
      let {stdout} = await exec(`kubectl get namespaces ${cnsFlags} -o jsonpath="{.items[*].metadata.name}"`);
      return stdout.split(' ').map(n => n.trim());
    } catch(e) {}
    return [];
  }

  async getSecrets(opts={}) {
    let cnsFlags = this.getContextNsFlags(false, opts.namespace);
    let {stdout} = await exec(`kubectl get secrets ${cnsFlags} -o jsonpath="{range .items[*]}{.metadata.namespace}:{.metadata.name} {end}"`);
    return stdout.split(' ').map(n => {
      n = n.trim().split(':');
      return {
        namespace: n[0],
        name: n[1]
      };
    });
  }

  async getConfigMaps(opts={}) {
    let cnsFlags = this.getContextNsFlags();
    let {stdout} = await exec(`kubectl get configmaps ${cnsFlags} -o jsonpath="{.items[*].metadata.name}"`);
    return stdout.split(' ').map(n => n.trim());
  }

  async applyConfigMap(name, envContents) {
    let cnsFlags = this.getContextNsFlags();
    return exec(`kubectl create configmap ${cnsFlags} ${name} --from-env-file=/dev/stdin <<EOF
${envContents}
EOF`);
  }

  async restart(type, name, opts={}) {
    let cnsFlags = this.getContextNsFlags();
    return exec(`kubectl rollout restart ${cnsFlags} ${type} ${name}`);
  }

  /**
   * @method getRunningPodByTag
   * @description Get the id of the running pod by the tag.  The tag is the
   * label selector to find the pod.  If no tag is provided, it will default to
   * 'app'.  The pod must be in the 'running' state.
   * 
   * 
   * @param {String} name tag value
   * @param {String} tag tag name.  Defaults to 'app'
   * @returns {Promise<String>} pod id
   */
  async getRunningPodByTag(name, tag='app', opts={}) {
    let cnsFlags = this.getContextNsFlags();
    let {stdout} = await exec(`kubectl get pods ${cnsFlags} --selector=${tag}=${name} --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'`);
    return stdout.trim();
  };

  async getPodsByTag(name, tag='app', opts={}) {
    let cnsFlags = this.getContextNsFlags();
    let {stdout} = await exec(`kubectl get pods ${cnsFlags} --selector=${tag}=${name} -o json`);
    return JSON.parse(stdout.trim());
  };

  createNamespace(namespace, opts={}) {
    let cFlag = this.getContextNsFlags(true);
    return exec(`kubectl create namespace ${cFlag} ${namespace}`);
  }

  delete(type, name, opts={}) {
    let cnsFlags = this.getContextNsFlags(false, opts.namespace);
    return exec(`kubectl delete ${cnsFlags} ${type} ${name}`);
  }

  createEnvFileSecret(name, envContents) {
    let cnsFlags = this.getContextNsFlags();
    return exec(`kubectl create secret generic ${cnsFlags} ${name} --from-env-file=/dev/stdin <<EOF
${envContents}
EOF`);
  }

  createTlsSecret(name, key, cert, namespace=null) {
    let cnsFlags = this.getContextNsFlags(false, namespace);
    let args = {
      env : {
        TLS_KEY : key,
        TLS_CRT : cert
      }
    }

    return exec(`kubectl create secret tls ${cnsFlags} ${name} --cert=<(echo "$TLS_CRT") --key=<(echo "$TLS_KEY")`, args);
  }

  createSecret(name, files, opts={}) {
    let cnsFlags = this.getContextNsFlags();

    let fileStr = files.map(f => {
      let flag = f.fromEnvFile ? '--from-env-file' : '--from-file';
      if( f.property ) {
        return `${flag}=${f.file}`;
      }
      return `${flag}=${f.file}`;
    }).join(' ');
    return this.exec(`kubectl create secret generic ${cnsFlags} ${name} ${fileStr}`);
  }

  /**
   * @method apply
   * @description Apply a kubernetes configuration.  Can be file or stdin. Stdin can be a 
   * json object or yaml string. Returns the json output of the apply command.
   * 
   * @param {String|Object} file file path or stdin contents 
   * @param {Object} config flags to control input type 
   * @param {Boolean} config.stdin true if file is configuration json or yaml string
   * @param {Boolean} config.isJson true if file is json object.  If input file is json object,
   * it will be converted to yaml string without the need of this flag.
   * @returns {Promise<Object>}
   */
  async apply(file, config, opts={}) {
    if( !config ) config = {};
    if( config.isJson || typeof file === 'object' ) {
      file = yaml.dump(file);
    }
    let cnsFlags = this.getContextNsFlags(false, opts.namespace);

    let output = '';
    if ( config.stdin ) {
      output = await this.exec(`kubectl apply ${cnsFlags} -f - -o json`, {}, { input: file });
    } else {
      output = await this.exec(`kubectl apply ${cnsFlags} -f ${file} -o json`);
    }

    return JSON.parse(output);
  }

  async stop(type, opts={}) {
    let cnsFlags = this.getContextNsFlags();
    return this.exec(`kubectl delete ${type}s ${cnsFlags} --all`);
  }

  async exec(command, args={}, options) {
    let {stdout, stderr} = await exec(command, args, options);
    if( stderr ) {
      throw new Error(stderr);
    }
    return stdout;
  }

  /**
   * @method getKustomizeTemplates
   * @description Get the kustomize template as a json object.  The template
   * can be in the base or overlay directory.
   * 
   * @param {String} template service template name
   * @param {String} overlay overlay name.  defaults to null which will use the base template.
   * @returns 
   */
  async renderKustomizeTemplates(template, overlay=null, defaultToBase=true) {
    let templatePath;
    let usedOverlay;
    let name = path.basename(template);

    // find the overlay template
    if( overlay ) {
      let overlays = overlay;
      if( !Array.isArray(overlays) ) {
        overlays = overlays.split(',').map(o => o.trim());
      }

      for( overlay of overlays ) {
        templatePath = path.join(template, 'overlays', overlay);

        // revert to base template if overlay does not exist
        if( !fs.existsSync(templatePath) ) {
          templatePath = null;
        } else {
          usedOverlay = overlay
          break;
        }
      }
    }

    if( !templatePath && defaultToBase === true ) {
      templatePath = path.join(template, 'base');
      usedOverlay = 'base';
    } else if( !templatePath ) {
      throw new Error(`Template ${template} not found`);
    }

    let yamlStr = await this.exec(`kubectl kustomize ${templatePath}`);
    return {
      templates : yamlStr.split('---\n').map(t => yaml.load(t)),
      templatePath,
      usedOverlay, name
    }
  }

  getContextNsFlags(contextOnly=false, namespace=null) {
    let flags = [];
    if( this.runtimeParams.kubeconfigFile ) {
      flags.push(this.getKubeconfigFlag());
    }
    if( this.runtimeParams.context ) {
      flags.push(`--context=${this.runtimeParams.context}`);
    }

    namespace = namespace || this.runtimeParams.namespace;
    if( namespace && contextOnly === false ) {
      if( namespace === 'ALL' ) {
        flags.push('--all-namespaces');
      } else {
        flags.push(`--namespace=${namespace || this.runtimeParams.namespace}`);
      }
    }
    return flags.join(' ');
  }

  getKubeconfigFlag() {
    return this.runtimeParams.kubeconfigFile ? 
      `--kubeconfig=${this.runtimeParams.kubeconfigFile}` : '';
  }

}

const instance = new KubectlWrapper();
export default instance;