// Builds Ludo Champion (Create React App) straight into public/games/ludo-champion,
// so its output sits beside every other game's browser files.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'games', 'ludo-champion');
const OUT = path.join(ROOT, 'public', 'games', 'ludo-champion');

if (!fs.existsSync(path.join(SRC, 'node_modules'))) {
  console.log('Installing Ludo Champion dependencies…');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: SRC, stdio: 'inherit', shell: true });
}

console.log('Building Ludo Champion → public/games/ludo-champion');
execFileSync('npx', ['react-scripts', 'build'], {
  cwd: SRC,
  stdio: 'inherit',
  shell: true,
  // CI is deliberately left unset: the game ships with lint warnings, and CI=true
  // turns those into build failures.
  env: { ...process.env, BUILD_PATH: OUT, CI: '' }
});

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('Build finished but no index.html landed in', OUT);
  process.exit(1);
}
console.log('✅ Ludo Champion built.');
