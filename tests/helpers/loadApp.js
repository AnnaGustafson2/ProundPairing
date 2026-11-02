const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '../../web');
const html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');

function loadApp() {
  document.documentElement.innerHTML = html;
  jest.isolateModules(() => require(path.join(WEB_DIR, 'js/app.js')));
}

module.exports = { loadApp };