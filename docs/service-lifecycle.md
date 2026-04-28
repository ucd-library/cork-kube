# Service Lifecycle: start / stop / restart

These three commands manage the lifecycle of the services defined in your `.cork-kube-config`. They are the commands you will use most frequently and map directly to the docker-compose workflow:

| docker-compose | cork-kube |
|---|---|
| `docker compose up` | `cork-kube start <env>` |
| `docker compose down` | `cork-kube stop <env>` |
| `docker compose restart <service>` | `cork-kube restart <env> -s <service>` |

Under the hood:
- `start` renders each service's kustomize template and applies it to the cluster. If secrets are defined, it deploys them first.
- `stop` deletes those Kubernetes resources from the cluster (Deployments, StatefulSets, Services, Jobs, DaemonSets).
- `restart` issues a rolling restart, replacing pods one at a time with no downtime (Deployments and StatefulSets only).

All three commands accept `-p <project>` or `-c <config>` to identify the project, and an environment name as the first argument.

## Commands

- [start](#start) — Start all services (alias: `up`)
- [stop](#stop) — Stop all services (alias: `down`)
- [restart](#restart) — Rolling restart services

---

## start

Start services for an environment. Equivalent to `docker compose up`.

```bash
cork-kube start <env> [options]
# alias:
cork-kube up <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | The environment to start |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |
| `-s, --service <name>` | Start only a specific service |
| `-g, --group <name>` | Start only a specific group of services |
| `-r, --redeploy` | Delete the service before redeploying. Forces a clean restart. |
| `-d, --debug` | Debug mode — prints what would happen without applying anything |
| `--ignore-source-mounts` | Skip source mounts even if they are defined in the config |

**Examples:**

```bash
# Start all services
cork-kube start -p my-project local-dev

# Start a specific service
cork-kube start -p my-project local-dev -s my-api

# Start all services in the backend group
cork-kube start -p my-project local-dev -g backend

# Force a clean redeploy of a service
cork-kube start -p my-project local-dev -s my-api -r

# Debug — see what would be deployed without applying
cork-kube start -p my-project local-dev -d
```

---

## stop

Stop services for an environment. Deletes Kubernetes resources from the cluster. Equivalent to `docker compose down`.

```bash
cork-kube stop <env> [options]
# alias:
cork-kube down <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | The environment to stop |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |
| `-s, --service <service>` | Stop only a specific service |
| `-g, --group <group>` | Stop only a specific group of services |
| `-v, --volumes` | Also remove PersistentVolumeClaims and unbound PersistentVolumes. **Only allowed on docker-desktop** — too destructive for shared cluster contexts. |

**Examples:**

```bash
# Stop all services
cork-kube stop -p my-project local-dev

# Stop a single service
cork-kube stop -p my-project local-dev -s my-database

# Stop all services and remove persistent volumes (local dev only)
cork-kube stop -p my-project local-dev -v
```

---

## restart

Perform a rolling restart of services. Unlike `stop` followed by `start`, a rolling restart replaces pods gradually so the service remains available throughout. This only applies to **Deployments** and **StatefulSets** — Jobs and DaemonSets are not restarted.

Use this when you want to pick up a config change or a new image without taking the service offline.

```bash
cork-kube restart <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | The environment to restart |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |
| `-s, --service <service>` | Restart only a specific service |
| `-g, --group <group>` | Restart only a specific group of services |

**Examples:**

```bash
# Rolling restart all services in staging
cork-kube restart -p my-project staging

# Restart a single service
cork-kube restart -p my-project staging -s my-api

# Restart all services in the backend group
cork-kube restart -p my-project staging -g backend
```
