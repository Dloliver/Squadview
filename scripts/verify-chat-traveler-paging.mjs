import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const appPath = path.join(root, 'src/App.jsx');

console.log('');
console.log('======================================================');
console.log(' SQUADVIEW CHAT TRAVELER PAGING VERIFICATION');
console.log('======================================================');
console.log('');
console.log(`Project: ${root}`);
console.log('');

if (!fs.existsSync(appPath)) {
  console.log('CHECK: src/App.jsx was not found.');
  console.log('Terminal remains available.');
} else {
  const app = fs.readFileSync(appPath, 'utf8');
  const checks = [];

  checks.push([
    'Session-only chat rotation state exists',
    app.includes('desktopChatRotationChannels') && app.includes('setDesktopChatRotationChannels'),
  ]);
  checks.push([
    'Chat owner is documented as the traveling stream',
    app.includes('Desktop Grid + Chat uses a "traveler" model.'),
  ]);
  checks.push([
    'Previous chat owner replaces the selected page-local stream',
    app.includes('const replacementPageChannels = currentVisible.filter((item) => item !== cleaned);')
      && app.includes('nextRotation.splice('),
  ]);
  checks.push([
    'Desktop render uses session chat rotation',
    app.includes('desktopVisibleTwitchLimit,\n          desktopChatRotationChannels,'),
  ]);
  checks.push([
    'Page arrows use the same session chat rotation',
    app.includes('nextPage,\n            desktopVisibleTwitchLimit,\n            desktopChatRotationChannels,'),
  ]);
  checks.push([
    'Viewer start resets traveler paging cleanly',
    app.includes('setDesktopChatRotationChannels(unique.slice(1));')
      && app.includes('setDesktopChatPinnedSlot(0);'),
  ]);

  // Execute the actual paging helpers copied from App.jsx so the behavior is
  // verified against the installed implementation rather than a duplicate.
  try {
    const helperStart = app.indexOf('function getDesktopChatRotationChannels');
    const helperEnd = app.indexOf('function readSharedViewerLink', helperStart);
    if (helperStart < 0 || helperEnd < 0) throw new Error('paging helper block not found');

    const helperSource = app.slice(helperStart, helperEnd);
    const getHelpers = new Function(`${helperSource}\nreturn { getDesktopChatRotationChannels, getDesktopChatPageChannels };`);
    const { getDesktopChatRotationChannels, getDesktopChatPageChannels } = getHelpers();

    const channels = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const page = 2;
    const visibleLimit = 3;
    const oldPinned = '1';
    const oldPinnedSlot = 0;
    const currentRotation = channels.filter((channel) => channel !== oldPinned);
    const before = getDesktopChatPageChannels(
      channels,
      oldPinned,
      oldPinnedSlot,
      page,
      visibleLimit,
      currentRotation,
    );

    const nextPinned = '6';
    const clickedSlot = before.indexOf(nextPinned);
    const otherPerPage = visibleLimit - 1;
    const pageStart = page * otherPerPage;
    const pageOtherCount = Math.min(otherPerPage, currentRotation.length - pageStart);
    const replacement = before.filter((channel) => channel !== nextPinned);
    const nextRotation = [...currentRotation];
    nextRotation.splice(pageStart, pageOtherCount, ...replacement);
    const normalizedNextRotation = getDesktopChatRotationChannels(channels, nextPinned, nextRotation);

    const afterSwitch = getDesktopChatPageChannels(
      channels,
      nextPinned,
      clickedSlot,
      page,
      visibleLimit,
      normalizedNextRotation,
    );
    const nextPage = getDesktopChatPageChannels(
      channels,
      nextPinned,
      clickedSlot,
      page + 1,
      visibleLimit,
      normalizedNextRotation,
    );
    const returnPage = getDesktopChatPageChannels(
      channels,
      nextPinned,
      clickedSlot,
      page,
      visibleLimit,
      normalizedNextRotation,
    );

    checks.push([
      'Example starts with 1 Chat, 6, 7 on page 3',
      JSON.stringify(before) === JSON.stringify(['1', '6', '7']),
    ]);
    checks.push([
      'Moving Chat to 6 keeps page 3 visually stable',
      JSON.stringify(afterSwitch) === JSON.stringify(['1', '6', '7']),
    ]);
    checks.push([
      'Only the new Chat stream 6 follows to the next page',
      nextPage.includes('6') && !nextPage.includes('1') && !nextPage.includes('7'),
    ]);
    checks.push([
      'Returning restores page 3 with 1, 6 Chat, 7',
      JSON.stringify(returnPage) === JSON.stringify(['1', '6', '7']),
    ]);
  } catch (error) {
    checks.push(['Executable paging behavior check', false]);
    console.log(`CHECK  Could not execute paging helpers: ${error.message}`);
  }

  let failures = 0;
  for (const [label, passed] of checks) {
    console.log(`${passed ? 'PASS' : 'CHECK'}  ${label}`);
    if (!passed) failures += 1;
  }

  console.log('');
  if (failures === 0) {
    console.log('Chat traveler paging behavior looks correct.');
  } else {
    console.log(`${failures} verification item(s) need review.`);
  }
  console.log('Terminal remains available.');
}

console.log('');
console.log('======================================================');
console.log('');
