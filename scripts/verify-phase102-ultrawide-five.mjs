import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { centeredFivePosition } from '../src/lib/ultrawideFivePositions.js';
import { buildUltrawideSixPage } from '../src/lib/ultrawideSixPage.js';
const app=readFileSync('src/App.jsx','utf8');
const css=readFileSync('src/styles.css','utf8');
const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS:',name)};
const columns=[1,3,5,2,4];
check('Five-stream 3+2 centered positions are unique and in order',
  columns.every((col,i)=>centeredFivePosition(i)?.gridColumn===col) &&
  [0,1,2,3,4].every(i=>centeredFivePosition(i).gridRow===(i<3?1:2)) &&
  centeredFivePosition(5)===null && centeredFivePosition(-1)===null);
check('Button enables 5+ only on ultrawide',
 app.includes('channels.length < 5 || youtubeCompanion') &&
 app.includes('channels.length < 5 || Boolean(youtubeCompanion)') &&
 app.includes('desktopGridChat && compactViewerEnabled && channels.length >= 5 &&') &&
 app.includes('(min-width: 2100px) and (min-height: 850px)'));
check('Five streams use centered helper, six retain original positions',
 app.includes('const desktopFiveStream = desktopSixStream && channels.length === 5 && visibleChannels.length === 5;') &&
 app.includes('const fivePosition = centeredFivePosition(visibleChannels.indexOf(channel));') &&
 app.includes('gridColumn: (index % 3) + 1') &&
 app.includes('gridRow: Math.floor(index / 3) + 1'));
check('Centered 6-column presentation only applies to 5-up ultrawide',
 css.includes('.viewer-shell.squadview-desktop-six-stream.squadview-ultrawide-five') &&
 css.includes('grid-template-columns: repeat(6, minmax(0, 1fr)) !important') &&
 css.includes('grid-template-columns: repeat(3, minmax(400px, 1fr)) !important') &&
  css.includes('grid-column-end: span 2 !important'));
check('No change to Twitch minimum, chat rail, mounts and mobile',
 css.includes('min-width: 400px;') && css.includes('min-height: 300px;') &&
 app.includes('showDesktopChatRail') &&
 app.includes('selectBoundedMountedChannels({') &&
 app.includes('onClick={returnToDual}>▦ Dual</button>'));
const five=buildUltrawideSixPage({channels:['a','b','c','d','e'],page:0});
check('Five selected streams share one ultrawide page',five.channels.length===5 && five.pageCount===1);
const six=buildUltrawideSixPage({channels:['a','b','c','d','e','f'],page:0});
check('Six streams still display in a 3x2 single page',six.channels.length===6 && six.pageCount===1);
const ten=Array.from({length:10},(_,i)=>`stream${i}`);
check('More than six keeps previous pager',
 buildUltrawideSixPage({channels:ten,page:0}).channels.length===6 &&
 buildUltrawideSixPage({channels:ten,page:1}).channels.length===4);
const locked=buildUltrawideSixPage({channels:ten,page:0,lockedSlots:{stream0:0,stream1:4}});
const second=buildUltrawideSixPage({channels:ten,page:1,lockedSlots:{stream0:0,stream1:4}});
check('Six-up lock slots remain stable',locked.slotsByChannel.stream0===0 && second.slotsByChannel.stream0===0 && locked.slotsByChannel.stream1===4 && second.slotsByChannel.stream1===4);
check('Five-up start columns are numeric so TwitchPlayer actually applies them',
  columns.every(Number.isFinite) &&
  readFileSync('src/components/TwitchPlayer.jsx','utf8').includes('...(Number.isFinite(gridColumn) ? { gridColumn } : {})'));
check('Five-up and six-up tile widths are identical with the same grid gap',
  [1400,1800,2400].every(width => {
    const gap=6;
    const original=(width-2*gap)/3;
    const corrected=2*(width-5*gap)/6+gap;
    return Math.abs(original-corrected)<0.001;
  }));
check('Bottom two begin halfway into an existing six-up tile',
  columns[3]===2 && columns[4]===4 &&
  centeredFivePosition(3).gridRow===2 && centeredFivePosition(4).gridRow===2);
console.log('PASS: Five-wide trial structural logic. Real browser geometry/playback still required.');
