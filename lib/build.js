import config from './config.js';
import path from 'path';
import fs, { stat } from 'fs';
import exec from './exec.js'
import templateConfig from './template-config.js';
import buildDependencies from './build-dependencies.js';
import { type } from 'os';
import { time } from 'console';

class Build {

  constructor() {
    this.cloned = new Set();
  }

  getBaseDockerBuildCmd(opts={}) {
    let cmd = ['docker buildx build --cache-to=type=inline,mode=max'];
    if( opts.noCache ) {
      cmd.push('--no-cache');
    }

    let pushFlagSet = false;
    if( opts.production ) {
      cmd.push('--pull');
      if( !opts.noPush ) {
        pushFlagSet = true;
        cmd.push('--push');
      }
    }

    if( !pushFlagSet ) {
      cmd.push('--output=type=docker');
    }

    if( opts.platform ) {
      cmd.push(`--platform ${opts.platform}`);
    }
    // if( opts.cacheTo ) {
    //   cmd.push(`--cache-to ${opts.cacheTo}`);
    // }
    return cmd;
  }

  orderBuildGraph(graph, opts={}, state) {
    if( !state ) {
      state = {
        depth: 0,
        order: [],
        visited: new Set(),
      };
    }
    state.depth++;
    let cdepth = state.depth;

    for( let proj in graph ) {
      let dGraph = graph[proj];
      if( state.visited.has(proj) ) continue;
      state.visited.add(proj);

      if( dGraph.dependencies ) {
        this.orderBuildGraph(dGraph.dependencies, opts, state);
      }

      let item = {
        name: proj,
        dependencies: {},
      };
      let localDir = buildDependencies.getLocalDir(dGraph.url, opts);
      if( localDir ) {
        item.localDir = localDir;
      } else {
        item.url = dGraph.url;
        item.version = dGraph.version;
      }

      // just clone direct child dependencies into the item
      for( let dep in dGraph.dependencies ) {
        let d = dGraph.dependencies[dep];
        item.dependencies[dep] = {
          url : d.url,
          version : d.version,
          localDir : buildDependencies.getLocalDir(d.url, opts)
        }
      }

      if( opts.depth === 'ALL' || cdepth <= opts.depth ) {
        state.order.push(item);
      }
    }

    return state.order;
  }

  async exec(opts={}) {
    let {project, version} = opts;
    await buildDependencies.load();
    let graph = buildDependencies.getBuildGraph(opts.project, opts.version, opts);
    let order = this.orderBuildGraph(graph, opts);
  
    // clone repositories
    for( let item of order ) {
      if( !item.localDir ) {
        item.cloneDir = await this.clone(item.url, item.version);
      }
      item.gitInfo = await buildDependencies.gitInfo(item.localDir || item.cloneDir);
      for( let dep in item.dependencies ) {
        let d = item.dependencies[dep];
        if( !d.localDir ) {
          d.cloneDir = await this.clone(d.url, d.version);
        }
        d.gitInfo = await buildDependencies.gitInfo(d.localDir || d.cloneDir);
      }
    }

    // check for build scripts
    for( let item of order ) {
      if( item.dependencies ) {
        for( let dep in item.dependencies ) {
          this._loadBuildConfig(item.dependencies[dep], opts, false);
        }
      }
      this._loadBuildConfig(item, opts);
    }

    console.log(`\n*** Build Summary: ***`);

    console.log(`\nProjects to build:`);
    let imageOrder = [];
    for( let project of order ) {
      if( project.buildConfig ) {
        console.log(`  ${project.name}`);
        console.log(project.localDir ? `    - Local Directory: ${project.localDir}` : `    - Clone Directory: ${project.cloneDir}`);
        console.log(`    - Repository: ${project.gitInfo.remote}`);
        console.log(`    - Tag: ${project.gitInfo.tag}`);
        console.log(`    - Branch: ${project.gitInfo.branch}`);
        console.log(`    - Commit: ${project.gitInfo.commit}`);
        
        for( let imageName in project.buildConfig.images ) {
          if( opts.filter.length && !opts.filter.includes(imageName) ) continue;
          let image = project.buildConfig.images[imageName];
          image.buildCmd = await this._getBuildCmd(project, imageName, opts);
          image.name = imageName;
          
          image.project = project;
          imageOrder.push(image);
        }
      }
    }

    console.log(`\nImages to build:`);
    for( let image of imageOrder ) {
      console.log(`  ${image.project.name}: ${image.name}`);
      let tagOverride = image.originalTag ? ` (original tag: ${image.originalTag})` : '';
      console.log(`    - Tag: ${image.tag} ${tagOverride}`);
    }

    console.log(`\n***********************`);

    let times = {};
    for( let image of imageOrder ) {
      times[image.name] = Date.now();
      console.log(`\nBuilding image ${image.name} for ${image.project.name}`);
      console.log(image.buildCmd);
      if( opts.dryRun ) { 
        continue;
      }

      try {
        await this._handleBuildInfo(image.project, image, opts);
        await exec(image.buildCmd, null, {output: 'realtime'});
      } catch(e) {
        console.error(`Error building image ${image.name} for ${image.project.name}:`, e.message);
        fs.rmSync(image.dockerfile, {force: true});
        fs.rmSync(image.gitInfoFile, {force: true});
        process.exit(1);
      }

      fs.rmSync(image.dockerfile, {force: true});
      fs.rmSync(image.gitInfoFile, {force: true});
    }

    if( opts.dryRun ) {
      console.log(`\n*** Dry Run ***`);
      return;
    }

    console.log(`\n*** Build Complete ***`);

    console.log(`\n*** Build Summary: ***`);
    for( let image of imageOrder ) {
      let time = Math.ceil((Date.now() - times[image.name])/1000);
      if( time > 60 ) {
        time = (time / 60).toFixed(2)+'m';
      } else {
        time = time+'s';
      }
      console.log(`${image.tag} (${time})`);
    }

  }

  _handleBuildInfo(item, image, opts={}) {
    let dir = item.localDir || item.cloneDir;

    if( !path.isAbsolute(image.contextPath) ) {
      image.contextPath = path.resolve(dir, image.contextPath);
    }

    if( !fs.existsSync(image.contextPath) ) {
      console.error(`Context path ${image.contextPath} not found for ${item.name}:${image.name}`);
      process.exit(1);
    }

    // create git info file
    image.gitInfoFile = path.join(image.contextPath, image.name+'.json');

    let info = Object.assign({}, item.gitInfo);

    info.imageTag = image.tag;

    fs.writeFileSync(image.gitInfoFile, JSON.stringify(info, null, 2));
    
    let dockerfile = fs.readFileSync(image.orgDockerfile, 'utf8');

    if( image.noBuildInfo !== true ) {
      dockerfile += `
# Copy git info
USER root
RUN mkdir -p /cork-build-info
COPY ${image.name+'.json'} /cork-build-info/
${image.user ? 'USER '+image.user : ''}`;
    }
    fs.writeFileSync(image.dockerfile, dockerfile);
  }

  async _getBuildCmd(item, imageName, opts={}) {
    let registry = opts.production ? item.buildConfig.registry : config.LOCAL_DEV_REGISTERY;
    let buildCmd = [this.getBaseDockerBuildCmd(opts).join(' ')];
    let image = item.buildConfig.images[imageName];

    if( image.options ) {
      for( let key in image.options ) {
        let values = image.options[key];
        values.forEach(value => buildCmd.push(`--${key} "${value}"`));
      }
    }

    let labelName = item.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    buildCmd.push(`--label "${labelName}_BUILD_DATE=${new Date().toISOString()}"`);

    if( !item.buildNum ) {
      item.buildNum = await this.getBuildNum(item.name, opts);
    }
    buildCmd.push(`--label "${labelName}_BUILD_NUMBER=${item.buildNum}"`);

    let dir = item.localDir || item.cloneDir;

    if( !path.isAbsolute(image.contextPath) ) {
      image.contextPath = path.resolve(dir, image.contextPath);
    }

    if( !image.dockerfile ) {
      image.dockerfile = path.resolve(image.contextPath, 'Dockerfile');
    } else {
      image.dockerfile = path.resolve(dir, image.dockerfile);
    }

    if( !fs.existsSync(image.dockerfile) ) {
      console.error(`Dockerfile path ${image.dockerfile} not found for ${item.name}:${imageName}`);
      process.exit(1);
    }

    image.orgDockerfile = image.dockerfile;
    let orgDockerfileDir = path.dirname(image.dockerfile);
    image.dockerfile = image.dockerfile = path.resolve(orgDockerfileDir, 'Dockerfile.corkbuild');

    let {tag, stdTag} = this._getTag(item, opts);
    image.tag = `${registry}/${imageName}:${tag}`;
    if( stdTag !== tag ) image.originalTag = `${stdTag}`;

    buildCmd.push(`--tag ${image.tag}`);
    buildCmd.push(`--file ${image.dockerfile}`);

    buildCmd.push(image.contextPath);
    return buildCmd.join(' \\\n  ');
  }

  _tagStrToObj(tagStr) {
    if( typeof tagStr !== 'string' ) return tagStr;
    if( !tagStr.includes(',') && !tagStr.includes('=') ) {
      return {'*': tagStr};
    }
    let tags = tagStr.split(/(,| )/g)
      .map(t => t.trim())
      .map(t => {
        let parts = t.split('=').map(p => p.trim());
        return {[parts[0]]: parts[1]};
      });
    return Object.assign({}, ...tags);
  }

  _getTag(item, opts={}) {
    let tag, overrideTag, tagSelection;
    if( opts.overrideTag ) {
      opts.overrideTag = this._tagStrToObj(opts.overrideTag);
      overrideTag = opts.overrideTag[item.name];
      if( !overrideTag ) overrideTag = opts.overrideTag['*'];
    }
    if( opts.tagSelection ) {
      opts.tagSelection = this._tagStrToObj(opts.tagSelection);
      tagSelection = opts.tagSelection[item.name];
      if( !tagSelection ) tagSelection = opts.tagSelection['*'];
    }

    if( overrideTag ) {
      tag = overrideTag;
    } else if( item.gitInfo.tag && tagSelection !== 'force-branch' ) {
      tag = item.gitInfo.tag;
    } else if ( item.gitInfo.branch && tagSelection !== 'force-tag' ) {
      tag = item.gitInfo.branch;
    } else {
      if( tagSelection === 'force-tag' ) {
        console.error(`No tag ${item.name} ${imageName} and tagSelection is force-tag`);
      } else if( tagSelection === 'force-branch' ) {
        console.error(`No branch ${item.name} ${imageName} and tagSelection is force-branch`);
      } else {
        console.error(`No tag or branch for ${item.name} ${imageName}`);
      }
      process.exit(1);
    }

    let stdTag = item.gitInfo.tag || item.gitInfo.branch;
    return {tag, stdTag};
  }

  _loadBuildConfig(item, opts={}, renderTemplateVars=true) {
    item.buildScript = path.join(item.localDir || item.cloneDir, '.cork-build');

    if( !fs.existsSync(item.buildScript) ) {
      console.error(`No build script (${item.buildScript}) found for ${item.gitInfo.name}`);
      process.exit(1);
    }
    try {
      item.buildConfig = JSON.parse(fs.readFileSync(item.buildScript, 'utf8'));
    } catch(e) {
      console.error(`Error parsing build script ${item.buildScript} for ${item.name}:`, e.message);
      process.exit(1);
    }

    if( !renderTemplateVars ) return;

    let templateVars = this._getTemplateVars(item, opts);

    // loop through images build options and set any template variables
    for( let imageName in item.buildConfig.images ) {
      let image = item.buildConfig.images[imageName];
      if( !image.options ) continue;
      for( let key in image.options ) {
        let value = image.options[key];
        if( !Array.isArray(value) ) {
          value = [value];
          image.options[key] = value;
        }
        for( let i = 0; i < value.length; i++ ) {
          value[i] = templateConfig.render(value[i], templateVars);
        }
      }
    }
  }

  _getTemplateVars(item, opts={}) {
    let repoImages = {}
    let dependArray = Object.values(item.dependencies);

    for( let repo in item.buildConfig.repositories ) {
      let repoUrl = item.buildConfig.repositories[repo];
      let repoDep = dependArray.find(d => d.url == repoUrl);
      if( !repoDep ) {
        console.error(`Repository ${repo} (${repoUrl}) not found in build config dependencies for ${item.name}`);
        process.exit(1);
      }
      if( !repoDep.name ) {
        repoDep.name = repoUrl.split('/').pop();
      }
      
      let registry = opts.production ? repoDep.buildConfig.registry : config.LOCAL_DEV_REGISTERY;

      for( let imageName in repoDep.buildConfig.images ) {
        let {tag, stdTag} = this._getTag(repoDep, opts);
        repoImages[repo+'.'+imageName] = registry+'/'+imageName+':'+tag;
      }
    }

    let registry = opts.production ? item.buildConfig.registry : config.LOCAL_DEV_REGISTERY;
    for( let imageName in item.buildConfig.images ) {
      let {tag, stdTag} = this._getTag(item, opts);
      repoImages[item.name+'.'+imageName] = registry+'/'+imageName+':'+tag;
    }

    return repoImages;
  }
  

  async clone(url, version) {
    let dir = path.join(config.BUILD_ROOT, 'repos');
    if( !fs.existsSync(dir) ) {
      fs.mkdirSync(dir, {recursive: true});
    }
    dir = path.join(dir, url.split('/').pop()+'-'+version);

    if( this.cloned.has(url) ) return dir;
    this.cloned.add(url);

    await buildDependencies.pullRepository(dir, url, version);
    return dir;
  }

  async googleCloudBuild(project, version) {
    await buildDependencies.load();
    let dir = path.join(buildDependencies.config.dependenciesDir, 'gcloud', 'cloudbuild.yaml');
    if( !fs.existsSync(dir) ) {
      console.error(`Google Cloud build file not found: ${dir}`);
      process.exit(1);
    }
    let cmd = `gcloud builds submit \\
    --no-source \\
    --config=${dir} \\
    --project=digital-ucdavis-edu \\
    --substitutions=_PROJECT=${project},_VERSION=${version}`;
    await exec(cmd, null, {output: 'realtime'});
  }

  async getBuildNum(projectName, opts) {
    if( !opts.production ) return -1;
    if( !opts.incrementBuildNumber ) return -1;

    let gsFile = `gs://${opts.buildConfigBucket || 'ci-build-config'}/${projectName}/buildnum`;
    let localDir = path.join(config.BUILD_ROOT, projectName);
    let localFile = path.join(localDir, 'buildnum');
    let num = -1;

    console.log(gsFile);

    fs.mkdirSync(localDir, {recursive: true});

    try {
      let exists = false;
      try {
        await exec(`gsutil stat ${gsFile}`);
        exists = true;
      } catch(e) {}

      if( !exists ) {
        await fs.writeFileSync(localFile, '0');
      } else {
        await exec(`gsutil cp ${gsFile} ${localFile}`);
      }

      num = parseInt(fs.readFileSync(localFile, 'utf8'));
      num++;

      // write back to google storage
      if( !opts.dryRun ) {       
        fs.writeFileSync(localFile, num.toString());
        await exec(`gsutil cp ${localFile} ${gsFile}`);
      }
    } catch(e) {
      console.error(`Error getting build number for ${projectName}:`, e.message);
    }

    fs.rmSync(localDir, {recursive: true});

    return num;
  }

}

const inst = new Build();
export default inst;