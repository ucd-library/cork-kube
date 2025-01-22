import config from './config.js';
import path from 'path';
import fs from 'fs';
import exec from './exec.js'
import yaml from 'js-yaml';
import templateConfig from './template-config.js';
import buildDependencies from './build-dependencies.js';

class Build {

  constructor() {
    this.cloned = new Set();
    this.DEFAULT_TYPE = 'cork-build-file';
  }

  getBaseDockerBuildCmd(opts={}) {
    let cmd = ['docker buildx build --cache-to=type=inline,mode=max'];
    if( opts.cache === false ) {
      cmd.push('--no-cache');
    }

    let pushFlagSet = false;
    if( opts.production ) {
      cmd.push('--pull');
      if( opts.push !== false ) {
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
      if( opts.useRegistry && opts.useRegistry.includes(proj) ) {
        continue;
      }

      let dGraph = graph[proj];
      if( state.visited.has(proj) ) continue;
      state.visited.add(proj);

      if( dGraph.dependencies ) {
        this.orderBuildGraph(dGraph.dependencies, opts, state);
      }

      let item = {
        name: proj,
        type: dGraph.type || this.DEFAULT_TYPE,
        registry: dGraph.registry,
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
          type : d.type || this.DEFAULT_TYPE,
          registry: d.registry,
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
    await buildDependencies.load(opts);
    let graph = buildDependencies.getBuildGraph(opts.project, opts.version, opts);
    let order = this.orderBuildGraph(graph, opts);
  
    // clone repositories
    for( let item of order ) {
      if( !item.localDir ) {
        item.cloneDir = await this.clone(item.url, item.version);
      }
      item.gitInfo = await buildDependencies.gitInfo(item.localDir || item.cloneDir, opts.version);
      for( let dep in item.dependencies ) {
        let d = item.dependencies[dep];
        if( !d.localDir ) {
          d.cloneDir = await this.clone(d.url, d.version);
        }
        d.gitInfo = await buildDependencies.gitInfo(d.localDir || d.cloneDir, opts.version);
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
          image.src = project.src;
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
      console.log(`\nBuilding image ${image.name} for ${image.project.name} from: ${image.orgDockerfile}`);
      console.log(image.buildCmd);
      if( opts.dryRun ) { 
        continue;
      }

      try {
        if( image.src ) {
          fs.writeFileSync(image.orgDockerfile, image.src.dockerfile);
          fs.writeFileSync(image.dockerignore, image.src.dockerignore);
        }

        await this._handleBuildInfo(image.project, image, opts);
        await exec(image.buildCmd, null, {output: 'realtime'});
      } catch(e) {
        console.error(`Error building image ${image.name} for ${image.project.name}:`, e.message);
        if( image.src ) {
          fs.rmSync(image.orgDockerfile, {force: true});
          fs.rmSync(image.dockerignore, {force: true});
        }
        fs.rmSync(image.dockerfile, {force: true});
        fs.rmSync(image.gitInfoFile, {force: true});
        process.exit(1);
      }

      times[image.name] = Date.now() - times[image.name];

      if( image.src ) {
        fs.rmSync(image.orgDockerfile, {force: true});
        fs.rmSync(image.dockerignore, {force: true});
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
      let time = Math.ceil((times[image.name])/1000);
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
    let infoFilename = this._getCorkBuildInfoFilename(image.name);
    image.gitInfoFile = path.join(image.contextPath, infoFilename);

    let info = Object.assign({}, item.gitInfo);

    info.imageTag = image.tag;

    fs.writeFileSync(image.gitInfoFile, JSON.stringify(info, null, 2));
    
    let dockerfile = fs.readFileSync(image.orgDockerfile, 'utf8');

    if( image.noBuildInfo !== true ) {
      dockerfile += `
# Copy git info
USER root
RUN mkdir -p /cork-build-info
COPY ${infoFilename} /cork-build-info/${image.name}.json
${image.user ? 'USER '+image.user : ''}`;
    }
    fs.writeFileSync(image.dockerfile, dockerfile);
  }

  _getCorkBuildInfoFilename(imageName) {
    return imageName+'.cork-build.json';
  }

  async _getBuildCmd(item, imageName, opts={}) {
    let registry = this._getRegistry(item, opts);;
    let buildCmd = [this.getBaseDockerBuildCmd(opts).join(' ')];
    let image = item.buildConfig.images[imageName];

    let {tag, stdTag} = this._getTag(item, opts);
    image.tag = `${registry}/${imageName}:${tag}`;
    if( stdTag !== tag ) image.originalTag = `${stdTag}`;

    // JM - currently this seems to break gcb build cache and causes a rebuild.
    // removing for now

    let labelName = item.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    // buildCmd.push(`--label "${labelName}_BUILD_DATE=${new Date().toISOString()}"`);

    // if( !item.buildNum ) {
    //   item.buildNum = await this.getBuildNum(item.name, opts);
    // }
    // buildCmd.push(`--label "${labelName}_BUILD_NUMBER=${item.buildNum}"`);
    buildCmd.push(`--label "${labelName}_TAG=${tag}"`);
    buildCmd.push(`--label "${labelName}_SHA=${item.gitInfo.commit}"`);

    if( opts.cache && opts.cacheFrom !== false ) {
      buildCmd.push(`--cache-from=type=registry,ref=${image.tag}`);
    }

    let dir = item.localDir || item.cloneDir;

    if( !path.isAbsolute(image.contextPath) ) {
      image.contextPath = path.resolve(dir, image.contextPath);
    }

    // check for no dockerfile reference but has src.dockerfile
    if( !image.dockerfile && item.src ) {
      image.dockerfile = path.resolve(dir, 'Dockerfile');
      image.dockerignore = path.resolve(dir, '.dockerignore');

      if( fs.existsSync(image.dockerfile) || fs.existsSync(image.dockerignore) ) {
        console.error(`Dockerfile path ${image.dockerfile} or .dockerignore path ${image.dockerignore} already exists for ${item.name}:${imageName}.`+
          `This project is set to use a generated Dockerfile and .dockerignore file. Please remove the existing files and try again.`);
      }
    }

    // and resolve of docker path
    if( !image.dockerfile ) {
      image.dockerfile = path.resolve(image.contextPath, 'Dockerfile');
    } else {
      image.dockerfile = path.resolve(dir, image.dockerfile);
    }

    // check for dev dockerfile
    let dockerfileDir = path.dirname(image.dockerfile);
    let devDockerfile = path.resolve(dockerfileDir, 'Dockerfile.dev');
    if( !opts.production && fs.existsSync(devDockerfile) ) {
      image.dockerfile = devDockerfile;
      image.isDevDockerfile = true;
    }

    if( !fs.existsSync(image.dockerfile) && !item.src ) {
      console.error(`Dockerfile path ${image.dockerfile} not found for ${item.name}:${imageName}`);
      process.exit(1);
    }

    if( image.isDevDockerfile && image.devOptions ) {
      for( let key in image.devOptions ) {
        let values = image.devOptions[key];
        values.forEach(value => buildCmd.push(`--${key} "${value}"`));
      }
    } else if( image.options ) {
      for( let key in image.options ) {
        let values = image.options[key];
        values.forEach(value => buildCmd.push(`--${key} "${value}"`));
      }
    }

    image.orgDockerfile = image.dockerfile;
    let orgDockerfileDir = path.dirname(image.dockerfile);
    image.dockerfile = image.dockerfile = path.resolve(orgDockerfileDir, 'corkbuild.Dockerfile');

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

  _getRegistry(item, opts={}) {
    if( opts.useRegistry && opts.useRegistry.includes(item.name) ) {
      return item.registry || item.buildConfig.registry;
    }

    if( opts.production ) {
      return item.registry || item.buildConfig.registry;
    }

    if( opts.localDevRegistry ) {
      return opts.localDevRegistry;
    }

    return config.LOCAL_DEV_REGISTERY;
  }

  _getTag(item, opts={}) {
    let tag, overrideTag, tagSelection;

    if( opts.useRegistry && opts.useRegistry.includes(item.name) ) {
      return {tag: item.version, stdTag: item.version};
    }

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
    if( item.type == 'source-wrapper' ) {
      let imageName = item.gitInfo.name.toLowerCase();
      item.buildConfig = {
        registry : item.registry,
        images: {
          [imageName]: {
            contextPath: ".",
          }
        }
      };

      item.src = {};
      item.src.dockerfile = `FROM alpine:latest

RUN mkdir /src
WORKDIR /src
COPY . /src
RUN rm ${this._getCorkBuildInfoFilename(imageName)}
`;
      item.src.dockerignore = `.git
corkbuild.Dockerfile
Dockerfile`;
      return;
    }

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
      if( image.options ) {
        this._renderOptions(image.options, templateVars);
      }
      if( image.devOptions ) {
        this._renderOptions(image.devOptions, templateVars);
      }
    }
  }

  _renderOptions(options, templateVars) {
    for( let key in options ) {
      let value = options[key];
      if( !Array.isArray(value) ) {
        value = [value];
        options[key] = value;
      }
      for( let i = 0; i < value.length; i++ ) {
        value[i] = templateConfig.render(value[i], templateVars);
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
        repoDep.name = repoUrl.split('/').pop().replace(/\.git$/, '');
      }
      
      let registry = this._getRegistry(repoDep, opts);

      for( let imageName in repoDep.buildConfig.images ) {
        let {tag, stdTag} = this._getTag(repoDep, opts);
        repoImages[repo+'.'+imageName] = registry+'/'+imageName+':'+tag;
      }
    }

    let registry = this._getRegistry(item, opts);
    for( let imageName in item.buildConfig.images ) {
      let {tag, stdTag} = this._getTag(item, opts);
      repoImages[item.name+'.'+imageName] = registry+'/'+imageName+':'+tag;
    }

    for( let key in process.env ) {
      repoImages['ENV.'+key] = process.env[key];
    }

    return repoImages;
  }
  

  async clone(url, version) {
    let dir = path.join(config.BUILD_ROOT, 'repos');
    if( !fs.existsSync(dir) ) {
      fs.mkdirSync(dir, {recursive: true});
    }
    dir = path.join(dir, url.split('/').pop().replace(/\.git$/, '')+'-'+version);

    if( this.cloned.has(url) ) return dir;
    this.cloned.add(url);

    await buildDependencies.pullRepository(dir, url, version);
    return dir;
  }

  async googleCloudBuild(project, version, opts={}) {
    await buildDependencies.load(opts);
    buildDependencies.getBuildGraph(project, version, opts);
    config.init();
    
    let gcbProject = opts.gcbProject || config.data.build.gcbProject || 'digital-ucdavis-edu';
    console.log(`Submitting build to Google Cloud project: ${gcbProject}`);

    let filename = opts.highCpu ? 'cloudbuild-highcpu.yaml' : 'cloudbuild.yaml';
    let dir = path.join(buildDependencies.config.dependenciesDir, 'gcloud', filename);

    if( !fs.existsSync(dir) ) {
      console.error(`Google Cloud build file not found: ${dir}`);
      process.exit(1);
    }

    let tmpFile;
    if( opts.prependBuildSteps ) {
      if( !path.isAbsolute(opts.prependBuildSteps) ) {
        opts.prependBuildSteps = path.resolve(process.cwd(), opts.prependBuildSteps);
      }
      if( !fs.existsSync(opts.prependBuildSteps) ) {
        console.error(`Prepend build steps file not found: ${opts.prependBuildSteps}`);
        process.exit(1);
      }
      let prepend = yaml.load(fs.readFileSync(opts.prependBuildSteps, 'utf8'));
      let existing = yaml.load(fs.readFileSync(dir, 'utf8'));
      existing.steps = prepend.steps.concat(existing.steps);

      tmpFile = path.join(buildDependencies.config.dependenciesDir, 'gcloud', 'cork-build-tmp.yaml');
      fs.writeFileSync(tmpFile, yaml.dump(existing));
    }

    let substitutions = [
      ['_PROJECT', project],
      ['_VERSION', version],
      ['_REGISTRY', buildDependencies.config.dependenciesUrl || ''],
      ['_USE_CACHE', opts.cache],
      ['_DEPTH', opts.depth || '1']
    ]

    let cmd = `gcloud builds submit \\
    --no-source \\
    --config=${dir} \\
    --project=${gcbProject} \\
    --substitutions=${substitutions.map(s => s.join('=')).join(',')}`;

    if( opts.dryRun ) {
      console.log(cmd);
      console.log('\n*** Build File ***\n');

      if( tmpFile ) {
        console.log(fs.readFileSync(tmpFile, 'utf8')); 
        fs.rmSync(tmpFile, {force: true});
      } else {
        console.log(fs.readFileSync(dir, 'utf8'));
      }
      return;
    }

    await exec(cmd, null, {output: 'realtime'});

    if( tmpFile ) {
      fs.rmSync(tmpFile, {force: true});
    }
  }

  async getBuildNum(projectName, opts) {
    if( !opts.production ) return -1;
    if( !opts.incrementBuildNumber ) return -1;

    let gsFile = `gs://${opts.buildConfigBucket || 'ci-build-config'}/${projectName}/buildnum`;
    let localDir = path.join(config.BUILD_ROOT, projectName);
    let localFile = path.join(localDir, 'buildnum');
    let num = -1;

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