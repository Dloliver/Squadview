import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const homePath = path.join(root, 'src/pages/HomePage.jsx');
const cssPath = path.join(root, 'src/styles.css');

console.log('');
console.log('======================================================');
console.log(' SQUADVIEW HOMEPAGE REFRESH VERIFICATION');
console.log('======================================================');
console.log('');
console.log(`Project: ${root}`);
console.log('');

if (!fs.existsSync(homePath) || !fs.existsSync(cssPath)) {
  console.log('CHECK: expected homepage files were not found.');
  console.log('Terminal remains available.');
} else {
  const home = fs.readFileSync(homePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  const checks = [
    ['Free stream limit is current', home.includes('8 free') && home.includes('eight Twitch streams')],
    ['Premium stream limit is current', home.includes('16 Premium') && home.includes('sixteen')],
    ['Twitch connected tools are represented', home.includes('Twitch connected') && home.includes('Following Live')],
    ['Native Twitch chat is represented', home.includes('Native Twitch chat')],
    ['Saved Squads are represented', home.includes('Saved Squads')],
    ['Share Squad behavior is represented', home.includes('Share Squad creates a link')],
    ['YouTube Companion is represented', home.includes('YouTube Companion')],
    ['PWA install entry remains present', home.includes('InstallSquadView')],
    ['Compact trust actions are styled', css.includes('.marketing-trust-action')],
    ['Referral rewards are not marketed on the homepage', !home.includes('Invite 5') && !home.includes('Lifetime Premium')],
  ];

  let failures = 0;
  for (const [label, passed] of checks) {
    console.log(`${passed ? 'PASS' : 'CHECK'}  ${label}`);
    if (!passed) failures += 1;
  }

  console.log('');
  if (failures === 0) {
    console.log('Homepage refresh markers look correct.');
  } else {
    console.log(`${failures} verification item(s) need review.`);
  }
  console.log('Terminal remains available.');
}

console.log('');
console.log('======================================================');
console.log('');
