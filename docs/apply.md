# cork-kube apply

The `apply` command renders a Kustomize template and applies it to the active Kubernetes cluster. It is the low-level counterpart to [`cork-kube start`](service-lifecycle.md#start) — `start` calls `apply` internally for each service defined in your project config.

Use `apply` directly when you are working with a single kustomize template outside of a full project config, or when you need precise control over edits and source mounts at apply time.

## Overlay resolution and base fallback

When `-o <name>` is provided, cork-kube looks for `<root-directory>/overlays/<name>`. If that directory does not exist, it automatically falls back to `<root-directory>/base` and continues without error. The apply output always prints which overlay was actually used, so you can tell at a glance whether the fallback occurred:

```
Applying my-service: /path/to/k8s/my-service
 - Overlay: base        ← fell back because 'local-dev' overlay was not found
```

You can also pass a comma-separated list of overlay names to `-o`. cork-kube will try each in order and use the first one that exists:

```bash
# Use 'local-dev' overlay if it exists, otherwise try 'staging', otherwise fall back to base
cork-kube apply ./k8s -o local-dev,staging
```

This makes it straightforward to share a single config across services where only some have environment-specific overlays.

---

## Kustomize basics

If you are new to Kustomize, think of it as a structured way to manage Kubernetes YAML with environment-specific overrides. A typical layout looks like:

```
k8s/
  base/
    deployment.yaml
    service.yaml
    kustomization.yaml
  overlays/
    local-dev/
      kustomization.yaml   # patches base for local dev
    staging/
      kustomization.yaml   # patches base for staging
```

`cork-kube apply ./k8s -o local-dev` renders the `local-dev` overlay and applies the resulting YAML to the cluster.

```bash
cork-kube apply <root-directory> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<root-directory>` | The root kustomize directory, containing `base/` and `overlays/` subdirectories |

**Options:**

| Flag | Description |
|---|---|
| `-o, --overlay <name>` | Overlay name to apply (subdirectory under `overlays/`) |
| `-e, --edit <jsonpath=value...>` | Edit a YAML value via jsonpath before applying. Can be specified multiple times. |
| `-m, --source-mount <path...>` | Path to a source mount file. Can be specified multiple times. |
| `-l, --local-dev` | Strip resource limits, `nodeSelector`, and `imagePullPolicy: Always` — removes production constraints that can cause issues on local clusters |
| `--local-dev-remote` | Like `--local-dev` but keeps `imagePullPolicy: Always` — useful when pulling remote images on a local cluster |
| `-d, --dry-run` | Render and print the templates to stdout without applying them |
| `-s, --show-unused-edits` | Print any `--edit` expressions that did not match any resource |
| `-q, --quiet` | Suppress output |

**Examples:**

```bash
# Apply the staging overlay
cork-kube apply ./k8s -o staging

# Dry run — see what would be applied without sending to the cluster
cork-kube apply ./k8s -o local-dev -d

# Apply with a jsonpath edit to set an image tag
cork-kube apply ./k8s -o staging -e "spec.template.spec.containers[?(@.name=='api')].image=my-registry/api:v1.2.3"

# Apply with source mounts for local development
cork-kube apply ./k8s -o local-dev --local-dev -m ./source-mounts.json
```

---

## jsonpath editing

The `-e` flag accepts expressions in `jsonpath=value` format. The jsonpath is evaluated against each Kubernetes resource in the kustomize output. If a path matches, the value is set. You can pass multiple `-e` flags.

A few common patterns:

```bash
# Set a specific container's image
-e "spec.template.spec.containers[?(@.name=='api')].image=my-registry/api:v1.2.3"

# Set replica count
-e "spec.replicas=3"

# Set an environment variable in a container
-e "spec.template.spec.containers[?(@.name=='api')].env[?(@.name=='LOG_LEVEL')].value=debug"
```

Use `-s` / `--show-unused-edits` to surface any expressions that did not match — helpful when debugging a config change that is not taking effect.

---

## Source mounts

Source mounts inject `hostPath` volumes into your Deployments and StatefulSets so local source directories are mounted into the running pod. This is the Kubernetes equivalent of a bind mount in docker-compose and is primarily used in local development.

Pass one or more source mount files with `-m`. See [Project Config — Source mount file](project-config.md#source-mount-file) for the file format.

---

## Local dev flags

When running on a local Kubernetes cluster (Docker Desktop or microk8s), production YAML configurations like resource limits, node selectors, and `imagePullPolicy: Always` can cause scheduling failures or unexpected image pulls. `--local-dev` strips these automatically so you do not have to modify your base or overlay config.

Use `--local-dev-remote` if you want the same stripping behavior but still need `imagePullPolicy: Always` because you are pulling images from a remote registry.
