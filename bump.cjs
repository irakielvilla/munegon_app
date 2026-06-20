const fs = require('fs');

// package.json
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '1.1.4';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

// tauri.conf.json
let tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauri.version = '1.1.4';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2));

// LoginScreen.astro
let astro = fs.readFileSync('src/components/LoginScreen.astro', 'utf8');
astro = astro.replace('v1.1.3 &nbsp;', 'v1.1.4 &nbsp;');
fs.writeFileSync('src/components/LoginScreen.astro', astro);

console.log("Bumped to 1.1.4");
