/*
 * SQUADVIEW RELEASE NOTES + FEATURE CATALOG
 *
 * HOW TO ADD A RELEASE:
 * 1. Copy the first object in RELEASE_NOTES.
 * 2. Give the copy a NEW unique id, date, version, title, summary and highlights.
 * 3. Insert it at the TOP of the array (newest first).
 * 4. Run npm run build and release the website through the usual guarded workflow.
 * 5. Only describe code that is already tested and included in the release.
 *
 * The two public pages and the unread "New" badge read from this file.
 * No database, secret key, or administrator account is required.
 */

export const RELEASE_NOTES = [
  {
    id: '2026-11-08-phase-6-3-4a',
    version: 'Phase 6.3.4A',
    date: '2026-11-08',
    label: 'Viewer update',
    title: 'Keep the streams that matter in view',
    summary: 'Stream Locking lets you choose who stays visible when you move through a larger lineup, with cleaner controls and better video fitting on shorter screens.',
    highlights: [
      { title: 'Lock Twitch streams', text: 'Keep selected creators visible when moving to the next or previous viewer page. On desktop, lock up to three streams in a four-stream grid.' },
      { title: 'Choose the mobile keeper', text: 'Lock either of the two visible mobile streams so the other one rotates, rather than always keeping the first stream.' },
      { title: 'Cleaner player controls', text: 'More compact SquadView and stream headers leave extra room for the videos themselves.' },
      { title: 'Full-frame fitting', text: 'Short desktop browser windows can show complete stream frames rather than cropping the bottom of the picture.' },
    ],
    notes: 'Locking a stream and choosing which stream to hear are separate controls. The original audio selection behavior is preserved.',
  },
  {
    id: '2026-11-06-phase-6-3-3',
    version: 'Phase 6.3.3',
    date: '2026-11-06',
    label: 'Mobile audio',
    title: 'More control over mobile listening',
    summary: 'Mobile viewers can choose the stream they want to hear without making that video the only one on screen.',
    highlights: [
      { title: 'Choose Listen', text: 'Select the audible Twitch stream in the mobile viewer and Split + Chat layout.' },
      { title: 'Independent audio intent', text: 'Switching the chat target or video layout no longer needs to make the first stream the listening choice.' },
    ],
    notes: 'iPhone and iPad generally use one audible Twitch stream at a time. Behavior on other mobile browsers can vary.',
  },
  {
    id: '2026-11-06-phase-6-3-2',
    version: 'Phase 6.3.2',
    date: '2026-11-06',
    label: 'Playback stability',
    title: 'Smoother returns to mobile streams',
    summary: 'Playback improvements reduce unnecessary Twitch player startup cycles when viewers switch between mobile streams.',
    highlights: [
      { title: 'iOS playback stability', text: 'Better handling of previously visible stream players on iPhone and iPad.' },
      { title: 'Less unnecessary restarting', text: 'Player resume logic avoids redundant playback commands where possible.' },
    ],
  },
];

/*
 * Feature availability categories:
 *   'Everyone' | 'Twitch sign-in' | 'Premium' | 'Creator Studio' | 'Tournament beta'
 * The catalog describes currently implemented tools. Future ideas go in ROADMAP.
 */
export const FEATURE_SECTIONS = [
  {
    id: 'viewing', title: 'Viewing and layouts', eyebrow: 'Watch your way',
    description: 'Build a lineup, control which streams are on screen, and move between different ways to watch.',
    features: [
      { id: 'multi-view', title: 'Multi-stream viewing', access: 'Everyone', description: 'Build a Twitch lineup with up to eight channels on Free, or up to sixteen on Premium. The viewer displays a manageable set of feeds at a time.', how: 'Open SquadView, add Twitch usernames, and select Start watching.' },
      { id: 'grid-layout', title: 'Desktop Grid', access: 'Everyone', description: 'Watch several Twitch streams together in a desktop grid, with page controls for a larger lineup.', how: 'Choose Grid and use Next or Previous to move between streams.' },
      { id: 'mobile-view', title: 'Mobile Dual and Split + Chat', access: 'Everyone', description: 'Keep two Twitch streams on screen on supported mobile layouts, with chat available in the same workspace.', how: 'Use One or Two in the mobile viewer, or choose your mobile chat layout in Settings.' },
      { id: 'solo-focus', title: 'Solo / Focus mode', access: 'Everyone', description: 'Give one creator more space without rebuilding the current roster.', how: 'Tap Focus on a visible stream, then return to Grid or Dual when ready.' },
      { id: 'stream-lock', title: 'Stream Locking', access: 'Everyone', description: 'Choose which creators stay visible as the rest of your lineup rotates. Locks follow the streamer rather than the position.', how: 'Tap Lock on a stream, then use Next or Previous. On a four-stream desktop grid you can lock up to three streams.' },
      { id: 'manage-streams', title: 'Manage Streams', access: 'Everyone', description: 'Add, remove, reorder, swap, and replace Twitch channels from a draft roster before applying changes to the viewer.', how: 'Open Manage Streams, adjust your lineup, and choose Done.' },
      { id: 'live-auto-fill', title: 'Live Favorite auto-fill', access: 'Everyone', description: 'Optionally fill open viewer slots with eligible live SquadView Favorites without replacing your current streams.', how: 'Favorite channels, then enable Auto-fill live SquadView Favorites in Manage Streams.' },
      { id: 'desktop-chat-layout', title: 'Grid + Chat and compact view', access: 'Everyone', description: 'Keep Twitch chat beside your video grid or in a grid tile depending on the chosen desktop layout.', how: 'Select Chat for a stream, then explore desktop placement options in Viewer Settings.' },
      { id: 'video-fit', title: 'Responsive video fitting', access: 'Everyone', description: 'The viewer adjusts to different screen sizes, including shorter desktop browser windows, to reduce video cropping.', how: 'Resize your window or use SquadView on another display.' },
      { id: 'youtube-companion', title: 'YouTube Companion', access: 'Everyone', description: 'Place one supported YouTube video beside Twitch streams. Some videos cannot be embedded because of YouTube restrictions.', how: 'In the viewer, open Settings, then Add YouTube Companion. Search or paste a supported video link.' },
      { id: 'pwa', title: 'Installable web app', access: 'Everyone', description: 'Install SquadView on supported phones and computers for convenient app-style access.', how: 'Use Install app, or Add to Home Screen in Safari on iPhone or iPad.' },
    ],
  },
  {
    id: 'twitch', title: 'Twitch connection and Squads', eyebrow: 'Your creators',
    description: 'Use Twitch to discover live creators and save combinations you return to often.',
    features: [
      { id: 'guest', title: 'Watch without signing in', access: 'Everyone', description: 'Build and open a Twitch viewing session without creating a SquadView account.', how: 'Enter Twitch channel names on the home screen.' },
      { id: 'twitch-sign-in', title: 'Sign in with Twitch', access: 'Twitch sign-in', description: 'Connect a Twitch account to personalize discovery, saved content, and native chat.', how: 'Use Sign in with Twitch on the SquadView home screen.' },
      { id: 'following-live', title: 'Following Live', access: 'Twitch sign-in', description: 'See followed creators who are currently live, subject to Twitch availability and account permissions.', how: 'Open Following from the main navigation.' },
      { id: 'favorites', title: 'Favorite creators', access: 'Everyone', description: 'Mark frequently watched creators for quicker access and eligible automatic live-slot filling.', how: 'Tap the heart on a stream or in Manage Streams.' },
      { id: 'saved-squads', title: 'Saved Squads', access: 'Twitch sign-in', description: 'Keep reusable viewer groups and reopen them later. Free supports up to three viewer Saved Squads; Premium removes that limit.', how: 'Choose Save as Squad from the viewer and find it under Squads.' },
      { id: 'share-view', title: 'Share the current view', access: 'Everyone', description: 'Send a link containing the current Twitch lineup so friends can open the group without entering the usernames again.', how: 'Use Share in the viewer.' },
      { id: 'active-squads', title: 'Live activity on saved Squads', access: 'Twitch sign-in', description: 'See which members of a saved viewer Squad appear live and launch the active members together.', how: 'Open Squads or Following after connecting Twitch.' },
    ],
  },
  {
    id: 'audio-chat', title: 'Audio and chat', eyebrow: 'Hear and participate',
    description: 'Choose the sound you want and join a Twitch conversation from the same viewing space.',
    features: [
      { id: 'listen', title: 'Choose the audible stream', access: 'Everyone', description: 'Use Listen to select which displayed Twitch stream you want to hear without changing the roster.', how: 'Tap Listen on the stream or open the mobile Audio Mix controls.' },
      { id: 'volumes', title: 'Per-stream volume controls', access: 'Everyone', description: 'Adjust supported player volumes and retain useful listening levels during the viewing session.', how: 'Open the speaker or Audio Mix controls on a stream.' },
      { id: 'native-chat', title: 'SquadView native Twitch chat', access: 'Twitch sign-in', description: 'Read and send Twitch messages through your connected account, with emote support and channel badges where available.', how: 'Open Chat, choose Native, and sign in with Twitch.' },
      { id: 'twitch-chat', title: 'Embedded Twitch chat fallback', access: 'Everyone', description: 'Switch to Twitch-hosted chat when you want Twitch-specific controls such as certain moderator actions or channel-point features.', how: 'Use the Twitch option in the chat panel.' },
      { id: 'chat-target', title: 'Chat target switching', access: 'Everyone', description: 'Switch whose chat you are following without necessarily changing the stream you are hearing.', how: 'Choose a stream chat or switch the chat target in the chat area.' },
      { id: 'mobile-ios', title: 'Mobile playback stability', access: 'Everyone', description: 'iOS-aware video and audio handling helps make returning to a recently viewed stream smoother. Mobile browsers may still enforce their own audio restrictions.', how: 'Use Dual, Split + Chat, and Listen on your phone.' },
    ],
  },
  {
    id: 'creator', title: 'Creator Studio', eyebrow: 'For streamers',
    description: 'Build a public multi-creator destination for your community, with a separate Creator Studio roster.',
    features: [
      { id: 'creator-dashboard', title: 'Creator dashboard', access: 'Creator Studio', description: 'Create, edit, and organize creator Squads with a title, description, selected channel roster, and shareable URL slug.', how: 'Sign in with Twitch and open Streamer Setup.' },
      { id: 'creator-members', title: 'Approved streamer roster', access: 'Creator Studio', description: 'Manage up to sixteen approved creators per Squad on Free, or fifty per Squad with Premium Creator Studio access.', how: 'Edit a Creator Squad and choose channels manually, from favorites, or from Twitch follows.' },
      { id: 'creator-publish', title: 'Public Creator Squad page', access: 'Creator Studio', description: 'Publish an active Squad to a creator-facing public page that visitors can open without rebuilding the roster.', how: 'Choose a public slug, save the Squad, and publish it from Creator Studio.' },
      { id: 'creator-active', title: 'One active Creator Squad', access: 'Creator Studio', description: 'Choose which published Squad represents the creator at a time. Free allows one Creator Squad; Premium supports up to ten saved Creator Squads.', how: 'Publish or unpublish from Streamer Setup.' },
    ],
  },
  {
    id: 'tournaments', title: 'Tournament and Broadcast Studio', eyebrow: 'Events and production',
    description: 'A beta toolkit for directing OBS-friendly multi-creator tournament scenes.',
    features: [
      { id: 'director', title: 'Tournament director', access: 'Tournament beta', description: 'Set up a tournament roster and control the selected audience stage separately from the public-facing layout.', how: 'Open the tournament tools from Streamer Setup or /dashboard/tournaments.' },
      { id: 'formats', title: 'Solo and team formats', access: 'Tournament beta', description: 'Organize competitors into solo, duo, trio, squad-of-four, or custom team formats, with up to sixteen people in the roster.', how: 'Choose a tournament format and assign competitors to teams.' },
      { id: 'scene-layouts', title: 'Spotlight, Versus, Trio, and Quad', access: 'Tournament beta', description: 'Choose a stage layout for one, two, three, or four featured Twitch streams.', how: 'Select a layout in the Director page.' },
      { id: 'preview-program', title: 'Preview and TAKE controls', access: 'Tournament beta', description: 'Queue a scene in Preview, then use TAKE to apply it to Program for the broadcast stage.', how: 'Select competitor feeds in Preview, then take the scene live when ready.' },
      { id: 'team-presets', title: 'Team scene shortcuts', access: 'Tournament beta', description: 'Store team arrangements and switch between prepared competitor layouts.', how: 'Use team presets in the tournament switcher.' },
      { id: 'obs-stage', title: 'OBS-friendly broadcast stage', access: 'Tournament beta', description: 'Use a separate stage route as a browser source in OBS. SquadView does not send RTMP video directly.', how: 'Open the Broadcast Stage on the same browser setup as the Director, then capture it with OBS.' },
    ],
  },
  {
    id: 'premium', title: 'Premium and membership', eyebrow: 'More room to watch',
    description: 'Optional paid benefits for larger lineups and recurring Squads.',
    features: [
      { id: 'premium-viewer', title: 'Up to sixteen Twitch channels', access: 'Premium', description: 'Keep a larger roster in one viewer session and page through the visible streams.', how: 'Upgrade from the account or Premium controls in SquadView.' },
      { id: 'premium-saved', title: 'Unlimited viewer Saved Squads', access: 'Premium', description: 'Save more reusable viewer groups than the three offered on Free.', how: 'Sign in and save additional viewer Squads.' },
      { id: 'premium-creator', title: 'Expanded Creator Studio', access: 'Premium', description: 'Keep up to ten Creator Squads, with up to fifty approved creators per Squad, instead of one Squad with sixteen approved creators on Free.', how: 'Open Streamer Setup with Premium access.' },
      { id: 'premium-ads', title: 'No SquadView-supplied ads', access: 'Premium', description: 'Remove SquadView-supplied advertising. Twitch and YouTube can still show ads within their own players.', how: 'Activate an eligible Premium membership.' },
      { id: 'billing', title: 'Monthly, annual, and trial options', access: 'Premium', description: 'The current app lists $3.99 monthly and $34.99 annually, with a ten-day trial for eligible new subscriptions. Checkout shows the applicable terms.', how: 'Choose Go Premium to review current subscription options.' },
      { id: 'rewards', title: 'Referral Premium rewards', access: 'Twitch sign-in', description: 'Qualifying new-user referrals can earn promotional Premium time and progress toward Lifetime Premium.', how: 'Sign in and use the referral or sharing area where available.' },
    ],
  },
];

export const ROADMAP = [
  { title: 'Quick Manage in the fourth grid position', text: 'A compact stream manager in the unused fourth tile when three desktop streams are visible.' },
  { title: 'Easier YouTube discovery', text: 'A direct Add YouTube control from Manage Streams. The existing Companion is currently accessed through Viewer Settings.' },
  { title: 'Native creator chatbot', text: 'Automatic !squad responses from a creator-connected bot. A published Squad URL is available now; built-in chatbot automation is not yet confirmed as released.' },
  { title: 'Advanced YouTube / multi-window tools', text: 'Second Screen, Multi Window, and persistent Companion improvements are planned beyond the existing single-video Companion.' },
];

export const UPDATES_SEEN_KEY = 'squadview:latest-update-seen:v1';
export const LATEST_RELEASE_ID = RELEASE_NOTES[0]?.id || '';
