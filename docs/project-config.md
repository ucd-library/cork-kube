# Project Config File

The `.cork-kube-config` file is the heart of cork-kube. It defines your project's environments, secrets, and services, and is the source of truth that `start`, `stop`, `apply`, and `secrets` commands read from.

The recommended location is the root of your deployment repository, named `.cork-kube-config`.

## Contents

- [Basic structure](#basic-structure)
- [Config file location and access](#config-file-location-and-access)
- [environments](#environments)
- [secrets](#secrets)
- [serviceTemplates](#servicetemplates)
- [services](#services)
- [String template variables](#string-template-variables)
- [Source mount file](#source-mount-file)

---

## Basic structure

```json
{
  "project": "my-project",
  "environments": {},
  "secrets": {},
  "serviceTemplates": {},
  "services": []
}
```

| Property | Description |
|---|---|
| `project` | The project name. Used to identify the project when registered with cork-kube. |
| `environments` | Cluster and GCP settings per environment. |
| `secrets` | Google Cloud Secret Manager secrets to deploy per environment. |
| `serviceTemplates` | Reusable service property sets. |
| `services` | The kustomize templates (services) to deploy. |

---

## Config file location and access

Register the config file once:

```bash
cork-kube project set -c /path/to/.cork-kube-config
```

After registration you can reference the project by name with `-p` instead of providing a path with `-c` every time:

```bash
# Without registration — specify path each time
cork-kube start -c /path/to/.cork-kube-config local-dev

# With registration — use project name
cork-kube start -p my-project local-dev
```

If you run a cork-kube command from the directory containing `.cork-kube-config` without specifying `-c` or `-p`, cork-kube will find it automatically.

---

## environments

Defines the Kubernetes and Google Cloud settings for each environment. Keys are environment names (e.g. `local-dev`, `staging`, `production`).

```json
{
  "environments": {
    "local-dev": {
      "platform": "docker-desktop",
      "namespace": "my-project"
    },
    "staging": {
      "platform": "gke",
      "cluster": "my-cluster",
      "zone": "us-central1",
      "project": "my-gcp-project",
      "namespace": "my-project-staging"
    }
  }
}
```

| Property | Description |
|---|---|
| `platform` | Kubernetes platform: `gke`, `docker-desktop`, or `microk8s` |
| `cluster` | GKE cluster name (GKE only) |
| `zone` | GKE cluster zone (GKE only) |
| `project` | Google Cloud project name (GKE only) |
| `namespace` | Kubernetes namespace to use |

---

## secrets

Defines secrets to pull from [Google Cloud Secret Manager](https://cloud.google.com/secret-manager) and deploy to the Kubernetes cluster. Keys are environment names; values are arrays of secret objects.

Each secret object has a `k8sName` and a **type** that determines how the secret is created. Four types are supported:

| Type | Trigger property | Kubernetes resource | Use case |
|---|---|---|---|
| [Key-value mappings](#key-value-mappings) | `mappings` array (default) | `Secret` (generic) | Individual key/value pairs from separate GCSM secrets |
| [Env file](#env-file) | `fromEnvFile: true` | `Secret` (generic) | A single GCSM secret whose value is a full `KEY=VALUE` env file |
| [TLS](#tls) | `tls: true` | `Secret` (tls) | TLS certificate and key stored as separate GCSM secrets |
| [Kubeconfig](#kubeconfig) | `kubeconfig: true` | `ConfigMap` | Injects a kubeconfig file for use by in-cluster services |

Deploy secrets with:
```bash
cork-kube secrets deploy -p my-project staging
```

---

### Key-value mappings

The default type. Each entry in `mappings` fetches one value from GCSM and adds it as a named key in the Kubernetes Secret.

```json
{
  "secrets": {
    "staging": [
      {
        "k8sName": "my-app-secrets",
        "mappings": [
          { "gcsmName": "my-app-db-password", "k8sProperty": "DB_PASSWORD" },
          { "gcsmName": "my-app-api-key",     "k8sProperty": "API_KEY" }
        ]
      }
    ]
  }
}
```

| Property | Description |
|---|---|
| `k8sName` | Name of the Kubernetes Secret to create |
| `mappings[].gcsmName` | Name of the secret in Google Cloud Secret Manager |
| `mappings[].k8sProperty` | Key name in the resulting Kubernetes Secret |

---

### Env file

Set `fromEnvFile: true` when the GCSM secret value is itself a full env file (`KEY=VALUE` lines). The entire file is loaded as the secret, making every line available as a separate key. Useful when you manage a whole set of related config values as one GCSM entry.

```json
{
  "secrets": {
    "staging": [
      {
        "k8sName": "my-app-env",
        "fromEnvFile": true,
        "gcsmName": "my-app-staging-env-file"
      }
    ]
  }
}
```

| Property | Description |
|---|---|
| `k8sName` | Name of the Kubernetes Secret to create |
| `fromEnvFile` | Must be `true` |
| `gcsmName` | GCSM secret whose value is the env file contents |

---

### TLS

Set `tls: true` to create a `kubernetes.io/tls` Secret. The certificate and private key are fetched from two separate GCSM secrets. An optional `namespace` override is supported for cases where the TLS secret must live in a different namespace from the rest of the project (e.g. an ingress controller namespace).

```json
{
  "secrets": {
    "staging": [
      {
        "k8sName": "my-app-tls",
        "tls": true,
        "certGcsmName": "my-app-staging-tls-cert",
        "keyGcsmName":  "my-app-staging-tls-key",
        "namespace": "ingress-nginx"
      }
    ]
  }
}
```

| Property | Description |
|---|---|
| `k8sName` | Name of the Kubernetes TLS Secret to create |
| `tls` | Must be `true` |
| `certGcsmName` | GCSM secret containing the TLS certificate (PEM) |
| `keyGcsmName` | GCSM secret containing the TLS private key (PEM) |
| `namespace` | Optional. Namespace to create the secret in. Defaults to the project namespace. |

---

### Kubeconfig

Set `kubeconfig: true` to inject a kubeconfig file into the cluster as a **ConfigMap** (not a Secret). This is used when an in-cluster service needs to communicate with the Kubernetes API — for example, a service that manages other workloads. The `k8sName` becomes the ConfigMap name.

cork-kube reads the kubeconfig registered for the environment via [`cork-kube project set -k`](project.md#project-set), falling back to `~/.kube/config`. It extracts the cluster entry matching the environment's `context` and writes it as the ConfigMap data. On `docker-desktop` the cluster server address is normalised to `https://kubernetes.docker.internal:6443`.

Only supported on `docker-desktop` and `microk8s` platforms.

```json
{
  "secrets": {
    "local-dev": [
      {
        "k8sName": "my-service-kubeconfig",
        "kubeconfig": true
      }
    ]
  }
}
```

| Property | Description |
|---|---|
| `k8sName` | Name of the ConfigMap to create |
| `kubeconfig` | Must be `true` |

---

## serviceTemplates

Reusable property sets you can apply to multiple services. Any valid service property is allowed. Services reference a template by name using the `template` property, and their own properties take precedence over the template.

```json
{
  "serviceTemplates": {
    "default": {
      "sourceMounts": ["./source-mounts.json"]
    },
    "no-source-mounts": {}
  }
}
```

---

## services

Defines the kustomize templates that cork-kube will deploy. Each entry points to a kustomize root directory and can have optional deployment configuration.

```json
{
  "services": [
    {
      "path": "./k8s/my-api",
      "group": "backend"
    },
    {
      "path": "./k8s/my-worker",
      "group": "backend",
      "template": "default"
    },
    {
      "path": "./k8s/my-frontend",
      "group": "frontend",
      "environments": {
        "local-dev": {
          "ignore": true
        }
      }
    }
  ]
}
```

### Service properties

| Property | Description |
|---|---|
| `path` | Relative path from the config file to the kustomize template root. The directory name becomes the service name. |
| `group` | Group name. Lets you start/stop/restart a subset of services with `-g`. |
| `template` | Name of a `serviceTemplate` to apply. Properties defined on the service override the template. |
| `edit` | A jsonpath edit (or array of edits) to apply when deploying. Each edit has `jsonpath` and `value` properties. |
| `sourceMounts` | Path(s) to source mount file(s), relative to the config file. |
| `environments` | Environment-specific overrides. Keys are environment names; values are objects with any of the above service properties. |
| `config` | Load string template variables from a shell script. Has `file` (path) and `args` (key/value env vars to pass) properties. |
| `ignore` | If `true`, skip this service in all cork-kube commands. Commonly used in `environments` to disable a service in a specific environment. |

`template`, `group`, `edit`, and `sourceMounts` can all be arrays. If they are arrays, they are applied in order.

### Environment-specific service config

Use `environments` to override any service property for a specific environment:

```json
{
  "services": [
    {
      "path": "./k8s/my-api",
      "group": "backend",
      "environments": {
        "local-dev": {
          "edit": {
            "jsonpath": "spec.template.spec.containers[?(@.name=='api')].image",
            "value": "${MY_API_IMAGE}:${APP_TAG}"
          }
        },
        "staging": {
          "ignore": true
        }
      }
    }
  ]
}
```

---

## String template variables

You can use `${}` placeholders in string values within your config file. These are resolved at command runtime from shell environment variables or a `config` file.

Two built-in variables are always available:

| Variable | Value |
|---|---|
| `${__DIRNAME}` | The directory name of the kustomize template for the current service |
| `${__ENV}` | The environment name passed to the cork-kube command |

Any other `${VAR}` will be resolved from the current shell environment.

To load variables from a file, use the `config` property on a service:

```json
{
  "services": [
    {
      "path": "./k8s/my-api",
      "config": {
        "file": "./config.sh",
        "args": { "LOCAL_DEV": "true" }
      },
      "environments": {
        "local-dev": {
          "edit": {
            "jsonpath": "spec.template.spec.containers[?(@.name=='api')].image",
            "value": "${MY_API_IMAGE}:${APP_TAG}"
          }
        }
      }
    }
  ]
}
```

This will call `LOCAL_DEV=true ./config.sh` and make any exported variables available as template substitutions.

---

## Source mount file

A source mount file injects local source code directories into a Deployment or StatefulSet as `hostPath` volumes. This is the Kubernetes equivalent of a bind mount in docker-compose and is useful for local development where you want live code changes reflected in running pods.

Source mount files are JSON arrays:

```json
[
  {
    "name": "my-source",
    "containerPath": "/app/src",
    "sourcePath": "../../my-app/src"
  }
]
```

| Property | Description |
|---|---|
| `name` | Name of the volume mount. Must be unique within the pod. |
| `containerPath` | The path inside the container where the source will be mounted. |
| `sourcePath` | Path to the source directory on the host, relative to the source mount file's location. |

This generates the following in your Deployment or StatefulSet:

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
            path: /home/user/dev/my-app/src
```

Reference source mount files from a service using the `sourceMounts` property, or pass them directly to `cork-kube apply` with `-m`.
