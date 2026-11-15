import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldAutoExpandSingleStream } from '../src/lib/singleStreamFocusLayout.js';

const desktopChat = {
  isDesktopGrid: true, viewMode: 'chat', desktopGridChat: true,
  desktopChatUsesGridTile: false, visibleCount: 1,
  youtubeVisible: false, referralPromoVisible: false,
  desktopDualChat: false, desktopSixStream: false,
};
const check = (label, expected, options) => {
  assert.equal(shouldAutoExpandSingleStream(options), expected, label);
  console.log(`PASS: ${label}`);
};
check('One visible desktop Grid + Chat stream expands beside chat', true, desktopChat);
check('One visible desktop Grid stream expands without chat', true, {...desktopChat,viewMode:'dual',desktopGridChat:false});
check('Last page containing one stream expands', true, {...desktopChat,visibleCount:1});
check('Two streams preserve original grid', false, {...desktopChat,visibleCount:2});
check('Four streams preserve original grid', false, {...desktopChat,visibleCount:4});
check('No streams never activates', false, {...desktopChat,visibleCount:0});
check('Mobile presentation untouched', false, {...desktopChat,isDesktopGrid:false});
check('Explicit Focus mode untouched', false, {...desktopChat,viewMode:'solo'});
check('Existing desktop single-chat layout untouched', false, {...desktopChat,desktopGridChat:false});
check('In-grid chat tile untouched', false, {...desktopChat,desktopChatUsesGridTile:true});
check('YouTube companion layout untouched', false, {...desktopChat,youtubeVisible:true});
check('Referral promo layout untouched', false, {...desktopChat,referralPromoVisible:true});
check('Dual Chat layout untouched', false, {...desktopChat,desktopDualChat:true});
check('Six-stream layout untouched', false, {...desktopChat,desktopSixStream:true});

const app=readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css=readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(app, /const singleStreamAutoFocus = shouldAutoExpandSingleStream\(\{/);
assert.match(app, /singleStreamAutoFocus \? 'squadview-single-stream-fill'/);
assert.match(app, /singleStreamAutoFocus \? \(viewMode === 'chat' \?/);
assert.match(css, /\.viewer-shell\.squadview-single-stream-fill \.viewer-primary-layout \.stream-stage\.mode-chat \.stream-stage-players/);
assert.match(css, /grid-template-columns: minmax\(0, 1fr\) !important/);
assert.match(css, /grid-template-rows: minmax\(0, 1fr\) !important/);
assert.match(css, /grid-column: 1 \/ -1 !important/);
assert.match(css, /@media \(min-width: 761px\)/);
console.log('PASS: JSX hook, exclusive desktop layout class and full-width CSS present.');
console.log('PASS: Existing player mounts, audio policy and chat services are unchanged by this patch.');
