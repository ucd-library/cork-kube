import exec from './exec.js'
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';

class KubectlWrapper {

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
    if( overlay ) {
      templatePath = path.join(template, 'overlays', overlay);

      // revert to base template if overlay does not exist
      if( !fs.existsSync(templatePath) ) {
        templatePath = null;
      }
    }

    if( !templatePath ) {
      templatePath = path.join(template, 'base');
    }

    let yamlStr = await this.exec(`kubectl kustomize ${templatePath}`);
    return {
      templates : yamlStr.split('---\n').map(t => yaml.load(t)),
      templatePath
    }
  }

}

const instance = new KubectlWrapper();
export default instance;