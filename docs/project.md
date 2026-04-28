# cork-kube project

The `project` command registers your project's `.cork-kube-config` file with cork-kube and stores per-project settings (GCP user account, environment kubeconfigs) in the cork-kube global config on your machine.

This is a one-time setup step per developer machine. After registration, you can reference the project by name (`-p my-project`) in any cork-kube command instead of providing a config file path (`-c /path/to/.cork-kube-config`) every time.

## Commands

- [project set](#project-set) — Register a config file; set GCP account or kubeconfig
- [project list](#project-list) — List registered projects

---

## project set

Register a project and/or update its settings.

```bash
cork-kube project set [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-c, --config <path>` | Path to the `.cork-kube-config` file (or a directory containing one) |
| `-p, --project <project>` | Project name — required when using `-e` or `-k` without `-c` |
| `-e, --email <email>` | GCP user account email to associate with this project |
| `-k, --kubeconfig-file <env:path>` | Path to a kubeconfig file for a specific environment. Format: `<env>:<path>`. Use `~` for home directory. |

**Examples:**

```bash
# Register the config file
cork-kube project set -c /path/to/my-project/.cork-kube-config

# Assign a GCP account (cork-kube activate will verify you're logged in as this user)
cork-kube project set -p my-project -e you@ucdavis.edu

# Register a config file and set the account in one step
cork-kube project set -c /path/to/.cork-kube-config -e you@ucdavis.edu

# Set a custom kubeconfig for the microk8s environment
cork-kube project set -p my-project -k microk8s:~/.kube/microk8s-config
```

### Account verification

When a GCP email is associated with a project, `cork-kube activate` will verify that `gcloud` is authenticated as that account before proceeding. If you're logged in as a different account, the command exits with an error. This prevents accidentally deploying to the wrong project.

### Custom kubeconfig

For environments that use a kubeconfig file outside the default `~/.kube/config` (such as microk8s), use `-k` to register the path. cork-kube will set `KUBECONFIG` automatically when activating that environment.

---

## project list

List all projects registered with cork-kube on this machine.

```bash
cork-kube project list [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-o, --output <format>` | Output format: `json` or `yaml` (default: `yaml`) |

**Example:**

```bash
cork-kube project list
```
