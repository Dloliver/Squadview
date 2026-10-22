import fs from 'node:fs';
const app=fs.readFileSync('src/App.jsx','utf8');
const player=fs.readFileSync('src/components/TwitchPlayer.jsx','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const checks=[
 ['separate viewer and manager drag state',app.includes("const [draggedViewerChannel, setDraggedViewerChannel] = useState('')") && app.includes('const dragged = cleanChannel(draggedViewerChannel)')],
 ['reordering preserves paging and selected audio',app.includes('function commitViewerReorder(reordered)') && app.includes('preserveDesktopPage: true,') && app.includes('preserveAudioMix: true,') && app.includes('preferredDesktopLead: desktopLeadChannel,')],
 ['reorder commits through normal persistence path',app.includes('commitViewerChannels(reordered, {') && app.includes('saveLastChannels(unique);')],
 ['chat owner retained',app.includes('const nextChatChannel = unique.includes(chatChannel) ? chatChannel : nextActive;')],
 ['stable player identity',app.includes('key={channel}') && app.includes('[...mountedPlayerChannelsRef.current].filter(')],
 ['visual order via CSS tile order',app.includes('tileOrder={twitchTileOrder(channel)}') && player.includes('order: tileOrder')],
 ['dedicated draggable handle',player.includes('className={`viewer-reorder-handle') && player.includes('draggable') && player.includes('onDragStart={(event) => {')],
 ['drag only enabled on desktop grid',app.includes("canViewerReorder={isDesktopGrid && (viewMode === 'dual' || desktopGridChat) && visibleChannels.length > 1}")],
 ['mobile alternative buttons',player.includes('className="viewer-mobile-reorder"') && player.includes('onClick={onMoveEarlier}') && player.includes('onClick={onMoveLater}')],
 ['drag does not affect iframe or Stripe',!player.includes('onDragStart={onViewerDragStart}') && !app.includes('updateSavedSquad(reordered')],
 ['mobile and desktop CSS',css.includes('@media (max-width: 760px) {\n  .viewer-reorder-handle { display: none; }')],
];
let bad=false;for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'}  ${name}`); if(!ok) bad=true; }
if(bad)process.exit(1);
console.log('Phase 4.3.3 focused static verification passed.');
