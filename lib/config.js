import path from 'path';
import fs from 'fs';
import os from 'os';

class Config {

  constructor() {
    this.DASHBOARD_URL = 'https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml';
    this.CONFIG_FILE_NAME = '.cork-kube-config';
    this.BUILD_DIR = '.cork-kube-build';
    this.LOCAL_DEV_REGISTERY = 'localhost/local-dev';

    this.BUILD_ROOT = path.join(os.homedir(), this.BUILD_DIR);
    this.BUILD_CONFIG_FILE = path.join(this.BUILD_ROOT, 'config.json');
    this.ROOT_CONFIG = path.join(os.homedir(), this.CONFIG_FILE_NAME);
  
    this.data = {
      global : null, // global home directory file
      local : null, // local project directory file
      build : null // build config file
    }
  }

  init(localFile, opts={}) {
    if( !fs.existsSync(this.BUILD_ROOT) ) {
      fs.mkdirSync(this.BUILD_ROOT);
    }
    this.data.build = this.load(this.BUILD_CONFIG_FILE) || {};

    this.data.global = this.load(this.ROOT_CONFIG);
    let projectConfigFile = this.data.global?.[opts.project]?.config;

    if( !localFile && projectConfigFile ) {
      localFile = projectConfigFile;
    } else if( !localFile ) {
      localFile = path.resolve(process.cwd(), this.CONFIG_FILE_NAME);
    } else {
      if( !path.isAbsolute(localFile) ) {
        localFile = path.resolve(process.cwd(), localFile);
      }
    }

    if( fs.existsSync(localFile) && fs.lstatSync(localFile).isDirectory() ) {
      localFile = path.join(localFile, this.CONFIG_FILE_NAME);
    }

    this.data.local = this.load(localFile);

    // init paths for services
    if( this.data?.local?.services ) {
      this.data?.local?.services.forEach(service => {
        if( !service.path ) {
          return;
        }
        service.path = path.resolve(path.dirname(localFile), service.path);
        service.name = path.basename(service.path);
      });
    }

    this.localFile = localFile;
    this.localDir = path.dirname(localFile);

    this.initialized = true;
  }

  saveGlobal() {
    fs.writeFileSync(this.ROOT_CONFIG, JSON.stringify(this.data.global, null, 2));
    fs.writeFileSync(this.BUILD_CONFIG_FILE, JSON.stringify(this.data.build, null, 2));
  }

  load(file) {
    if( !fs.existsSync(file) ) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

}

const inst = new Config();
export default inst;