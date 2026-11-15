import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldAutoEnterDesktopFocus, shouldAutoExpandSingleStream } from '../src/lib/singleStreamFocusLayout.js';

function check(label, value, expected) {
  assert.equal(value, expected, label);
  console.log(`PASS: ${label}`);
}
check('One selected desktop Twitch stream enters real Focus', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:1}), true);
check('Two selected streams stay in normal Grid', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:2}), false);
check('Four selected streams stay in normal Grid', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:4}), false);
check('A last page with one video from five total does not auto-Focus', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:5}), false);
check('Mobile and portrait phone presentation untouched', shouldAutoEnterDesktopFocus({isDesktopGrid:false,streamCount:1}), false);
check('YouTube companion avoids auto Focus', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:1,youtubeCompanionPresent:true}), false);
check('Zero channels never enter Focus', shouldAutoEnterDesktopFocus({isDesktopGrid:true,streamCount:0}), false);
check('User-selected single Grid layout remains available', shouldAutoExpandSingleStream({isDesktopGrid:true,viewMode:'chat',desktopGridChat:true,visibleCount:1}), true);

const app=readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(app,/const oneStreamAutoFocusRef = useRef/);
assert.match(app,/shouldAutoEnterDesktopFocus\(\{/);
assert.match(app,/if \(previous\.channel === soleChannel\) return/);
assert.match(app,/setViewMode\('solo'\)/);
assert.match(app,/if \(previous\.automatic && viewMode === 'solo'\)/);
assert.match(app,/setViewMode\(previous\.previousMode\)/);
assert.match(app,/focusReturnAudioRef\.current = \{ activeChannel: soleChannel, audioEnabled \}/);
assert.doesNotMatch(app.slice(app.indexOf('  // A true one-stream desktop lineup opens'),app.indexOf('    if (!channels.length) {',app.indexOf('  // A true one-stream desktop lineup opens'))),/\.play\(\)|setAudioEnabled\(|reconcileViewerAudio\(/);
console.log('PASS: Real Focus is used without play, mute, or player lifecycle changes.');
console.log('PASS: Auto-transition is once per sole-channel roster; user Grid override remains possible.');
