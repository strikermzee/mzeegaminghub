// Builds the Tambola React app into public/games/tambola.
// Installs its dev dependencies on first run. Pass --if-needed to skip when a build exists.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'tambola');
const OUT = path.join(ROOT, 'public', 'games', 'tambola', 'index.html');
const ifNeeded = process.argv.includes('--if-needed');

if (ifNeeded && fs.existsSync(OUT)) {
  console.log('Tambola build already present — skipping.');
  process.exit(0);
}

const run = (cmd) => {
  console.log('› ' + cmd);
  execSync(cmd, { cwd: GAME, stdio: 'inherit' });
};

try {
  if (!fs.existsSync(path.join(GAME, 'node_modules'))) {
    console.log('Installing Tambola build dependencies (react, vite)…');
    run('npm install --no-audit --no-fund');
  }
  // Regenerate the mount module so server-side game logic and the build stay in step.
  execSync('node ' + JSON.stringify(path.join(__dirname, 'build-tambola-mount.js')), { cwd: ROOT, stdio: 'inherit' });
  run('npm run build');

  if (!fs.existsSync(OUT)) throw new Error('build finished but ' + OUT + ' is missing');
  console.log('\n✅ Tambola built into public/games/tambola');
} catch (e) {
  console.error('\n❌ Tambola build failed:', e.message);
  console.error('   The hub will still start; Tambola will show a "not built yet" page.');
  console.error('   Fix with:  npm run build:tambola');
  process.exit(1);
}
