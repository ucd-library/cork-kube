


function cleanContainer(container) {
  // Set the imagePullPolicy to Never so that the container doesn't try to pull the image from a registry
  // Always means that it will always try to pull the image from the registry and brak on local dev
  container.imagePullPolicy = 'Never';

  // Remove the resources section from the pod
  delete container.resources;

  // Remove the livenessProbe and readinessProbe from the pod
  delete container.livenessProbe;
  delete container.readinessProbe;
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

export default function (template) {
  if( Array.isArray(template) ) {
    template.forEach(clean);
  } else {
    clean(template);
  }
}