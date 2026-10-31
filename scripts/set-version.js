// Usage: node scripts/set-version.js 1.2.3
// Writes the release version into app.json: version, iOS buildNumber and Android versionCode.
const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').replace(/^v/, '');
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!m) {
  console.error(`Phiên bản không hợp lệ: "${process.argv[2]}" (cần dạng 1.2.3 hoặc v1.2.3)`);
  process.exit(1);
}
const [major, minor, patch] = m.slice(1).map(Number);
// 1.2.3 -> 10203: increases with every release, as Android requires.
const versionCode = major * 10000 + minor * 100 + patch;

const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
app.expo.version = version;
app.expo.ios = { ...app.expo.ios, buildNumber: String(versionCode) };
app.expo.android = { ...app.expo.android, versionCode };
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`version ${version}, versionCode/buildNumber ${versionCode}`);
