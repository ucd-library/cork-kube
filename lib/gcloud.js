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
    if( !config.configuration ) {
      throw new Error('Configuration name is required');
    }
    let {stdout} = await exec(`gcloud --configuration=${config.configuration} secrets versions access latest \
      --secret=${name}`);
    return stdout.trim();
  }
}

const inst = new Gcloud();
export default inst;