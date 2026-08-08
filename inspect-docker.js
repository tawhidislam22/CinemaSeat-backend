const https = require('https');
const fs = require('fs');

function get(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, options));
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({status: res.statusCode, data}));
    }).on('error', reject);
  });
}

async function run() {
  try {
    const tokenRes = await get('https://auth.docker.io/token?service=registry.docker.io&scope=repository:asifmahmoud414/mock-gateway:pull');
    const token = JSON.parse(tokenRes.data).token;
    
    const manifestRes = await get('https://registry.hub.docker.com/v2/asifmahmoud414/mock-gateway/manifests/latest', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.docker.distribution.manifest.v2+json' }
    });
    
    const manifest = JSON.parse(manifestRes.data);
    console.log('Layers:', manifest.layers.length);
    
    // The last layer usually contains the app code
    const layerDigest = manifest.layers[manifest.layers.length - 1].digest;
    console.log('Fetching layer:', layerDigest);
    
    const { execSync } = require('child_process');
    execSync(`curl -sL -H "Authorization: Bearer ${token}" https://registry.hub.docker.com/v2/asifmahmoud414/mock-gateway/blobs/${layerDigest} -o layer.tar.gz`);
    const output = execSync('tar -tvf layer.tar.gz').toString();
    console.log(output);
    execSync('tar -xvf layer.tar.gz');
    if (fs.existsSync('app/index.js')) {
      console.log('--- app/index.js ---');
      console.log(fs.readFileSync('app/index.js', 'utf8'));
    } else if (fs.existsSync('index.js')) {
      console.log('--- index.js ---');
      console.log(fs.readFileSync('index.js', 'utf8'));
    } else if (fs.existsSync('server.js')) {
      console.log('--- server.js ---');
      console.log(fs.readFileSync('server.js', 'utf8'));
    }
  } catch(e) { console.error(e) }
}
run();
