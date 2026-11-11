import fs from 'node:fs';
import assert from 'node:assert/strict';
const app = fs.readFileSync('src/App.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
const check = (name, condition) => { assert.ok(condition, name); console.log('PASS:', name); };
check('Three desktop modes remain adjacent and actionable',
  app.includes('className="squadview-view-mode-switch"') &&
  app.includes("activateDesktopViewerLayout('grid')") &&
  app.includes("activateDesktopViewerLayout('dual-chat')") &&
  app.includes("activateDesktopViewerLayout('six-stream')"));
check('Desktop footer explicitly groups stream swap and Next at right',
  app.includes('className="squadview-toolbar-trailing"') &&
  app.includes('className="squadview-toolbar-next"') &&
  app.includes('aria-label="Desktop page and stream controls"'));
check('Layout left, pagination center, desktop trailing controls right',
  css.includes('grid-template-columns: minmax(0, 1fr) 220px minmax(0, 1fr)') &&
  css.includes('.squadview-view-mode-switch {\n    grid-column: 1') &&
  css.includes('.toolbar-page-controls {\n    grid-column: 2') &&
  css.includes('.squadview-toolbar-trailing {\n    grid-column: 3'));
check('Toolbar retains the 52px player-height budget',
  css.includes('flex: 0 0 52px;') && css.includes('height: 52px;'));
check('Pagination still invokes exactly the prior-page handlers',
  app.includes('onClick={previousDesktopPage}') &&
  app.includes('onClick={nextDesktopPage}') &&
  app.includes('onClick={desktopPagedMode ? nextDesktopPage : cycleForward}'));
check('Dual Chat keeps both channel selectors and independent swap handlers',
  app.includes('chooseDesktopDualStream(\'lead\', event.target.value)') &&
  app.includes('chooseDesktopDualStream(\'other\', event.target.value)') &&
  app.includes('cycleDesktopDualOther(-1)') && app.includes('cycleDesktopDualOther(1)'));
check('Phone rendering keeps Mobile Dual without desktop three-mode selector',
  app.includes('isDesktopGrid ? (') && app.includes('onClick={returnToDual}>▦ Dual</button>') &&
  css.includes('@media (max-width: 760px) {\n  .viewer-toolbar .squadview-view-mode-switch,') &&
  css.includes('.viewer-toolbar .squadview-toolbar-trailing {\n    display: none !important;'));
check('Twitch player geometry, mount bounding and ultrawide CSS unchanged in footer patch',
  app.includes('selectBoundedMountedChannels({') &&
  css.includes('grid-template-columns: repeat(3, minmax(400px, 1fr)) !important') &&
  css.includes('min-height: 300px;') && css.includes('transform: none !important;'));
console.log('PASS: Desktop toolbar layout polish and mobile guard checks complete. Browser acceptance still required.');
