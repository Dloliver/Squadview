import fs from 'node:fs';
const app=fs.readFileSync('src/App.jsx','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const checks=[
  ['draft-only page moves',app.includes('function moveManagerChannelToPage(')&&app.includes('setManagerDraftChannels(reordered);')],
  ['explicit swaps',app.includes('function swapManagerDraftChannels(')&&app.includes('[reordered[fromIndex], reordered[toIndex]]')],
  ['four-slot grouping',app.includes('index % 4 === 0')&&app.includes('Math.floor(index / 4) + 1')],
  ['page selector and swap selector',app.includes('aria-label={`Move ${channel} to page`}')&&app.includes('aria-label={`Swap ${channel} with stream`}')],
  ['retains Done save workflow',app.includes('function finishManageStreams()')&&app.includes('commitViewerChannels(nextChannels, {')],
  ['retains stable player key',app.includes('key={channel}')],
  ['manager page responsive CSS',css.includes('.manager-page-tools {')&&css.includes('.manager-page-item {')],
];
let failed=false;
for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass) failed=true;}
if(failed)process.exit(1);
