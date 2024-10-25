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
  .option('-p, --project <project>', 'project name')
  .option('-v, --volumes', 'remove all volumes')
  .option('-g, --group', 'group of services to stop')
  .option('-s, --service', 'service to stop')
  .action(async (env, opts) => {
    await init(env, opts);

    console.log('');

    let groupServices = [];
    if( opts.service || opts.group ) {
      for( let service of config.data.local.services ) {
        groupServices.push(await deploy.renderTemplate(service.name, env, {quiet: true}));
      }
    }

    if( opts.service ) {
      let service = groupServices.find(s => s.name == opts.service);
      if( !service ) {
        console.error(`Service ${opts.service} not found`);
        process.exit(1);
      }
      if( service.ignore ) { 
        console.warn(`Service ${service.name} is marked as ignore, skipping\n`);
        return;
      }
      try {
        console.log(`Removing ${service.name}`);
        await deploy.remove(service.name, env);
      } catch(e) {
        console.warn(e.message);
      }
      return;
    }


    if( opts.group ) {
      groupServices = groupServices
        .filter(s => s.group.includes(opts.group));

      for( let service of groupServices ) {
        if( service.ignore ) { 
          console.warn(`Service ${service.name} is marked as ignore, skipping\n`);
          continue;
        }
        try {
          console.log(`Removing ${service.name}`);
          await deploy.remove(service.name, env);
          console.log();
        } catch(e) {
          console.warn(e.message);
        }
      }
      return;
    }

    if( opts.volumes ) {
      let context = await kubectl.getCurrentContext();
      if( context != 'docker-desktop' ) {
        console.error(`You can only remove volumes with docker-desktop context. It's too dangerous to remove volumes in other contexts!`);
        process.exit(1);
      }
    }
    
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

    if( opts.volumes ) {
      console.log(`\nRemoving all persistent volumes claims`);
      output = await kubectl.stop('persistentvolumeclaim', namespace);
      console.log(output.trim());

      console.log(`\nRemoving all persistent volumes`);
      let volumes = await kubectl.exec('kubectl get pv -o json --namespace '+namespace);
      if( volumes ) volumes = JSON.parse(volumes);
      for( let volume of volumes.items ) {
        if( volume.spec?.claimRef?.namespace != namespace ) {
          continue;
        }
        if( volume.status.phase == 'Bound' ) {
          console.log(volume);
          console.warn(`skipping bound volume ${volume.metadata.name}`);
          continue;
        }
        output = await kubectl.exec(`kubectl delete pv ${volume.metadata.name}`);
        console.log(output.trim());
      }
    }
  });

program.parse(process.argv);