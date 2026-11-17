// Packs the game into one HTML file (space-wick.html) that runs without a server.
// That file is solo mode: the engine runs in the browser with AI pilots, and progress is saved on the device.
const fs = require('fs');
const path = require('path');
const pub = f => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
let html = pub('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${pub('style.css')}</style>`);
html = html.replace(/<script src="([\w.]+)"><\/script>/g, (_, file) =>
  `${file === 'engine.js' ? '<script>window.SOLO = true;</script>\n  ' : ''}<script>\n${pub(file)}</script>`);
fs.writeFileSync(path.join(__dirname, 'space-wick.html'), html);
console.log('Wrote space-wick.html');
