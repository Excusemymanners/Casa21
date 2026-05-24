const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'electron-main.js');
const destFile = path.join(__dirname, 'build', 'electron.js');

try {
  fs.copyFileSync(srcFile, destFile);
  console.log('✓ Copied electron-main.js to build/electron.js');
} catch (err) {
  console.error('Error copying electron-main.js:', err.message);
  process.exit(1);
}
