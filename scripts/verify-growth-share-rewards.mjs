import fs from 'node:fs';
import path from 'node:path';

const project = process.cwd();

const checks = [
  ['src/App.jsx', [
    'share-squad-button',
    'Share Squad',
    'share_opened',
    'share_link_copied',
    'share_native_completed',
    'shared_view_arrived',
    'shared_view_started',
    'claimSquadViewReferral',
    'Lifetime Premium',
    // 2026-09-07 source-of-truth markers that must survive this rebase.
    'isIOSLikeDevice',
    'iosSingleAudioMode',
    'setStreamVolume',
    'focusedAudioVolumeRef',
  ]],
  ['src/components/TwitchPlayer.jsx', [
    'preserveAudibleSession',
    'focusVolume',
    'audioVolume',
    'onVolumeChange',
    'stream-volume-popover',
  ]],
  ['src/services/referralService.js', [
    'squadview:pending-referral:v1',
    'get_squadview_referral_summary',
    'claim_squadview_referral',
  ]],
  ['src/services/premiumService.js', [
    'promo_premium_until',
    'lifetime_premium',
  ]],
  ['src/config/plans.js', [
    'promoPremiumUntil',
    'lifetimePremium',
    'promotionalPremium',
  ]],
  ['src/services/accountService.js', [
    'const redirectUrl = new URL(window.location.href);',
  ]],
  ['src/styles.css', [
    'SquadView Growth Phase 1',
    '.share-squad-button',
    '.share-rewards-card',
    '.account-rewards-summary',
    '.shared-arrival-referral',
    '.stream-volume-popover',
    'SQUADVIEW_STANDALONE_HOME_SAFE_AREA_START',
  ]],
  ['src/pages/PrivacyPage.jsx', [
    'Sharing and referral rewards',
  ]],
  ['src/pages/TermsPage.jsx', [
    'SquadView Rewards',
    '100 qualified referrals',
    'Lifetime Premium',
  ]],
  ['supabase/migrations/20260907_squadview_share_rewards.sql', [
    'squadview_referral_accounts',
    'squadview_referrals',
    'promo_premium_until',
    'lifetime_premium',
    'get_squadview_referral_summary',
    'claim_squadview_referral',
    "interval '30 days'",
    'new_count >= 100',
  ]],
];

let failed = false;

console.log('======================================================');
console.log(' SQUADVIEW SHARE + REWARDS REBASE VERIFICATION');
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

console.log('All Share + Rewards markers are installed.');
console.log('The September 7 mobile audio, volume, and standalone PWA markers are also preserved.');
console.log('Database migration presence is verified on disk only.');
console.log('Run the migration in the SquadView Supabase project before referral testing.');
console.log('======================================================');
