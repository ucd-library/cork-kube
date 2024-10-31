# cork-kube
kubectl wrapper for working with kubectl kustomization configurations

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [Project Config File](#project-config-file)
- [Source Mount File](#source-mount-file)
- [Project Init File](#project-init-file)
  - [Account verification](#account-verification)
  - [Specify a project by name](#specify-a-project-by-name)

## Installation
```bash
npm install -g @ucd-lib/cork-kube
```

## Usage

```bash
cork-kube --help
```

Commands:

To see commands run `cork-kube --help`


## Project Config File

You can specify a project config file to define
- the project name
- the environments for the project, including k8s cluster information Google Cloud project information
- secrets that should be applied to the k8s cluster
- kustomize templates (services) that should be applied to the k8s cluster

### Config file location and access

Recommended. The project config file should be located at the root of your project and named `.cork-kube-config`.  This file should be a json object with the following root level properties:

```json
{
  "project": "my-project",
  "environments": {},
  "secrets" : {},
  "serviceTemplates" : {},
  "services" : []
}
```

You can then register the project with `cork-kube` by running:

```bash
cork-kube project set -c /path/to/.cork-kube-config
```

When running `cork-kube` commands, you can specify the path to the project config file with the `-c` flag or if you have registered the project you can use the `-p` flag with the project name.  If you do not specify a config path or project name, `cork-kube` will look for the file in the current working directory.  When specifying a config path, if a directory is provided, `cork-kube` will look for the file `.cork-kube-config` in that directory.

### Config file properties

- `project`: The name of the project
- `environments`: An object with the following properties:
  - `platform`: The k8s platform to use.  Should be `gke` or `docker-desktop`
  - `cluster`: The name of the cluster to use (only used for `gke`)
  - `zone`: The zone your GKE cluster resides in (only used for `gke`)
  - `project`: The Google Cloud project name to use 
  - `namespace`: The Kubernetes namespace to use
- `secrets`: An object with the following properties where the key is the name of the environment and the value is an array of secret objects:
  - `k8sName`: The name of the secret in k8s
  - `mappings`: An array of objects with the following properties
    - `gcsmName`: The name of the secret in Google Cloud Secret Manager
    - `k8sProperty`: The property in the k8s secret (`k8sName`) that should be set to the value of the Google Cloud Secret Manager secret (`gcsmName`)
- `serviceTemplates`: An object with the following properties where the key is the name of the service template and the value is an object.  Any valid service property is allowed.  These templates can be used to apply properties to multiple services.
- `services`: Defines the available kustomize templates as 'services'.  The projects services can be started, stopped or redeployed (deleted then applied) as; a whole, a single service or a group of services (defined by the `group` property).  Services should be an array of objects with the following properties:
  - `path`: The relative path from the config file to the kustomize template root directory.  Note that a 'name' will be applied to the service based on the directory name of the kustomize template.
  - `group`: The name of the group this service belongs to.  This is used to start, stop or redeploy a group of services in a single `cork-kube` command.
  - `edit`: Apply a `cork-kube apply --edit` to the service.  Should be an object with the following properties:
    - `jsonpath`: The jsonpath to the property to edit
    - `value`: The value to set the jsonpath property to
  - `sourceMounts`: Path to source mount file(s) to apply to the service.  Paths should be relative to the location of the config file.
  - `template`: The name of the service template to apply to the service.  This will apply the properties of the `serviceTemplate` to the service.  Note that the properties of the service will override the properties of the template.
  - `environments`: An object where the key is the name of the environment and the value is an object with the same properties as the service object.  These properties will only be applied to the service in the specified environment.
  - `config`: Load config variables for string template properties from a file.  Currently this should be a `.sh` file.
    - `file`: The path to the config file.  This should be relative to the location of the config file.
    - `args`: Object of key/value pairs to set before running the config file.  These will be available in the config file as environment variables. Ex `file:"config.sh"` and `args={LOCAL_DEV:"true"}`, this will call `LOCAL_DEV=true ./config.sh`.
  - `ignore`: If true, the service will be ignored when running `cork-kube` commands.  This is useful for services that are not ready to be deployed or are not used in the current environment (very usual when combined in the `environments` spec). 

Note on service properties. `template`, `group`, `edit` and `sourceMounts` can all be arrays.  If they are arrays, the properties will be applied to the service in the order they are defined in the array.

### Config File String Template Variables

Sometimes you may want dynamic properties in your config file. Ex, in local development you want to reploy a different image based on your branch. You can use string templates in your config file properties.  String templates are defined by wrapping the variable in `${}`.  The variable name should be the name of the environment variable you want to use.  The environment variable should be set in the shell environment before running `cork-kube` or the service can define this `config` property to load the variable from a file.

The variable `${__DIRNAME}` is already defined for you.  This will be replaced with the directory name of the kustomize template. The variable `${__ENV}` is defined as well.  This will be replaced with `environment` argument passed to the `cork-kube` command.

example:

```json
{
  "project" : "my-project",

  "service" : {
    "my-service" : {
      "environments" : {
        "local-dev" : {
          "edit" : {
            "jsonpath": "spec.template.spec.containers[?(@.name=='server')].image", 
            "value": "${MY_SERVER_IMAGE_NAME}:${APP_TAG}"
          }
        }
      }
    }
  }
}
```

This will replace `${MY_SERVER_IMAGE_NAME}` with the value of the `MY_SERVER_IMAGE_NAME` environment variable and `${APP_TAG}` with the value of the `APP_TAG` environment variable when running `cork-kube apply` in the `local-dev` environment.

## Source Mount File

You can mount source code into a container by using a source mount file. This is useful for development environments where you want to mount your source code into a container.  You will specify the source mount file(s) as a flag when running `cork-kube apply`.


```yaml

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

### Account verification

You can assign a user account for a `cork-kube` project

Example:

```bash
cork-kube project set -p my-project -e jrmerz@ucdavis.edu
```

Once a user account is assign `cork-kube init` will ensure you are logged in with the proper account, exiting with error if you are not.

### Specify a project by name

run `cork-kube project set -c [path to config file]` to register the project with cork-kube.  This will allow you to run `cork-kube init -p my-project local-dev` or `cork-kube stop -p my-project local-dev` without specifying the path to the init file.