import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURE_SECTIONS, RELEASE_NOTES, ROADMAP, LATEST_RELEASE_ID } from '../src/content/squadViewGuide.js';

const app = readFileSync('src/App.jsx','utf8');
const home = readFileSync('src/pages/HomePage.jsx','utf8');
const footer = readFileSync('src/components/legal/SiteFooter.jsx','utf8');
const pages = readFileSync('src/pages/ProductGuidePages.jsx','utf8');
const css = readFileSync('src/pages/productGuidePages.css','utf8');
function check(name, condition) { assert.ok(condition, name); console.log(`PASS: ${name}`); }
check('Latest release exists and drives unread badge', LATEST_RELEASE_ID === RELEASE_NOTES[0]?.id && pages.includes('UPDATES_SEEN_KEY'));
check('Release ids unique', new Set(RELEASE_NOTES.map(r=>r.id)).size===RELEASE_NOTES.length);
check('Release dates valid, sorted newest first', RELEASE_NOTES.every((r,i)=> /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date)) && (!i||r.date<=RELEASE_NOTES[i-1].date)));
check('Each release has meaningful title, summary and highlights', RELEASE_NOTES.every(r=>r.title.length>5&&r.summary.length>30&&r.highlights.length>0&&r.highlights.every(h=>h.title&&h.text)));
check('Feature sections have unique ids and descriptions', new Set(FEATURE_SECTIONS.map(s=>s.id)).size===FEATURE_SECTIONS.length && FEATURE_SECTIONS.every(s=>s.features.length&&s.description));
const features=FEATURE_SECTIONS.flatMap(section=>section.features);
check('Comprehensive documented feature catalog',features.length>=35);
check('Feature IDs unique and cards documented',new Set(features.map(f=>f.id)).size===features.length&&features.every(f=>f.title&&f.description&&f.how&&f.access));
check('Roadmap separate from released catalog', ROADMAP.length>0 && pages.includes('not tools we are claiming are already released'));
check('Both public routes registered',app.includes("route === '/features'")&&app.includes("route === '/updates'"));
check('Both routes linked from navigation',app.includes('sv-guide-topnav')&&home.includes('sv-guide-marketing-nav'));
check('Both public routes in shared footer',footer.includes('href="/features"')&&footer.includes('href="/updates"'));
check('Viewer settings links open away from active playback',app.includes('className="sv-guide-viewer-link"')&&app.includes('target="_blank"'));
check('Page metadata sets canonical links and titles',pages.includes('document.title')&&pages.includes('canonical?.setAttribute'));
check('Feature search filters content',pages.includes('setSearch')&&pages.includes('normalizedSearch')&&pages.includes('setCategory'));
check('Copy release button has real action',pages.includes('navigator.clipboard.writeText')&&pages.includes('onClick={() => copyRelease(release)}'));
check('Scoped styles do not globally alter stream player dimensions',!css.includes('.stream-card {')&&!css.includes('.player-mount {')&&!css.includes('.viewer-header {'));
console.log('PASS: Phase 6.3.4B product guide verification complete.');
