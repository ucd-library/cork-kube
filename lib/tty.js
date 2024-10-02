import kubectl from './kubectl.js';
import { spawn } from 'child_process';


class TTY {
  /**POD=$(kubectl get pods --selector=app=$2 --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
  if [[ -z $POD ]]; then
    echo "No running pods found for app $2"
    exit -1
  fi
  POD_CMD=bash
  if [[ ! -z $3 ]]; then
    POD_CMD=$3
  fi
  echo "executing: kubectl exec -ti $POD -- $POD_CMD"
  kubectl exec -ti $POD -- $POD_CMD */

  exec(cmd, args=[]) {
    return new Promise((resolve, reject) => {
      // Spawn the child process with TTY support
      const child = spawn(cmd, args, {
        stdio: 'inherit',  // Inherit stdin, stdout, and stderr from the parent process
        shell: true        // Optional: Allows running shell commands like 'ls', 'bash', etc.
      });

      // Handle exit event
      child.on('exit', (code) => {
        resolve(code);
      });
    });
  }


}

const inst = new TTY();
export default inst;