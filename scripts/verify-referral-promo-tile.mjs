import fs from 'node:fs';
import path from 'node:path';

const project = process.cwd();

const checks = [
  ['src/App.jsx', [
    'REFERRAL_PROMO_WATCH_MS',
    '5 * 60 * 1000',
    'REFERRAL_PROMO_COOLDOWN_MS',
    '24 * 60 * 60 * 1000',
    'referral_promo_ready',
    'referral_promo_cta_clicked',
    'referral_promo_dismissed',
    'Get Premium free',
    'Lifetime Premium is close',
    'Earn another free month',
    'Share My Squad',
    'Sign in to earn Premium',
    'referralPromoTargetChannel',
    "viewMode !== 'dual'",
    'showEdit',
    'showShareSquad',
    'showAccount',
    'showSaveSquad',
    'showYoutubeCompanion',
    'showSharedArrival',
    "visible={visibleChannels.includes(channel) && channel !== referralPromoTargetChannel}",
    'No SquadView ads',
    'Up to 16 Twitch streams',
    'Unlimited Saved Squads',
    'YouTube Companion',
    // Existing growth + September 7 regression markers.
    'share-squad-button',
    'claimSquadViewReferral',
    'isIOSLikeDevice',
    'iosSingleAudioMode',
    'setStreamVolume',
    'focusedAudioVolumeRef',
  ]],
  ['src/styles.css', [
    'SquadView Growth Phase 2 — five-minute referral promo tile.',
    '.referral-promo-tile',
    '.referral-promo-progress',
    '.referral-promo-benefits',
    '.referral-promo-actions',
    'SQUADVIEW_STANDALONE_HOME_SAFE_AREA_START',
    '.share-squad-button',
  ]],
  ['src/components/TwitchPlayer.jsx', [
    'preserveAudibleSession',
    'focusVolume',
    'audioVolume',
    'onVolumeChange',
    'stream-volume-popover',
  ]],
];

let failed = false;

console.log('======================================================');
console.log(' SQUADVIEW REFERRAL PROMO TILE VERIFICATION');
console.log('======================================================');
console.log('');

for (const [relativePath, markers] of checks) {
  const fullPath = path.join(project, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`MISSING FILE: ${relativePath}`);
    failed = true;
    continue;
  }

  const contents = fs.readFileSync(fullPath, 'utf8');
  const missing = markers.filter((marker) => !contents.includes(marker));
  if (missing.length) {
    console.error(`FAILED: ${relativePath}`);
    for (const marker of missing) console.error(`  missing marker: ${marker}`);
    failed = true;
  } else {
    console.log(`PASS: ${relativePath}`);
  }
}

console.log('');
if (failed) {
  console.error('Verification failed. Do not deploy this version yet.');
  process.exit(1);
}

console.log('Referral promo tile markers are installed.');
console.log('Share + Rewards, mobile audio/volume, and standalone PWA markers are preserved.');
console.log('No new Supabase migration is required for this phase.');
console.log('TwitchPlayer is verified but intentionally not replaced by this bundle.');
console.log('======================================================');
