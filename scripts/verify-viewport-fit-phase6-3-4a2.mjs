import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateTwitchViewportFit } from '../src/lib/twitchViewportFit.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} !== ${expected}`);
for (const [width, height] of [[493, 199], [400, 150], [800, 450], [1200, 300], [120, 72], [650, 450]]) {
  const fit = calculateTwitchViewportFit(width, height);
  assert.ok(fit, `Expected valid fit for ${width}x${height}`);
  assert.ok(fit.embedWidth >= 400 && fit.embedHeight >= 300, 'Twitch minimum size preserved');
  near(fit.embedWidth / fit.embedHeight, 16 / 9);
  near(fit.embedWidth * fit.scale, fit.fittedWidth);
  near(fit.embedHeight * fit.scale, fit.fittedHeight);
  assert.ok(fit.fittedWidth <= width + 0.01 && fit.fittedHeight <= height + 0.01, 'Fit does not overflow tile');
  console.log(`PASS: ${width}x${height} -> full ${fit.fittedWidth.toFixed(1)}x${fit.fittedHeight.toFixed(1)} visible frame (scale ${fit.scale.toFixed(3)})`);
}
assert.equal(calculateTwitchViewportFit(0, 100), null);
assert.equal(calculateTwitchViewportFit(100, NaN), null);
console.log('PASS: Invalid tile dimensions skipped safely');

const player = fs.readFileSync('src/components/TwitchPlayer.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
assert.ok(player.includes('calculateTwitchViewportFit'), 'Pure fit helper wired');
assert.ok(player.includes("viewport.classList.add('squadview-fit-embed')"), 'Viewer fit class applied');
assert.ok(player.includes("viewport.classList.remove('squadview-fit-embed')"), 'Viewer fit class removed outside desktop grid');
assert.ok(player.includes('new ResizeObserver(syncViewportFit)'), 'Responds to tile size changes');
assert.ok(styles.includes('Phase 6.3.4A.2 — full-frame Twitch desktop grid fit'), 'Scoped styles installed');
assert.ok(styles.includes('@media (min-width: 761px) and (max-height: 800px)'), 'Short desktop only CSS present');
assert.ok(player.includes("(min-width: 761px) and (max-height: 800px)"), 'Short desktop only JS trigger present');
assert.ok(player.includes('new MutationObserver(syncViewportFit)'), 'Mode changes update viewport fit');
console.log('PASS: Desktop-only responsive player sizing is wired');
