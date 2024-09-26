# cork-kube
kubectl wrapper for working with kubectl kustomization configurations

## Installation
```bash
npm install -g @ucd-lib/cork-kube
```

## Usage

```bash
cork-kube --help
```

Commands:

- `apply`: Apply a kustomization configuration
- `init-overlay`: Init a kustomization overlay from a base directory

## Source Mount File

A source mount file should have the following format:

```json
[{
  "name": "Of the mount",
  "containerPath": "/path/in/container",
  "sourcePath": "relative/path/to/source"
}]
```

Properties:
- `name`: The name of the mount. This is used to identify the mount in the source mount file.
- `containerPath`: The path in the container where the source should be mounted.
- `sourcePath`: The path to the source that should be mounted in the container. This path is relative to the location of the source mount file.


Example file located at `/home/jrmerz/dev/my-app-deployment/source-mounts.json`:
```json
[
  {
    "name": "my-source",
    "containerPath": "/app/src",
    "sourcePath": "../../my-app/src"
  }
]
```

Will add the following to the deployment or statefulset:
```yaml
spec:
  template:
    spec:
      containers:
      - name: my-app
        volumeMounts:
        - name: my-source
          mountPath: /app/src
      volumes:
      - name: my-source
        hostPath:
          path: /home/jrmerz/dev/my-app/src
```
## Project Init File

cork-kube can ensure your `kubectl` and `gcloud` cli's are setup to the proper Google Cloud project and Kubernetes cluster/namespace for each of your projects environments.  To do this add a `.cork-kube-config` file to the root of your project.  This file should be a json object with the following properties:

```json
{
  "project": "my-project",
  "environments": {}
}
```

where `environments` is an object with the following properties:

- platform: The k8s platform to use.  Should be `gke` or `docker-desktop`
- cluster: The name of the cluster to use (only used for `gke`)
- zone: The zone your GKE cluster resides in (only used for `gke`)
- project: The Google Cloud project name to use 
- namespace: The Kubernetes namespace to use

Example:

```json
{
  "project" : "my-project",

  "environments" : {
    "local-dev" : {
      "project" : "gc-my-project",
      "platform" : "docker-desktop",
      "namespace" : "my-project"
    },
    "sandbox" : {
      "platform" : "gke",
      "namespace" : "default",
      "cluster" : "my-project-sandbox",
      "zone" : "us-central1-c",
      "project" : "gc-my-project"
    },
    "prod" : {
      "platform" : "gke",
      "namespace" : "default",
      "cluster" : "my-project",
      "zone" : "us-central1-c",
      "project" : "gc-my-project"
    }
  }
}
```

Then in the root of your project run:

```bash
cork-kube init local-dev
```

### Account verification

You can assign a user account for a `cork-kube` project

Example:

```bash
cork-kube set-account my-project jrmerz@ucdavis.edu
```

Once a user account is assign `cork-kube init` will ensure you are logged in with the proper account, exiting with error if you are not.
