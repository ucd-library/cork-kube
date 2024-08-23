# cork-kube
kubectl wrapper for working with kubectl kustomization configurations

## Installation
```bash
npm install -g @ucd-lib/cork-kube
```

## Usage

```bash
cork-kube --help
```

Commands:

- `apply`: Apply a kustomization configuration
- `init-overlay`: Init a kustomization overlay from a base directory

## Source Mount File

A source mount file should have the following format:

```json
[{
  "name": "Of the mount",
  "containerPath": "/path/in/container",
  "sourcePath": "relative/path/to/source"
}]
```

Properties:
- `name`: The name of the mount. This is used to identify the mount in the source mount file.
- `containerPath`: The path in the container where the source should be mounted.
- `sourcePath`: The path to the source that should be mounted in the container. This path is relative to the location of the source mount file.


Example file located at `/home/jrmerz/dev/my-app-deployment/source-mounts.json`:
```json
[
  {
    "name": "my-source",
    "containerPath": "/app/src",
    "sourcePath": "../../my-app/src"
  }
]
```

Will add the following to the deployment or statefulset:
```yaml
spec:
  template:
    spec:
      containers:
      - name: my-app
        volumeMounts:
        - name: my-source
          mountPath: /app/src
      volumes:
      - name: my-source
        hostPath:
          path: /home/jrmerz/dev/my-app/src
```
