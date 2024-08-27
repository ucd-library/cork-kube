import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import kubectl from './kubectl.js';

function resolve(dir) {
  if( path.isAbsolute(dir) ) return dir;
  return path.resolve(process.cwd(), dir);
}

async function init(rootDir, opts={}) {
  rootDir = resolve(rootDir);

  if( !opts.overlayName ) {
    console.error('overlayName is required');
    process.exit(1);
  }

  let baseDir = path.join(rootDir, 'base');
  let overlayDir = path.join(rootDir, 'overlays');
  if( !fs.existsSync(overlayDir) ) {
    fs.mkdirSync(overlayDir);
  }

  if( !fs.existsSync(baseDir) ) {
    console.error(`Base directory ${baseDir} does not exist`);
    process.exit(1);
  }

  overlayDir = path.join(overlayDir, opts.overlayName);

  let dirExists = fs.existsSync(overlayDir);
  if( dirExists && !opts.force ) {
    console.error(`Overlay directory ${overlayDir} already exists.  Use -f to force initialization.`);  
    process.exit(1);
  } else if( dirExists && opts.force ) {
    fs.rmSync(overlayDir, { recursive: true });
  }

  if( !fs.existsSync(overlayDir) ) {
    fs.mkdirSync(overlayDir);
  }

  let resources = await getResourceFiles(rootDir, opts);

  fs.writeFileSync(
    path.join(overlayDir, 'kustomization.yaml'), 
    createOverlayKustomization(resources)
  );

  for( let resourceFileName in resources ) {
    let resource = resources[resourceFileName];
    fs.writeFileSync(
      path.join(overlayDir, resourceFileName),
      createOverlayResource(resource, opts.overlayName, opts.tagName)
    );
  }
}

function createOverlayResource(resource, overlayName, tagName) {
  if( !tagName ) {
    tagName = overlayName;
  }
  
  let overlay = {
    apiVersion: resource.apiVersion,
    kind: resource.kind,
    metadata: {
      name: resource.metadata.name
    }
  };

  // update image names
  if( resource.spec ) {
    overlay.spec = {};
    if( resource.spec.template ) {
      overlay.spec.template = {};
      if( resource.spec.template.spec ) {
        overlay.spec.template.spec = {};
        if( resource.spec.template.spec.containers ) {
          overlay.spec.template.spec.containers = resource.spec.template.spec.containers.map(container => {
            let o = {name: container.name};
            if( container.image ) {
              o.image = container.image.replace(/:.*$/, `:${tagName}`);
            }
            return o;
          });
        }
      }
    }
  }

  return yaml.dump(overlay);
}

function createOverlayKustomization(resources) {
  let kustomization = {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization',
    resources: ['../../base'],
    patches: []
  };

  for( let resourceFileName in resources ) {
    let resource = resources[resourceFileName];

    kustomization.patches.push({
      path : resourceFileName,
      target: {
        kind: resource.kind,
        name: resource.metadata.name
      }
    });
  }

  return yaml.dump(kustomization);
}

/**
 * @function getResourceFiles
 * @description Get the resources from the kustomization.yaml file in the 
 * base directory and return them as a json object where the key is the
 * resource file name and the value is the resource file contents parsed
 * as yaml.
 * 
 * @param {String} dir base directory
 * 
 * @returns {Object} resources 
 */
async function getResourceFiles(dir, opts) {
  let kustomize = await kubectl.renderKustomizeTemplates(dir);

  let resources = {};
  for( let resource of kustomize.templates ) {
    if( opts.ignore && opts.ignore.includes(resource.kind) ) {
      console.log(`Ignoring resource ${resource.kind} ${resource.metadata.name}`);
      continue;
    }

    resources[resource.kind.toLowerCase()+'.yaml'] = resource;
  }

  return resources;
}

export default init;