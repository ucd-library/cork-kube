import exec from './exec.js';

class Gcloud {
  constructor() {
    this.configGroup = 'core';
  }

  async getConfigurations() {
    let {stdout} = await exec(`gcloud config configurations list --format=json`);
    return JSON.parse(stdout);
  }

  setGkeContext(config) {
    if( !config.cluster ) {
      throw new Error('Cluster name is required');
    }
    if( !config.configuration ) {
      throw new Error('Configuration name is required');
    }
    return exec(`gcloud container clusters get-credentials ${config.cluster} \
      --configuration=${config.configuration}`);
  }

  activateServiceAccount(config) {
    return exec(`gcloud auth activate-service-account \
      --key-file=${config.keyFile} --configuration=${config.configuration}`);
  }

  createConfiguration(config) {
    return exec(`gcloud config configurations create ${config.configuration}`);
  }

  activateConfiguration(config) {
    return exec(`gcloud config configurations activate ${config}`);
  }

  setConfigurationProperty(config, key, value) {
    return exec(`gcloud config set ${key} ${value} --configuration=${config}`);
  }

  async getConfig() {
    let {stdout} = await exec(`gcloud config list --format=json`);
    return JSON.parse(stdout)[this.configGroup];
  }

  // async setProject(project) {
  //   await exec(`gcloud config set project ${project}`);
  // }

  async getSecret(name, config={}) {
    if( !config.configuration && !config.project ) {
      throw new Error('Configuration name or project is required');
    }
    let configuration = config.configuration ? '--configuration='+config.configuration : '';
    let project = config.project ? '--project='+config.project : '';
    let version = config.version ? config.version : 'latest';

    let {stdout} = await exec(`gcloud ${configuration} ${project} secrets versions access ${version} \
      --secret=${name}`);
    return stdout.trim();
  }
}

const inst = new Gcloud();
export default inst;