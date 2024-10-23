let log, opts;

function cleanContainer(container) {
  // Set the imagePullPolicy to Never so that the container doesn't try to pull the image from a registry
  // Always means that it will always try to pull the image from the registry and brak on local dev
  if( opts.keepImagePull !== true && container.imagePullPolicy !== 'Never' ) {
    container.imagePullPolicy = 'Never';
    log(`   - ${container.name}: Setting imagePullPolicy to ${container.imagePullPolicy}`);
  }

  // Remove the resources section from the pod
  if( container.resources ) {
    delete container.resources;
    log(`   - ${container.name}: Removing resources definition`);
  }

  // Remove the livenessProbe and readinessProbe from the pod
  if( container.livenessProbe ) {
    delete container.livenessProbe;
    log(`   - ${container.name}: Removing livenessProbe`);
  }

  if( container.readinessProbe ) {
    delete container.readinessProbe;
    log(`   - ${container.name}: Removing readinessProbe`);
  }
}

function cleanPod(pod) {
  // Remove the nodeSelector from the pod so that it can be scheduled on any node
  delete pod.nodeSelector;

  (pod.containers || []).forEach(cleanContainer);
}

function cleanStsOrDeployment(template) {
  let pod = template?.spec?.template?.spec;
  if( !pod ) return;
  cleanPod(pod);
}

function clean(template={}) {
  if( template.kind === 'Job' || template.kind === 'StatefulSet' || template.kind === 'Deployment' ) {
    cleanStsOrDeployment(template);
  }
}

export default function (template, _log, _opts={}) {
  log = _log;
  opts = _opts;
  if( Array.isArray(template) ) {
    template.forEach(clean);
  } else {
    clean(template);
  }
}