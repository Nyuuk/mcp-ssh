import { homedir } from 'os';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sshConfig = require('ssh-config');

async function testProdHost() {
  try {
    const configPath = join(homedir(), '.ssh', 'config');
    const content = await readFile(configPath, 'utf-8');
    const config = sshConfig.parse(content);
    
    console.log('Parsed config sections:', config.length);
    
    // Find prod host
    for (const section of config) {
      if (section.param === 'Host' && section.value === 'prod') {
        console.log('Found prod section');
        
        const hostInfo = {
          hostname: '',
          alias: section.value,
        };

        for (const param of section.config) {
          console.log(`Param: ${param.param} = ${param.value}`);
          
          if (param.param.toLowerCase() === 'hostname') {
            hostInfo.hostname = param.value;
            console.log('Set hostname to:', param.value);
          } else if (param.param.toLowerCase() === 'user') {
            hostInfo.user = param.value;
          } else if (param.param.toLowerCase() === 'port') {
            hostInfo.port = parseInt(param.value, 10);
          }
        }
        
        console.log('Final hostInfo:', hostInfo);
        console.log('Has hostname?', !!hostInfo.hostname);
        
        if (hostInfo.hostname) {
          console.log('SUCCESS: prod host would be included');
        } else {
          console.log('FAIL: prod host would be excluded');
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testProdHost();
