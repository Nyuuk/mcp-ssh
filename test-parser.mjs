import { homedir } from 'os';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sshConfig = require('ssh-config');

// Copy the exact implementation from server-simple.mjs
class SSHConfigParser {
  constructor() {
    const homeDir = homedir();
    this.configPath = join(homeDir, '.ssh', 'config');
    this.knownHostsPath = join(homeDir, '.ssh', 'known_hosts');
  }

  async parseConfig() {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      const config = sshConfig.parse(content);
      return this.extractHostsFromConfig(config);
    } catch (error) {
      process.stderr.write(`Error reading SSH config: ${error.message}\n`);
      return [];
    }
  }

  extractHostsFromConfig(config) {
    const hosts = [];

    for (const section of config) {
      if (section.param === 'Host' && section.value !== '*') {
        const hostInfo = {
          hostname: '',
          alias: section.value,
        };

        // Search all entries for this host
        for (const param of section.config) {
          console.log(`Processing host ${section.value}, param: ${param.param} = ${param.value}`);
          switch (param.param.toLowerCase()) {
            case 'hostname':
              hostInfo.hostname = param.value;
              console.log(`  Set hostname to: ${param.value}`);
              break;
            case 'user':
              hostInfo.user = param.value;
              break;
            case 'port':
              hostInfo.port = parseInt(param.value, 10);
              break;
            case 'identityfile':
              hostInfo.identityFile = param.value;
              break;
            default:
              // Store other parameters
              hostInfo[param.param.toLowerCase()] = param.value;
          }
        }

        console.log(`Final hostInfo for ${section.value}:`, hostInfo);
        console.log(`Has hostname? ${!!hostInfo.hostname}`);

        // Only add hosts with complete information
        if (hostInfo.hostname) {
          hosts.push(hostInfo);
          console.log(`Added host: ${section.value}`);
        } else {
          console.log(`Skipped host: ${section.value} (no hostname)`);
        }
      }
    }

    return hosts;
  }

  async getAllKnownHosts() {
    // First: Get all hosts from ~/.ssh/config (these are prioritized)
    const configHosts = await this.parseConfig();
    
    console.log('Config hosts found:', configHosts.length);
    configHosts.forEach(host => {
      console.log(`- ${host.alias}: ${host.hostname}`);
    });
    
    return configHosts;
  }
}

// Test the parser
async function testParser() {
  try {
    const parser = new SSHConfigParser();
    const hosts = await parser.getAllKnownHosts();
    
    console.log('\n=== Final Results ===');
    console.log('Total hosts:', hosts.length);
    
    const prodHost = hosts.find(h => h.alias === 'prod');
    if (prodHost) {
      console.log('prod host found:', JSON.stringify(prodHost, null, 2));
    } else {
      console.log('prod host NOT found in final results');
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testParser();
