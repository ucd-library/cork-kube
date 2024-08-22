
function applySrcMounts(template, srcMounts) {
  let pod = template?.spec?.template?.spec;
  if( !pod ) return;

  pod.volumes = pod.volumes || [];
  pod.containers = pod.containers || [];

  srcMounts.forEach(srcMount => {
    pod.volumes.push({
      name: srcMount.name,
      hostPath: {
        path : srcMount.hostPath
      }
    });

    pod.containers.forEach(container => {
      container.volumeMounts = container.volumeMounts || [];
      container.volumeMounts.push({
        name: srcMount.name,
        mountPath: srcMount.containerPath
      });
    });
  });
}

export default function (template, srcMounts) {
  if( Array.isArray(template) ) {
    template.forEach(t => applySrcMounts(t, srcMounts));
  } else {
    applySrcMounts(template, srcMounts);
  }
}