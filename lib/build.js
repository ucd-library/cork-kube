import config from './config.js';
import path from 'path';
import fs, { stat } from 'fs';
import exec from './exec.js'
import templateConfig from './template-config.js';
import buildDependencies from './build-dependencies.js';
import { type } from 'os';

class Build {

  getBaseDockerBuildCmd(opts={}) {
    let cmd = ['docker buildx build --output=type=docker --cache-to=type=inline,mode=max'];
    if( opts.noCache ) {
      cmd.push('--no-cache');
    }
    if( opts.push ) {
      cmd.push('--push');
    }
    if( opts.platform ) {
      cmd.push(`--platform ${opts.platform}`);
    }
    // if( opts.cacheTo ) {
    //   cmd.push(`--cache-to ${opts.cacheTo}`);
    // }
    return cmd;
  }

  async buildImage(name, env, location, setup, opts) {
    let templateVars = await templateConfig.getVariables({
      config: [setup.config],
      env
    });

    if( !env ) {
      console.error(`No environment defined`);
      process.exit(1);
    }
    if( !location ) {
      console.error(`No location defined`);
      process.exit(1);
    }
    if( !setup.location ) {
      console.error(`No build.location defined in .cork-kube-config`);
      process.exit(1);
    }
    if( !setup.images ) {
      console.error(`No build.images defined in .cork-kube-config`);
      process.exit(1);
    }
    if( !setup.location[location] ) {
      console.error(`Location ${location} not found in .cork-kube-config build.  Options: ${Object.keys(setup.location).join(', ')}`);
      process.exit(1);
    }

    let locationConfig = setup.location[location];
    if( !locationConfig.cmd ) {
      console.error(`No build command defined for location ${location}`);
      process.exit(1);
    }
    if( !locationConfig.registry ) {
      console.error(`No container registry defined for location ${location}`);
      process.exit(1);
    }
    templateVars.__REGISTRY = locationConfig.registry;

    let imageConfig = setup.images.find(i => i.name == name);
    if( !imageConfig ) {
      console.error(`Image ${name} not found in .cork-kube-config: ${config.localFile}`);
      process.exit(1);
    }
    if( !imageConfig.contextPath ) {
      console.error(`No contextPath defined for image ${name}`);
      process.exit(1);
    }
    imageConfig.contextPath = path.resolve(templateConfig.render(imageConfig.contextPath, templateVars));
    if( !fs.existsSync(imageConfig.contextPath) ) {
      console.error(`Context path ${imageConfig.contextPath} not found for image ${name}`);
      process.exit(1);
    }

    if( !imageConfig.dockerfile ) {
      imageConfig.dockerfile = path.join(imageConfig.contextPath, 'Dockerfile');
      if( !fs.existsSync(imageConfig.dockerfile) ) {
        console.error(`No dockerfile defined for image ${name}, and ${dockerfile} not found`);
        process.exit(1);
      }
    }
    imageConfig.dockerfile = path.resolve(templateConfig.render(imageConfig.dockerfile, templateVars));

    if( !imageConfig.tag ) {
      console.error(`No tag defined for image ${name}`);
      process.exit(1);
    }
    if( !Array.isArray(imageConfig.tag) ) {
      imageConfig.tag = [imageConfig.tag];
    }
    if( !imageConfig.options ) {
      imageConfig.options = {};
    }
    let options = [];
    for( let key in imageConfig.options ) {
      options.push(`--${key} ${templateConfig.render(imageConfig.options[key], templateVars)}`);
    }
    let tags = imageConfig.tag.map(t => `-t ${templateConfig.render(t, templateVars)}`);
    let cmd = `${templateConfig.render(locationConfig.cmd, templateVars)} \\
${tags.join('\n \\')} \\
${options.join('\n \\')} \\
-f ${templateConfig.render(imageConfig.dockerfile, templateVars)} \\
${imageConfig.contextPath} `;

    console.log(`Building image ${name} in ${location} environment
  - Context: ${imageConfig.contextPath}
  - Dockerfile: ${imageConfig.dockerfile}
  - Tags: ${tags.map(t => t.replace(/-t /, '')).join(', ')}`);

    if( opts.debug ) {
      console.log(`Docker build command:
${cmd}`);
      return;
    }

    let execOpts = {output: 'realtime'};
    if( !opts.dockerLogs ) {
      execOpts.output = null;
    }

    return exec(cmd, null, execOpts);
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
    buildDependencies.load();
    let graph = buildDependencies.getBuildGraph(opts.project, opts.version, opts);
    let order = this.orderBuildGraph(graph, opts);
  
    // clone repositories
    for( let item of order ) {
      if( !item.localDir ) {
        item.cloneDir = await this.clone(item.url, item.version, opts);
      }
      item.gitInfo = await buildDependencies.gitInfo(item.localDir || item.cloneDir);
      for( let dep in item.dependencies ) {
        let d = item.dependencies[dep];
        if( !d.localDir ) {
          d.cloneDir = await this.clone(d.url, d.version, opts);
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
          image.buildCmd = this._getBuildCmd(project, imageName, opts);
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

    for( let image of imageOrder ) {
      console.log(`\nBuilding image ${image.name} for ${image.project.name}`);
      if( opts.dryRun ) { 
        console.log(image.buildCmd);
        continue;
      }

      try {
        await this._handleBuildInfo(image.project, image);
        await exec(image.buildCmd, null, {output: 'realtime'});
      } catch(e) {}

      fs.rmSync(image.dockerfile, {force: true});
      fs.rmSync(image.gitInfoFile, {force: true});
    }

  }

  _handleBuildInfo(item, image) {
    // create git info file
    image.gitInfoFile = path.join(image.contextPath, image.name+'.json');
    fs.writeFileSync(image.gitInfoFile, JSON.stringify(item.gitInfo, null, 2));

    // add git info to dockerfile
    // create tmp dockerfile
    if( !image.dockerfile ) {
      image.dockerfile = path.join(image.contextPath, 'Dockerfile');
    }
    image.orgDockerfile = image.dockerfile;
    image.dockerfile += '.corkbuild';
    
    let dockerfile = fs.readFileSync(image.orgDockerfile, 'utf8');
    dockerfile += `
# Copy git info
RUN mkdir -p /cork-build-info
COPY ${image.name+'.json'} /cork-build-info/`
    fs.writeFileSync(image.dockerfile, dockerfile);
  }

  _getBuildCmd(item, imageName, opts={}) {
    let registry = opts.production ? item.buildConfig.registry : config.LOCAL_DEV_REGISTERY;
    let buildCmd = [this.getBaseDockerBuildCmd(opts).join(' ')];
    let image = item.buildConfig.images[imageName];

    if( image.options ) {
      for( let key in image.options ) {
        let values = image.options[key];
        values.forEach(value => buildCmd.push(`--${key}="${value}"`));
      }
    }

    let {tag, stdTag} = this._getTag(item, opts);
    image.tag = `${registry}/${imageName}:${tag}`;
    if( stdTag !== tag ) image.originalTag = `${stdTag}`;

    buildCmd.push(`--tag ${image.tag}`);

    buildCmd.push(path.resolve(item.localDir || item.cloneDir, image.contextPath));
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
    item.buildConfig = JSON.parse(fs.readFileSync(item.buildScript, 'utf8'));

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
      if( !repoDep.name ) {
        repoDep.name = repoUrl.split('/').pop();
      }
      if( !repoDep ) {
        console.error(`Repository ${repo} not found in build config dependencies for ${item.name}`);
        process.exit(1);
      }
      
      let registry = opts.production ? repoDep.buildConfig.registry : config.LOCAL_DEV_REGISTERY;

      for( let imageName in repoDep.buildConfig.images ) {
        let {tag, stdTag} = this._getTag(repoDep, opts);
        repoImages[repo+'.'+imageName] = registry+'/'+imageName+':'+tag;
      }
    }

    return repoImages;
  }
  

  async clone(url, version, opts={}) {
    if( !opts.dir ) {
      opts.dir = path.join(config.BUILD_ROOT, 'repos');
      if( !fs.existsSync(opts.dir) ) {
        fs.mkdirSync(opts.dir, {recursive: true});
      }
      opts.dir = path.join(opts.dir, url.split('/').pop()+'-'+version);
      if( fs.existsSync(opts.dir) ) {
        console.log(`Removing existing directory ${opts.dir}`);
        fs.rmSync(opts.dir, {force: true, recursive: true});ß
      }
    } else if ( fs.existsSync(opts.dir) ) {
      console.error(`Directory ${opts.dir} already exists and not part of .cork-kube-build directory`);
      process.exit(1);
    }

    console.log(`\nCloning ${url} v${version}`);
    await exec(`git -c advice.detachedHead=false clone ${url} --branch ${version} --depth 1 ${opts.dir}`, null, {output: 'realtime'});
    return opts.dir;
  }

}

const inst = new Build();
export default inst;