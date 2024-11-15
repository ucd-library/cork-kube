import {exec, spawn} from 'child_process';

export default function (command, args, options={}) {
  if( !args ) args = {};
  if( !args.shell ) {
    args.shell = '/bin/bash';
  }
  args.maxBuffer = 1024*1024*20; // 20MB

  return new Promise((resolve, reject) => {
    let proc = exec(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({stdout, stderr});
    });

    if( options.output === 'realtime' ) {
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);
    }

    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }
  });
}