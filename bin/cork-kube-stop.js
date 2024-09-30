import { Command, Option } from 'commander';
import gcloud from '../lib/gcloud.js'; 
import kubectl from '../lib/kubectl.js';
import config from '../lib/config.js';
import yaml from 'js-yaml';
import init from '../lib/init-env.js';

const program = new Command();


program
  .argument('<env>', 'environment to stop')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project-name <project>', 'project name')
  .action(async (env, opts) => {
    await init(env, opts);
    let namespace = await kubectl.getNamespace();

    console.log(`\nStopping all jobs`);
    let output = await kubectl.stop('job', namespace);
    console.log(output.trim());

    console.log(`\nStopping all deployments`);
    output = await kubectl.stop('deployment', namespace);
    console.log(output.trim());

    console.log(`\nStopping all statefulsets`);
    output = await kubectl.stop('statefulset', namespace);
    console.log(' - '+output.trim());

    console.log(`\nStopping all daemonsets`);
    output = await kubectl.stop('daemonset', namespace);
    console.log(output.trim());

    console.log(`\nStopping all services`);
    output = await kubectl.stop('service', namespace);
    console.log(output.trim());
  });

program.parse(process.argv);