import { Command, Option } from 'commander';
import deploy from '../lib/deploy.js';
import config from '../lib/config.js';
import init from '../lib/init-env.js';

const program = new Command();


program
  .description('Rolling restart all services, a group of services or a single service in an environment. This will only restart StatefulSets and Deployments.')
  .argument('<env>', 'environment to restart')
  .option('-c, --config <config>', 'path to config file')
  .option('-p, --project <project>', 'project name')
  .option('-g, --group <group>', 'group of services to stop')
  .option('-s, --service', 'service to stop')
  .action(async (env, opts) => {
    await init(env, opts);

    console.log('');

    let groupServices = [];
    for( let service of config.data.local.services ) {
      groupServices.push(await deploy.renderTemplate(service.name, env, {quiet: true}));
    }

    if( opts.service ) {
      groupServices = groupServices.filter(s => s.name == opts.service);
      if( !service.length ) {
        console.error(`Service ${opts.service} not found`);
        process.exit(1);
      }
    } else if( opts.group ) {
      groupServices = groupServices
        .filter(s => s.group.includes(opts.group));

      if( !groupServices.length ) {
        console.error(`Group ${opts.group} not found`);
        process.exit(1);
      }
    }

    for( let service of groupServices ) {
      if( service.ignore ) { 
        console.warn(`Service ${service.name} is marked as ignore, skipping\n`);
        return;
      }

      try {
        console.log(`Rolling restart of ${service.name}`);
        await deploy.restart(service.name, env);
        console.log();
      } catch(e) {
        console.warn(e.message);
      }
    }
    return;

  });

program.parse(process.argv);