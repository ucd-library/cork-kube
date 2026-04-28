# cork-kube pod

The `pod` command provides helpers for interacting with running pods. It handles the tedious parts of working with Kubernetes pods — looking up pod names, filtering out terminating instances, selecting the right container — so you can focus on the task.

If you are familiar with docker, these commands provide the same capabilities you are used to, but targeting Kubernetes pods:

| docker | cork-kube |
|---|---|
| `docker exec -it <name> bash` | `cork-kube pod exec <env> <service>` |
| `docker logs -f <name>` | `cork-kube pod logs <env> <service>` |
| port mapping in compose file | `cork-kube pod port-forward <env> <service> <port>` |

cork-kube finds the right pod automatically using a label selector (default label: `app=<service>`).

## Commands

- [pod exec](#pod-exec) — Open a shell or run a command in a running pod
- [pod logs](#pod-logs) — Follow logs from a running pod
- [pod port-forward](#pod-port-forward) — Forward a local port to a pod

---

## pod exec

Execute a command inside a running pod. Defaults to opening an interactive `bash` shell. The equivalent of `docker exec -it <name> bash`.

```bash
cork-kube pod exec <env> <service> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment |
| `<service>` | Service name — matched against the `app` label by default |

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name |
| `-c, --config <path>` | Path to config file |
| `-n, --container <name>` | Target a specific container (for pods with more than one container) |
| `-e, --command <command>` | Command to run inside the pod (default: `bash`) |
| `-t, --tag <tag>` | Label key to use when finding the pod (default: `app`) |

**Examples:**

```bash
# Open an interactive bash shell
cork-kube pod exec local-dev my-api

# Run a one-off command
cork-kube pod exec local-dev my-api -e "npm run db:migrate"

# Target a specific container in a multi-container pod
cork-kube pod exec local-dev my-api -n sidecar
```

---

## pod logs

Follow the log output of a running pod. Automatically filters out pods that are in the process of terminating so you always see output from a healthy instance. The equivalent of `docker logs -f <name>`.

```bash
cork-kube pod logs <env> <service> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment |
| `<service>` | Service name |

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name |
| `-c, --config <path>` | Path to config file |
| `-n, --container <name>` | Target a specific container within the pod |
| `-t, --tag <tag>` | Label key to use when finding the pod (default: `app`) |

**Examples:**

```bash
# Follow logs for a service
cork-kube pod logs local-dev my-api

# Follow logs for a specific container
cork-kube pod logs local-dev my-api -n my-container
```

---

## pod port-forward

Forward a local port to a port on a running pod. Useful for accessing services that are not externally exposed, such as a database or an internal admin API.

In docker-compose you would add a `ports` mapping to your service definition. With Kubernetes you use port-forward on-demand when you need direct access to a pod.

```bash
cork-kube pod port-forward <env> <service> <localPort:podPort> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment |
| `<service>` | Service name |
| `<localPort:podPort>` | Port mapping in `localPort:podPort` format |

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name |
| `-c, --config <path>` | Path to config file |

**Examples:**

```bash
# Forward local port 5432 to the postgres pod
cork-kube pod port-forward local-dev postgres 5432:5432

# Forward local port 8080 to port 3000 on the api pod
cork-kube pod port-forward local-dev my-api 8080:3000
```
