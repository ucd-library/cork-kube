# cork-kube activate / status

## activate

The `activate` command (alias: `init`) configures your local `gcloud` and `kubectl` to point at the correct Google Cloud project and Kubernetes cluster for a given environment. Think of it as switching Docker contexts — it ensures all subsequent commands target the right cluster.

Most other cork-kube commands (`start`, `stop`, `pod`, etc.) call `activate` internally, so you usually only need to run it directly when you want to use raw `kubectl` or `gcloud` commands, or to verify your context before a deployment.

If a GCP account is associated with the project (set via [`cork-kube project set -e`](project.md#account-verification)), `activate` will verify you are logged in as that account and exit with an error if not.

```bash
cork-kube activate <env> [options]
# alias:
cork-kube init <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | The environment to activate (must match a key in `environments` in your `.cork-kube-config`) |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file (or directory containing one) |
| `-p, --project <project>` | Project name (if registered via `cork-kube project set`) |

**Examples:**

```bash
# Activate using a registered project name
cork-kube activate -p my-project local-dev

# Activate using a config file path
cork-kube activate -c /path/to/.cork-kube-config staging

# Using the init alias
cork-kube init -p my-project production
```

---

## What activate actually sets up

`activate` does two things to your shell environment:

**gcloud** — Creates (or updates) a named gcloud configuration called `<project>-<env>` and activates it. This sets the active GCP project, compute zone, and account. All subsequent `gcloud` commands in your terminal target that project without needing `--project` flags.

**kubectl** — For GKE, fetches cluster credentials via `gcloud container clusters get-credentials` to ensure the kubeconfig entry is current. Then sets the active kubectl context to the cluster and sets the **default namespace** to the one defined in your config. All subsequent `kubectl` commands target the right cluster and namespace without needing `--context` or `-n` flags.

cork-kube is a helper, not a lock-in. Once activated, you have full native access to both tools for anything cork-kube does not cover.

### Custom kubeconfig (microk8s)

For environments that use a kubeconfig file outside the default `~/.kube/config` (e.g. microk8s), `activate` will print an export command you need to run to make `kubectl` work in your current terminal session:

```
Run the following command to set the kubeconfig file for this terminal session:
export KUBECONFIG=/home/user/.kube/my-project-local-dev-microk8s-config
```

---

## Using kubectl directly after activate

After `cork-kube activate`, you have the full `kubectl` command available, already scoped to the right cluster and namespace. A few common operations:

```bash
# List all running pods in the project namespace
kubectl get pods

# Watch pod status in real time (useful during a deployment)
kubectl get pods -w

# Inspect a pod — useful for debugging scheduling issues or crash loops
kubectl describe pod <pod-name>

# View recent cluster events, sorted by time (great first stop when something breaks)
kubectl get events --sort-by=.metadata.creationTimestamp

# Check the rollout status of a deployment
kubectl rollout status deployment/my-api

# Scale a deployment manually
kubectl scale deployment/my-api --replicas=3

# View a deployment's current config
kubectl get deployment my-api -o yaml

# Delete a stuck or crashlooping pod — Kubernetes will restart it automatically
kubectl delete pod <pod-name>

# Apply a manifest directly, bypassing cork-kube
kubectl apply -k ./k8s/my-service/overlays/staging
```

## Using gcloud directly after activate

After activate, `gcloud` is scoped to the right project, zone, and account:

```bash
# Verify which account and project are active
gcloud config list

# List recent Cloud Build jobs
gcloud builds list --limit=10

# Stream logs for a specific build
gcloud builds log <build-id>

# List images in Artifact Registry
gcloud artifacts docker images list <registry-host>/<project>/<repo>

# Access a secret value directly from Cloud Secret Manager
gcloud secrets versions access latest --secret=my-secret-name

# List all secrets in the project
gcloud secrets list

# List GKE clusters in the active project
gcloud container clusters list
```

---

## status

Shows the currently active `gcloud` configuration and `kubectl` context. Use this to confirm you're pointed at the right cluster before running a deploy command.

```bash
cork-kube status [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-o, --output <format>` | Output format: `json` or `yaml` (default: `yaml`) |

**Example output:**

```yaml
gcloud:
  configuration: my-project-staging
  project: my-gcp-project
  account: you@ucdavis.edu
kubectl:
  context: gke_my-gcp-project_us-central1_my-cluster
  namespace: my-project-staging
```
