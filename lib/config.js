import path from 'path';
import fs from 'fs';
import os from 'os';

class Config {

  constructor() {
    this.CONFIG_FILE_NAME = '.cork-kube-config';
    this.ROOT_CONFIG = path.join(os.homedir(), this.CONFIG_FILE_NAME);
  
    this.data = {
      global : null, // global home directory file
      local : null // local project directory file
    }
  }

  init(localFile, opts={}) {
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
    this.localFile = localFile;
  }

  saveGlobal() {
    fs.writeFileSync(this.ROOT_CONFIG, JSON.stringify(this.data.global, null, 2));
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