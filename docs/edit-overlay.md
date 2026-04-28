# cork-kube edit / create-overlay

## edit

The `edit` command renders a kustomize template (or docker-compose file) and applies jsonpath edits to the output YAML. By default it prints the result to stdout. Use `--replace` to write the changes back to the source file.

This is most useful in scripted workflows — for example, updating an image tag in a kustomize overlay as part of a CI/CD pipeline, or doing a quick one-off value change without editing YAML by hand.

```bash
cork-kube edit <root-directory> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<root-directory>` | Root kustomize directory (or a docker-compose file path when using `--compose`) |

**Options:**

| Flag | Description |
|---|---|
| `-o, --overlay <name>` | Overlay name to load |
| `-f, --filename <filename>` | Specific filename within the template to target |
| `-e, --edit <jsonpath=value...>` | **Required.** jsonpath expression and value to set. Can be repeated. |
| `-r, --replace` | Write the changes back to the file instead of printing to stdout |
| `-c, --compose` | Use a docker-compose file as the input instead of a kustomize directory |

**Examples:**

```bash
# Print the result of setting replicas to 3 on staging
cork-kube edit ./k8s -o staging -e "spec.replicas=3"

# Update a file in place
cork-kube edit ./k8s -o staging -e "spec.replicas=3" -r

# Update an image tag in a specific file
cork-kube edit ./k8s -o staging -f deployment.yaml \
  -e "spec.template.spec.containers[?(@.name=='api')].image=my-registry/api:v1.2.3" -r

# Edit a docker-compose file
cork-kube edit ./docker-compose.yml -c \
  -e "services.api.image=my-registry/api:v1.2.3" -r
```

---

## create-overlay

Creates a new Kustomize overlay directory scaffolded from the existing `base/` configuration. This is the starting point when adding a new deployment environment (e.g. `staging`, `production`, `local-dev`).

The generated overlay contains a `kustomization.yaml` that references the base, plus stub patch files for each resource type found in the base (Deployments, Services, ConfigMaps, etc.). You then edit the stubs to add environment-specific values.

```bash
cork-kube create-overlay <root-directory> <overlay-name> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<root-directory>` | The root kustomize directory — the directory that contains `base/` |
| `<overlay-name>` | Name of the new overlay to create |

**Options:**

| Flag | Description |
|---|---|
| `-f, --force` | Overwrite an existing overlay |
| `-i, --ignore <type...>` | Skip generating stubs for specific resource types. Example: `Secret ConfigMap` |
| `-t, --tag-name <name>` | Use a specific image tag name in the generated overlay |

**Examples:**

```bash
# Scaffold a production overlay
cork-kube create-overlay ./k8s production

# Scaffold a local-dev overlay, skipping Secret and ConfigMap stubs
cork-kube create-overlay ./k8s local-dev -i Secret ConfigMap

# Overwrite an existing overlay
cork-kube create-overlay ./k8s staging -f
```
