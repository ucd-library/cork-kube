# cork-kube dashboard

> **Deprecated (legacy subcommands removed).** The old `dashboard create/token/proxy/open` commands have been removed. We use [Headlamp](https://headlamp.dev) as our Kubernetes UI. The `dashboard` command now simply opens Headlamp.

Opens the Headlamp Kubernetes UI desktop application. Optionally activates a project environment first so Headlamp opens pointed at the right cluster.

```bash
cork-kube dashboard <env> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<env>` | Project environment to activate before opening Headlamp. |

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <config>` | Path to config file |
| `-p, --project <project>` | Project name |

**Examples:**

```bash
cork-kube dashboard -p my-project staging
cork-kube dashboard -p my-project local-dev
```

## Already running check

Before opening Headlamp, the command checks whether it is already running. If it is, the command exits with an error rather than launching a second instance — because the existing instance may have been started with a different `KUBECONFIG` setting and would be pointing at the wrong cluster:

```
Headlamp is already running and may have been launched with a different KUBECONFIG setting.
Please close Headlamp first, then run this command again.
```

## Custom kubeconfig environments

For environments that use a kubeconfig file outside the default `~/.kube/config` (e.g. microk8s), Headlamp needs the `KUBECONFIG` environment variable set in your terminal before it is launched. If you run `cork-kube dashboard <env>` and the environment requires a custom kubeconfig but `KUBECONFIG` is not set, the command will exit with an error and print the export command you need to run:

```
This environment uses a custom kubeconfig: /home/user/.kube/my-project-local-dev-microk8s-config
Set KUBECONFIG in your terminal first, then run this command again:
  export KUBECONFIG=/home/user/.kube/my-project-local-dev-microk8s-config
```

Run the export, then call `cork-kube dashboard <env>` again.

## Getting Headlamp

Download the desktop app from [headlamp.dev](https://headlamp.dev). It is available for macOS, Windows, and Linux, and reads your local kubeconfig automatically — no per-cluster setup required.
