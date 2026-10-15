import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/components/ChatPanel.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

const checks = [
  ['Premium eligibility still starts after five visible viewing minutes', app.includes("REFERRAL_PROMO_WATCH_MS = 5 * 60 * 1000") && app.includes('referralPromoWatchMsRef.current >= REFERRAL_PROMO_WATCH_MS')],
  ['Chat activity defers the Premium rail for thirty seconds', app.includes("REFERRAL_PROMO_CHAT_IDLE_MS = 30 * 1000") && app.includes('lastViewerChatActivityAt') && app.includes('stillNeedsIdleTime')],
  ['Premium appears at most once automatically in one viewer session', app.includes('referralPromoShownThisSessionRef = useRef(false)') && app.includes('!referralPromoShownThisSessionRef.current') && app.includes('referralPromoShownThisSessionRef.current = true')],
  ['A new Start watching session resets Premium timing', app.includes('referralPromoWatchMsRef.current = 0') && app.includes('setReferralPromoRailOpen(false)') && app.includes('function commitViewerStart(unique)')],
  ['Premium is rendered as a layout rail instead of the old floating popover', app.includes('viewer-premium-rail') && !app.includes('referral-promo-tile viewer-rewards-popover')],
  ['Desktop Chat and Premium rail are mutually exclusive', app.includes("const showDesktopChatRail = !referralPromoVisible") && app.includes("const desktopChatUsesGridTile = !referralPromoVisible")],
  ['Mobile Chat and Premium are mutually exclusive', app.includes('!isDesktopGrid && !referralPromoVisible && activeChannel')],
  ['Closing Premium restores the prior viewer mode instead of changing it', app.includes('setReferralPromoRailOpen(false);') && !app.includes("suppressReferralPromo(reason) {\n    setViewMode")],
  ['Opening Chat while Premium is visible gives Chat priority', app.includes("suppressReferralPromo('chat_requested')")],
  ['Native chat typing and sends refresh the inactivity clock', chat.includes("onActivity?.({ type: 'native_input'") && chat.includes("onActivity?.({ type: 'native_send'")],
  ['Focused Twitch iframe protects active embedded chat from replacement', chat.includes('document.activeElement === iframeRef.current') && chat.includes("type: 'twitch_iframe_focus'")],
  ['Native chat drafts survive temporary rail replacement in session storage', chat.includes("NATIVE_CHAT_DRAFT_PREFIX = 'squadview:native-chat-draft:v1:'") && chat.includes('readNativeChatDraft') && chat.includes('writeNativeChatDraft')],
  ['Restored Native chat drafts return focus to the composer', chat.includes('restoredDraftNeedsFocusRef') && chat.includes('input?.setSelectionRange?.(draft.length, draft.length)')],
  ['Native chat drafts are cleared when a genuinely new viewer session begins', app.includes('clearNativeChatDrafts();') && app.includes("NATIVE_CHAT_DRAFT_PREFIX = 'squadview:native-chat-draft:v1:'")],
  ['Wide desktop Premium rail shrinks the stream area without overlaying it', css.includes('.viewer-primary-layout.has-premium-rail') && css.includes('grid-template-areas: "stream premium"') && css.includes('.viewer-primary-layout.has-premium-rail .stream-stage')],
  ['Narrow desktop and mobile Premium layouts have dedicated non-overlay space', css.includes('@media (min-width: 761px) and (max-width: 1099px)') && css.includes('.viewer-primary-layout.has-premium-rail .viewer-premium-rail') && css.includes('@media (max-width: 760px)')],
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else {
    console.error(`FAIL  ${label}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} Phase 3.4 verification check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log('\nSquadView Phase 3.4 Premium Rail + Safe Chat Handoff verification passed.');
