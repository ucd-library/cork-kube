import exec from './exec.js'
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';

class KubectlWrapper {

  async getConfig() {
    let context = this.getCurrentContext();
    let namespace = this.getNamespace();
    let user = this.getCurrentUser();

    return {
      context: await context,
      namespace: await namespace,
      user: await user
    }
  }

  setContext(context) {
    return exec(`kubectl config use-context ${context}`);
  }

  setNamespace(namespace) {
    return exec(`kubectl config set-context --current --namespace=${namespace}`);
  }

  async getCurrentContext() {
    let {stdout} = await exec('kubectl config current-context');
    return stdout.trim();
  }

  async getNamespace() {
    let {stdout} = await exec(`kubectl config view --minify --output 'jsonpath={..namespace}'`);
    return stdout.trim();
  }

  async getCurrentUser() {
    let {stdout} = await exec(`kubectl auth whoami -o=jsonpath="{.status.userInfo.username}"`);
    return stdout.trim();
  }

  async getNamespaces() {
    let {stdout} = await exec(`kubectl get namespaces -o jsonpath="{.items[*].metadata.name}"`);
    return stdout.split(' ').map(n => n.trim());
  }

  async getSecrets() {
    let {stdout} = await exec(`kubectl get secrets -o jsonpath="{.items[*].metadata.name}"`);
    return stdout.split(' ').map(n => n.trim());
  }

  async getConfigMaps() {
    let {stdout} = await exec(`kubectl get configmaps -o jsonpath="{.items[*].metadata.name}"`);
    return stdout.split(' ').map(n => n.trim());
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
  async getRunningPodByTag(name, tag='app') {
    let {stdout} = await exec(`kubectl get pods --selector=${tag}=${name} --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'`);
    return stdout.trim();
  };

  async getPodsByTag(name, tag='app') {
    let {stdout} = await exec(`kubectl get pods --selector=${tag}=${name} -o json`);
    return JSON.parse(stdout.trim());
  };

  createNamespace(namespace) {
    return exec(`kubectl create namespace ${namespace}`);
  }

  delete(type, name) {
    return exec(`kubectl delete ${type} ${name}`);
  }

  createSecret(name, files) {
    let fileStr = files.map(f => `--from-file=${f.property}=${f.file}`).join(' ');
    return this.exec(`kubectl create secret generic ${name} ${fileStr}`);
  }

  /**
   * @method apply
   * @description Apply a kubernetes configuration.  Can be file or stdin. Stdin can be a 
   * json object or yaml string. Returns the json output of the apply command.
   * 
   * @param {String|Object} file file path or stdin contents 
   * @param {Object} opts flags to control input type 
   * @param {Boolean} opts.stdin true if file is configuration json or yaml string
   * @param {Boolean} opts.isJson true if file is json object.  If input file is json object,
   * it will be converted to yaml string without the need of this flag.
   * @returns {Promise<Object>}
   */
  async apply(file, opts={}  ) {
    if( opts.isJson || typeof file === 'object' ) {
      file = yaml.dump(file);
    }

    let output = '';
    if ( opts.stdin ) {
      output = await this.exec(`kubectl apply -f - -o json`, {}, { input: file });
    } else {
      output = await this.exec(`kubectl apply -f ${file} -o json`);
    }

    return JSON.parse(output);
  }

  async stop(type, namespace) {
    if( !namespace ) namespace = await this.getNamespace();
    return this.exec(`kubectl delete ${type}s --all -n ${namespace}`);
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
  async renderKustomizeTemplates(template, overlay=null) {
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

    if( !templatePath ) {
      templatePath = path.join(template, 'base');
      usedOverlay = 'base';
    }

    let yamlStr = await this.exec(`kubectl kustomize ${templatePath}`);
    return {
      templates : yamlStr.split('---\n').map(t => yaml.load(t)),
      templatePath,
      usedOverlay, name
    }
  }

}

const instance = new KubectlWrapper();
export default instance;