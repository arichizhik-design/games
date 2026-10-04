// Packs the game into one HTML file (ice-cream-tycoon.html) that runs without a server.
// It's single-player: the game engine runs in the browser and progress is saved on that device.
const fs = require('fs');
const path = require('path');

const pub = f => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
let html = pub('index.html');

html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${pub('style.css')}</style>`);
html = html.replace(/<script src="([\w.]+)"><\/script>/g, (_, file) => {
  const pre = file === 'client.js' ? '<script>window.SOLO = true;</script>\n  ' : '';
  return `${pre}<script>\n${pub(file)}</script>`;
});

// pictures go inside the file too, so it works on its own
html = html.replace(/src="([\w-]+\.png)"/g, (_, file) =>
  `src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'public', file)).toString('base64')}"`);

fs.writeFileSync(path.join(__dirname, 'ice-cream-tycoon.html'), html);
console.log('Wrote ice-cream-tycoon.html');
