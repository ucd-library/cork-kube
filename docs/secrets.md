# cork-kube secrets

The `secrets` command deploys Kubernetes Secrets sourced from [Google Cloud Secret Manager](https://cloud.google.com/secret-manager). This keeps sensitive values — API keys, passwords, certificates — out of your git repository and in a managed, access-controlled secret store.

Secrets are defined in the `secrets` section of your `.cork-kube-config`. See [Project Config — secrets](project-config.md#secrets) for configuration details.

When you run `cork-kube start` without specifying a service or group, it automatically deploys secrets before starting services. Use `cork-kube secrets deploy` directly when you want to update a secret independently of a full deployment.

## secrets deploy

Deploy secrets from Google Cloud Secret Manager to the Kubernetes cluster for the given environment.

```bash
cork-kube secrets deploy <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Environment to deploy secrets to |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |
| `-s, --secret <name>` | Deploy only a specific secret by name |
| `-r, --redeploy` | Delete the existing secret before recreating it. Use this when a secret value has been updated in GCSM and you need the cluster to pick up the new value. |

**Examples:**

```bash
# Deploy all secrets for the staging environment
cork-kube secrets deploy -p my-project staging

# Deploy a single secret
cork-kube secrets deploy -p my-project staging -s my-api-key

# Force a fresh deploy of a secret (picks up a new value from GCSM)
cork-kube secrets deploy -p my-project staging -s my-api-key -r
```
