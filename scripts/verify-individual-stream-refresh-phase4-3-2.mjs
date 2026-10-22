import fs from 'node:fs';
const app = fs.readFileSync('src/App.jsx','utf8');
const player = fs.readFileSync('src/components/TwitchPlayer.jsx','utf8');
const css = fs.readFileSync('src/styles.css','utf8');
const checks = [
  ['Per-player refresh revision, not roster reset',player.includes('const [refreshRevision, setRefreshRevision] = useState(0);') && player.includes('setRefreshRevision((revision) => revision + 1);')],
  ['Player keys remain channel-stable',app.includes('<TwitchPlayer\n                    key={channel}')],
  ['Refresh does not call setChannel',!player.slice(player.indexOf('function refreshThisStream()'),player.indexOf('function refreshThisStream()')+500).includes('setChannel')],
  ['iOS audible owner protected',player.includes('preserveAudibleSession && visible && audioSelected && audioEnabled') && player.includes('disabled={!visible || refreshing || refreshBlockedByIosAudio}')],
  ['READY clears busy state',player.includes('refreshInFlightRef.current = false;\n            setRefreshing(false);\n            setStatus(\'Ready\');')],
  ['Timeout unlocks stuck refresh',player.includes('}, 15000);') && player.includes('window.clearTimeout(refreshWatchdogRef.current)')],
  ['Player lifecycle revision dependency',player.includes('registerPlayer,\n    refreshRevision,')],
  ['Other viewer state unchanged by refresh handler',!player.slice(player.indexOf('function refreshThisStream()'),player.indexOf('function refreshThisStream()')+400).includes('setChannels')],
  ['Accessible refresh chip',player.includes('aria-label={`Refresh ${channel} stream`}')],
  ['Reduced motion',css.includes('.refresh-stream-chip.is-refreshing span { animation: none; }')],
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(!ok)failed=true;}
if(failed)process.exit(1);
console.log('Phase 4.3.2 focused source checks passed. Browser/iOS manual QA still required.');
