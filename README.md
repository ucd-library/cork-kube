# cork-kube

cork-kube is a CLI tool that wraps `kubectl` and `gcloud` to simplify deploying and managing applications on Kubernetes. It is designed for teams comfortable with Docker and docker-compose who are adopting Kubernetes — providing a familiar, project-oriented workflow on top of raw `kubectl` and [Kustomize](https://kustomize.io).

## How it relates to docker-compose

If you know docker-compose, cork-kube covers the same day-to-day tasks in Kubernetes:

| docker-compose | cork-kube |
|---|---|
| `docker compose up` | `cork-kube start <env>` |
| `docker compose down` | `cork-kube stop <env>` |
| `docker compose restart` | `cork-kube restart <env>` |
| `docker exec -it <name> bash` | `cork-kube pod exec <env> <service>` |
| `docker logs -f <name>` | `cork-kube pod logs <env> <service>` |
| port mapping in compose file | `cork-kube pod port-forward <env> <service> <port>` |

Under the hood, cork-kube uses **Kustomize** to manage Kubernetes YAML. Think of Kustomize as a way to have a base configuration with environment-specific overlays on top — similar to `docker-compose.yml` + `docker-compose.override.yml`.

## The two parts of the pipeline

cork-kube covers two distinct stages of the deployment cycle:

**1. Building images** — `cork-kube build` integrates with [Google Cloud Build](https://cloud.google.com/build) and the [cork-build-registry](https://github.com/ucd-library/cork-build-registry) to build and publish Docker images. The cork-build-registry is a central registry where project versions, image configurations, and build dependencies are defined. **A version must be registered there before it can be built.**

**2. Deploying to Kubernetes** — Commands like `start`, `stop`, `apply`, and `secrets` deploy those images to a Kubernetes cluster. They work from a per-project config file (`.cork-kube-config`) that defines your environments, services, and secrets.

These two stages are independent: you build images once and deploy them many times across environments.

## Installation

```bash
npm install -g @ucd-lib/cork-kube
```

## Quick start

```bash
# One-time: register your project config with cork-kube
cork-kube project set -c /path/to/.cork-kube-config

# Set your GCP account for the project (optional, enables account verification)
cork-kube project set -p my-project -e you@ucdavis.edu

# Activate the environment (points gcloud + kubectl at the right cluster)
cork-kube activate -p my-project local-dev

# Start all services
cork-kube start -p my-project local-dev

# Tail logs from a running pod
cork-kube pod logs local-dev my-service

# Open a shell in a running pod
cork-kube pod exec local-dev my-service

# Stop everything
cork-kube stop -p my-project local-dev
```

## Project configuration

The `.cork-kube-config` file defines your project's environments, services, secrets, and deployment options. It is the central config that most cork-kube commands read from. See [Project Config](docs/project-config.md) for full documentation.

---

## Command reference

### Setup & registration

These commands are typically run once per developer machine when setting up a project. `project` handles registration; `activate` switches your local tooling to point at the right cluster; `status` lets you verify where you're pointed.

| Command | Description |
|---|---|
| [`cork-kube project set`](docs/project.md#project-set) | Register a project config file; set GCP account or kubeconfig |
| [`cork-kube project list`](docs/project.md#project-list) | List registered projects |
| [`cork-kube activate <env>`](docs/activate.md#activate) | Set gcloud and kubectl to the project environment (alias: `init`) |
| [`cork-kube status`](docs/activate.md#status) | Show the active gcloud and kubectl configuration |

### Service lifecycle

Start, stop, and restart the services defined in your `.cork-kube-config`. These are the commands you'll use most often day-to-day.

| Command | Description |
|---|---|
| [`cork-kube start <env>`](docs/service-lifecycle.md#start) | Start all services for an environment (alias: `up`) |
| [`cork-kube stop <env>`](docs/service-lifecycle.md#stop) | Stop all services for an environment (alias: `down`) |
| [`cork-kube restart <env>`](docs/service-lifecycle.md#restart) | Rolling restart services (Deployments and StatefulSets only) |

### Kubernetes templates

Low-level commands for working directly with Kustomize templates. `apply` is what `start` calls internally for each service. Use these directly when you need fine-grained control or are working outside a full project config.

| Command | Description |
|---|---|
| [`cork-kube apply <dir>`](docs/apply.md) | Render and apply a kustomize template |
| [`cork-kube edit <dir>`](docs/edit-overlay.md#edit) | Edit YAML values in a template via jsonpath |
| [`cork-kube create-overlay <dir> <name>`](docs/edit-overlay.md#create-overlay) | Scaffold a new kustomize overlay |

### Pod operations

Interact with running pods. cork-kube finds the right pod by service name so you don't need to look up pod names manually.

| Command | Description |
|---|---|
| [`cork-kube pod exec <env> <service>`](docs/pod.md#pod-exec) | Open a shell or run a command in a running pod |
| [`cork-kube pod logs <env> <service>`](docs/pod.md#pod-logs) | Follow logs from a running pod |
| [`cork-kube pod port-forward <env> <service> <ports>`](docs/pod.md#pod-port-forward) | Forward a local port to a pod |

### Secrets

| Command | Description |
|---|---|
| [`cork-kube secrets deploy <env>`](docs/secrets.md) | Deploy secrets from Google Cloud Secret Manager |

### Image building

A separate part of the pipeline from deployment. Requires versions to be registered in the [cork-build-registry](https://github.com/ucd-library/cork-build-registry).

| Command | Description |
|---|---|
| [`cork-kube build gcb`](docs/build.md#build-gcb) | Submit a build to Google Cloud Build |
| [`cork-kube build exec`](docs/build.md#build-exec) | Run a local Docker build |
| [`cork-kube build set-env <path>`](docs/build.md#build-set-env) | Write built image tags to an env file |
| [`cork-kube build list`](docs/build.md#build-list) | List projects and versions from the build registry |
| [`cork-kube build validate`](docs/build.md#build-validate) | Validate a project's image configuration |
| [`cork-kube build set-config`](docs/build.md#build-set-config) | Configure build settings (GCB project, registries) |
| [`cork-kube build show-config`](docs/build.md#build-show-config) | Show current build configuration |

### Dashboard (deprecated)

The `dashboard` commands are deprecated. We are moving to [Headlamp](https://headlamp.dev) as our Kubernetes UI — see the [dashboard docs](docs/dashboard.md#migrating-to-headlamp) for migration notes.

| Command | Description |
|---|---|
| [`cork-kube dashboard`](docs/dashboard.md) | ~~Install and access the Kubernetes dashboard~~ (deprecated — use Headlamp) |
