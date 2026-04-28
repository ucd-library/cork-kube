# cork-kube build

The `build` command handles building and publishing Docker images. It is a distinct stage in the deployment pipeline from the commands that manage running services (`start`, `stop`, `apply`) — builds produce the images; deployment commands run them.

## How it works: cork-build-registry

cork-kube build integrates with the [cork-build-registry](https://github.com/ucd-library/cork-build-registry), a central registry that defines:

- Which **projects** can be built and their git repository locations
- The available **versions** for each project (e.g. `v2.0`, `main`, `sandbox`)
- The **images** each version produces and which registry they are pushed to
- **Dependencies** on other projects in the registry (so a build can include all of its dependency chain)

**A version must be registered in the cork-build-registry before it can be built.** To add a new project or version, submit a pull request to the registry repository.

When you run `cork-kube build gcb -p my-project -v v2.0`, cork-kube fetches the build configuration for that project and version from the registry, then submits a build job to Google Cloud Build.

## Commands

- [build gcb](#build-gcb) — Submit a build to Google Cloud Build
- [build exec](#build-exec) — Run a local Docker build
- [build set-env](#build-set-env) — Write built image tags to an env file
- [build list](#build-list) — List projects and versions from the registry
- [build validate](#build-validate) — Validate a project's image configuration
- [build register-local-repo](#build-register-local-repo) — Register a local git repo for development builds
- [build set-config](#build-set-config) — Configure build settings
- [build show-config](#build-show-config) — Show current build configuration
- [build show-local-repos](#build-show-local-repos) — Show registered local repos
- [build reset-cork-registry-location](#build-reset-cork-registry-location) — Reset registry to the remote default

---

## build gcb

Submit a project build to Google Cloud Build. The project and version must be registered in the cork-build-registry.

```bash
cork-kube build gcb -p <project> -v <version> [options]
```

**Required flags:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name as registered in the cork-build-registry |
| `-v, --version <version>` | Version to build as registered in the cork-build-registry |

**Options:**

| Flag | Description |
|---|---|
| `--gcb-project <project>` | Google Cloud project to submit the build to (overrides the configured default) |
| `--cork-build-registry <url>` | Override the remote cork-build-registry URL |
| `--no-cache` | Disable Docker layer caching |
| `--high-cpu` | Use a high-CPU Cloud Build machine type |
| `--depth <n>` | Build depth. Default: `1` (current project only). Use `ALL` to build all dependency projects as well. |
| `-d, --dry-run` | Print the gcloud command without submitting |

**Examples:**

```bash
# Build version v2.0 of my-project on GCB
cork-kube build gcb -p my-project -v v2.0

# See what would be submitted without actually submitting
cork-kube build gcb -p my-project -v v2.0 -d

# Build the project and all of its registered dependencies
cork-kube build gcb -p my-project -v v2.0 --depth ALL
```

---

## build exec

Execute a Docker build locally. By default this is a development build that uses a local dev registry (`localhost/local-dev`) and does not push images. Use `--production` for a build that uses real registry names and pushes images.

```bash
cork-kube build exec -p <project> -v <version> [options]
```

**Required flags:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name |
| `-v, --version <version>` | Version to build |

**Options:**

| Flag | Description |
|---|---|
| `-m, --production` | Production build — uses real registry names and pushes images |
| `--no-push` | Skip pushing images (use with `--production` to build without pushing) |
| `-r, --use-remote <name>` | Use a remote git repo instead of a locally registered directory |
| `-d, --dry-run` | Print docker build commands without running them |
| `-s, --tag-selection <type>` | Tag selection strategy: `auto`, `force-tag` (git tag), `force-branch`. Accepts comma-separated `project=type` to set per project. |
| `-o, --override-tag <tag>` | Override the image tag. Accepts comma-separated `project=tag` to override per project. |
| `-f, --filter <projects>` | Comma-separated list of image names to build (others are skipped) |
| `--depth <n>` | Dependency depth. Default: `1`. Use `ALL` to build all dependencies. |
| `--use-registry <projects>` | Use the real registry for these projects even in a dev build |
| `--local-dev-registry <registry>` | Override the default local dev registry (`localhost/local-dev`) |
| `--no-cache` | Disable Docker layer caching |
| `--no-cache-from` | Skip `--cache-from` (speeds up local builds at the cost of cache reuse) |
| `--set-env <file>` | Write built image tags to an env file |
| `--cork-build-registry <url>` | Override the remote cork-build-registry URL |

**Examples:**

```bash
# Local development build
cork-kube build exec -p my-project -v main

# Build and push to the real registry (production)
cork-kube build exec -p my-project -v v2.0 -m

# Build only specific images
cork-kube build exec -p my-project -v main -f my-api,my-worker

# Dry run — print what docker build commands would be run
cork-kube build exec -p my-project -v main -d
```

---

## build set-env

Update an existing env file with the image tag names that result from a build. Useful in CI/CD to generate env files that deployment configs reference.

```bash
cork-kube build set-env <path> -p <project> -v <version> [options]
```

**Arguments:**

| Argument | Description |
|---|---|
| `<path>` | Path to the env file to update |

Accepts the same options as `build exec` (minus build-execution-only flags).

---

## build list

List all projects and their registered versions from the cork-build-registry. Useful for discovering what versions are available to build.

```bash
cork-kube build list [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Filter to a specific project |
| `-n, --names` | List project names only (no versions) |
| `-i, --images` | List full image names for each version |
| `--cork-build-registry <url>` | Override the remote cork-build-registry URL |

**Examples:**

```bash
# List all projects and their versions
cork-kube build list

# List versions for a specific project
cork-kube build list -p my-project

# List the full image names that would be produced for each version
cork-kube build list -p my-project -i
```

---

## build validate

Validate that a project's Dockerfile configuration is correct as defined in the cork-build-registry.

```bash
cork-kube build validate [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <project>` | Project name |
| `-v, --version <version>` | Version to validate |
| `--cork-build-registry <url>` | Override the remote cork-build-registry URL |

---

## build register-local-repo

Register a local git repository directory so that `build exec` uses it instead of cloning from the remote. This lets you build with local uncommitted changes during development.

```bash
cork-kube build register-local-repo <dir>
```

**Arguments:**

| Argument | Description |
|---|---|
| `<dir>` | Absolute or relative path to the local git repository |

**Example:**

```bash
cork-kube build register-local-repo /home/user/dev/my-project
```

---

## build set-config

Configure global build settings stored in the cork-kube global config file on your machine.

```bash
cork-kube build set-config [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --gcb-project <project>` | Default Google Cloud Build project to use |
| `-r, --cork-registry <url-or-path>` | Cork registry URL or local directory path |
| `-d, --docker-registry <host:registry>` | Map a GitHub project URL to a Google Artifact Registry path for local dev builds |
| `-l, --push-local <true\|false>` | Whether to push local dev builds to the registry |

**Example:**

```bash
# Set the default GCB project
cork-kube build set-config -p my-gcp-build-project

# Point to a local clone of the cork-build-registry for development
cork-kube build set-config -r /path/to/cork-build-registry
```

---

## build show-config

Show the current build configuration stored in the cork-kube global config.

```bash
cork-kube build show-config [options]
```

**Options:**

| Flag | Description |
|---|---|
| `-i, --include-local-repos` | Include registered local repositories in the output |

---

## build show-local-repos

Show all local git repositories registered with `build register-local-repo`.

```bash
cork-kube build show-local-repos
```

---

## build reset-cork-registry-location

Reset the cork-build-registry location back to the remote default. Use this to undo a local path set with `build set-config -r`.

```bash
cork-kube build reset-cork-registry-location
```
