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

## How a Google Cloud Build works

The default `cloudbuild.yaml` (stored in the cork-build-registry under `gcloud/`) is intentionally minimal — it runs a single build step using the `cork-build-n-deploy` container, which has `cork-kube` pre-installed:

```yaml
steps:
  - name: us-west1-docker.pkg.dev/digital-ucdavis-edu/pub/cork-build-n-deploy:main
    entrypoint: "bash"
    args: ["-c", "cork-kube build exec --production -p ${_PROJECT} -v ${_VERSION} --depth ${_DEPTH}"]
```

`gcloud builds submit --no-source` is used — no local source is uploaded to GCB. The build container handles everything: cloning source, building images, and pushing to the registry.

Inside that step, `cork-kube build exec --production` runs through the following sequence for each image defined in the project's `.cork-build` file:

1. **Shallow clone** — the source repository is cloned at the specified version with `git clone --depth 1 --branch <version>`. This keeps clone time fast regardless of repo history length.

2. **Cache pull** — before building, Docker pulls the previous image from the registry using `--cache-from=type=registry,ref=<image>:<tag>`. If layers have not changed, Docker reuses them rather than rebuilding from scratch.

3. **Provenance injection** — a JSON file containing git metadata is generated and appended to the Dockerfile via a `COPY` instruction (see [Build provenance](#build-provenance) below). This happens automatically on every build.

4. **Clean build** — `docker buildx build` runs with `--pull` to ensure the base image is always fetched fresh, and `--cache-to=type=inline,mode=max` to write the updated cache back into the image layers for the next build.

5. **Push** — the built image is pushed to the Google Artifact Registry path defined in the project's `.cork-build` file. Docker labels recording the git tag and commit SHA are attached to the image.

The `--high-cpu` flag switches to the `cloudbuild-highcpu.yaml` variant, which is identical except it sets `machineType: N1_HIGHCPU_8` for builds with heavy compile steps.

---

## Build provenance

Every image built by cork-kube automatically includes a `/cork-build-info/` directory containing a JSON file for each image in the build. This gives you a record of exactly what source code produced the running container — useful for auditing, debugging production issues, and confirming what version is deployed.

### What is written

During the build, cork-kube appends the following to the end of the image's Dockerfile before running `docker build`:

```dockerfile
# Copy git info
USER root
RUN mkdir -p /cork-build-info
COPY <image-name>.cork-build.json /cork-build-info/<image-name>.json
# USER <user>  ← restored if 'user' is set in the image's .cork-build config
```

The step runs as `root` so it can always write to `/cork-build-info` regardless of what user the rest of the Dockerfile runs as. If your image drops privileges to a non-root user and you need to restore that after the provenance step, set the `user` property on the image in your `.cork-build` file — cork-kube will append a `USER <user>` instruction to hand control back:

```json
{
  "images": {
    "my-api": {
      "contextPath": ".",
      "user": "node"
    }
  }
}
```

This produces:

```dockerfile
USER root
RUN mkdir -p /cork-build-info
COPY my-api.cork-build.json /cork-build-info/my-api.json
USER node
```

The file written to `/cork-build-info/<image-name>.json` contains:

```json
{
  "remote": "git@github.com:ucd-library/my-project.git",
  "httpRemote": "https://github.com/ucd-library/my-project",
  "commit": "a1b2c3d",
  "tag": "v2.0",
  "branch": "main",
  "name": "my-project",
  "date": "2025-04-01T18:00:00.000Z",
  "imageTag": "us-west1-docker.pkg.dev/my-org/pub/my-image:v2.0"
}
```

| Field | Description |
|---|---|
| `remote` | Git remote URL (SSH or HTTPS) |
| `httpRemote` | Git remote URL normalised to HTTPS |
| `commit` | Short commit SHA that was built |
| `tag` | Git tag at the commit, if any |
| `branch` | Branch name at build time |
| `name` | Repository name |
| `date` | Commit timestamp as an ISO 8601 string |
| `imageTag` | Full Docker image tag that was pushed to the registry |

### Docker image labels

In addition to the in-image file, two Docker labels are attached to every built image:

| Label | Example |
|---|---|
| `<PROJECT>_TAG` | `MY_PROJECT_TAG=v2.0` |
| `<PROJECT>_SHA` | `MY_PROJECT_SHA=a1b2c3d` |

The project name is uppercased and non-alphanumeric characters are replaced with underscores.

### Reading provenance at runtime

From inside a running pod you can inspect the provenance of any image in the container:

```bash
# From a shell in the running pod (cork-kube pod exec local-dev my-service)
cat /cork-build-info/my-image.json
```

Or directly with kubectl after activating an environment:

```bash
kubectl exec deploy/my-service -- cat /cork-build-info/my-image.json
```

### Opting out

Individual images can set `noBuildInfo: true` in their `.cork-build` configuration to skip provenance injection. This is occasionally needed for base images or scratch-based images where the copy step would fail.

---

## Commands

- [How a GCB build works](#how-a-google-cloud-build-works)
- [Build provenance](#build-provenance)
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
