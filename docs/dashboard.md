# cork-kube dashboard

> **Deprecated.** The `dashboard` command is no longer actively maintained. We are moving to [Headlamp](https://headlamp.dev) as our Kubernetes UI. See [Migrating to Headlamp](#migrating-to-headlamp) below.

The `dashboard` command helps set up and access the [Kubernetes Dashboard](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/) — a web UI for browsing cluster resources, viewing pod logs, and inspecting deployments.

Dashboard support is designed for **Docker Desktop** and **microk8s** local environments. It is not intended for GKE production clusters.

## Typical workflow

```bash
# 1. Install the dashboard (first time only, Docker Desktop)
cork-kube dashboard create local-dev -p my-project

# 2. Get an access token
cork-kube dashboard token local-dev -p my-project

# 3. Start the proxy and open the browser
cork-kube dashboard proxy local-dev -p my-project -o
```

## Commands

- [dashboard create](#dashboard-create) — Install the Kubernetes Dashboard (Docker Desktop only)
- [dashboard token](#dashboard-token) — Get an access token
- [dashboard proxy](#dashboard-proxy) — Start the kubectl proxy
- [dashboard open](#dashboard-open) — Open the dashboard URL in a browser

---

## dashboard create

Install the Kubernetes Dashboard into a Docker Desktop cluster. Creates the `kubernetes-dashboard` namespace, deploys the dashboard, and sets up an `admin-user` service account with cluster-admin access.

After running, follow the instructions it prints to extend the token TTL to 24 hours — the default 30-minute expiry is very short for local development.

```bash
cork-kube dashboard create <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment (must be configured with `platform: docker-desktop`) |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |

---

## dashboard token

Generate an access token for logging into the dashboard.

- **Docker Desktop**: creates a 720-hour (30-day) token for the `admin-user` service account
- **microk8s**: creates a token for the `default` service account

```bash
cork-kube dashboard token <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |

---

## dashboard proxy

Start `kubectl proxy`, which makes the dashboard accessible at:

```
http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

```bash
cork-kube dashboard proxy <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment (must be configured with `platform: docker-desktop`) |

**Options:**

| Flag | Description |
|---|---|
| `-o, --open` | Open the dashboard in the default browser after starting the proxy |
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |

---

## dashboard open

Open the dashboard URL in the default browser. Requires the proxy (`dashboard proxy`) to already be running in another terminal.

```bash
cork-kube dashboard open
```

---

## Migrating to Headlamp

[Headlamp](https://headlamp.dev) is a modern, extensible Kubernetes UI that works across Docker Desktop, microk8s, and GKE without the proxy/token setup that the Kubernetes Dashboard requires.

**Install Headlamp:**

Download the desktop app from [headlamp.dev](https://headlamp.dev) — it is available for macOS, Windows, and Linux.

**Connect to your cluster:**

Headlamp reads your local kubeconfig (`~/.kube/config`) automatically. After activating an environment with cork-kube, Headlamp will pick up the current context:

```bash
cork-kube activate -p my-project local-dev
# then open Headlamp — it will be pointing at the local-dev cluster
```

For environments that use a custom kubeconfig (e.g. microk8s registered with `cork-kube project set -k`), set the `KUBECONFIG` environment variable before launching Headlamp, or add the kubeconfig path in Headlamp's settings.

**What it replaces:**

| cork-kube dashboard | Headlamp equivalent |
|---|---|
| `dashboard create` | Not needed — no installation required per-cluster |
| `dashboard token` | Not needed — Headlamp handles authentication |
| `dashboard proxy` | Not needed — Headlamp connects directly |
| `dashboard open` | Just open the Headlamp desktop app |
