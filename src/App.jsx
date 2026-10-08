import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TwitchPlayer from './components/TwitchPlayer';
import YouTubeCompanion from './components/YouTubeCompanion';
import YouTubeCompanionModal from './components/YouTubeCompanionModal';
import ChatPanel from './components/ChatPanel';
import SiteFooter from './components/legal/SiteFooter';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import SupportPage from './pages/SupportPage';
import AboutPage from './pages/AboutPage';
import HomePage from './pages/HomePage';
import InstallSquadView from './components/InstallSquadView';
import VastLoadingAd from './components/ads/VastLoadingAd';
import { getStreamCountBucket, trackEvent } from './analytics/dataLayer';
import {
  ensureSquadViewProfile,
  getCurrentAccountSession,
  isSquadViewAuthConfigured,
  loadSquadViewUserState,
  saveSquadViewUserState,
  signInWithTwitch,
  signOutOfSquadView,
  subscribeToAccountChanges,
} from './services/accountService';
import { loadFollowedChannels, loadFollowedLiveStreams } from './services/twitchFollowingService';
import { FREE_ENTITLEMENTS } from './config/plans';
import { AD_CONFIG, isLoadingAdConfigured, markLoadingAdShown, shouldShowLoadingAd } from './config/advertising';
import { loadSquadViewEntitlements } from './services/premiumService';
import { createSavedSquad, deleteSavedSquad, loadSavedSquads, updateSavedSquad } from './services/savedSquadService';
import {
  capturePendingReferralFromLocation,
  claimSquadViewReferral,
  getPendingReferralCode,
  loadSquadViewReferralSummary,
} from './services/referralService';

function Icon({ symbol, className = '' }) {
  return <span className={`text-icon ${className}`} aria-hidden="true">{symbol}</span>;
}
const ArrowLeft = () => <Icon symbol="←" />;
const Heart = () => <Icon symbol="♡" />;
const FilledHeart = () => <Icon symbol="♥" />;
const Maximize2 = () => <Icon symbol="⛶" />;
const Menu = () => <Icon symbol="☰" />;
const Radio = () => <Icon symbol="◉" />;
const Save = () => <Icon symbol="☆" />;
const Share2 = () => <Icon symbol="↗" />;
const Sparkles = () => <Icon symbol="✦" />;
const Trash2 = () => <Icon symbol="×" />;
const X = () => <Icon symbol="×" />;

const FAVORITE_STREAMERS_KEY = 'squadview:favorite-streamers:v2';
const LEGACY_FAVORITES_KEY = 'squadview:favorites:v1';
const LAST_CHANNELS_KEY = 'squadview:last-channels:v1';
const VIEWER_SESSION_KEY = 'squadview:viewer-session:v1';
const GUEST_BENEFITS_SESSION_KEY = 'squadview:guest-benefits-dismissed:v1';
const REFERRAL_PROMO_DISMISSED_KEY = 'squadview:referral-promo-dismissed:v1';
const REFERRAL_PROMO_WATCH_MS = 5 * 60 * 1000;
const REFERRAL_PROMO_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LIVE_STATUS_API_URL = (import.meta.env.VITE_LIVE_STATUS_API_URL || '').replace(/\/$/, '');
const MAX_SUPPORTED_VIEWER_STREAMS = 16;
const AUTO_FILL_FAVORITES_KEY = 'squadview:auto-fill-favorites:v1';
const FAVORITE_LIVE_ALERTS_KEY = 'squadview:favorite-live-alerts:v1';
const FAVORITE_LIVE_ALERT_SOUND_KEY = 'squadview:favorite-live-alert-sound:v1';
const FAVORITE_LIVE_POLL_MS = 60 * 1000;
const VIEWER_LIVE_POLL_MS = 45 * 1000;
const OFFLINE_REMOVAL_GRACE_MS = 75 * 1000;
const FREE_FAVORITE_STREAMER_LIMIT = 8;
const PREMIUM_FAVORITE_STREAMER_LIMIT = 50;

function readStoredBoolean(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

function playFavoriteLiveAlertTone() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    window.setTimeout(() => void context.close?.(), 350);
  } catch {
    // Browser media policy may block a tone until the user has interacted.
  }
}

function padViewerInputs(values, limit) {
  const safeLimit = Math.max(1, Math.min(MAX_SUPPORTED_VIEWER_STREAMS, Number(limit) || 8));
  const source = Array.isArray(values) ? values.slice(0, safeLimit) : [];
  return [...source, ...Array(Math.max(0, safeLimit - source.length)).fill('')].slice(0, safeLimit);
}

function compactViewerInputs(values, limit) {
  const compacted = Array.isArray(values)
    ? values.filter((value) => String(value || '').trim())
    : [];
  return padViewerInputs(compacted, limit);
}

function readFavoriteStreamers() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_STREAMERS_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) {
      return [...new Set(saved.map(cleanChannel).filter(Boolean))];
    }

    // Preserve channels from the previous saved-group format the first time
    // this version runs, then store them as individual favorite streamers.
    const legacyGroups = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY) || '[]');
    const migrated = [...new Set(legacyGroups.flatMap((group) => group?.channels || []).map(cleanChannel).filter(Boolean))];
    if (migrated.length) {
      localStorage.setItem(FAVORITE_STREAMERS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function cleanChannel(value) {
  return String(value || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function isIOSLikeDevice() {
  try {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';

    return (
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1)
    );
  } catch {
    return false;
  }
}

function formatRewardDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function referralPromoCooldownActive() {
  try {
    const dismissedAt = Number(localStorage.getItem(REFERRAL_PROMO_DISMISSED_KEY)) || 0;
    return dismissedAt > 0 && Date.now() - dismissedAt < REFERRAL_PROMO_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function getReferralPromoCopy(summary, signedIn) {
  if (!signedIn) {
    return {
      eyebrow: 'SquadView Rewards',
      title: 'Get Premium free',
      body: 'Sign in with Twitch, then invite 5 new SquadView users to unlock 30 days of Premium.',
    };
  }

  const qualified = Math.max(0, Number(summary?.qualifiedReferrals) || 0);
  const nextRemaining = Math.max(1, Number(summary?.nextMonthRemaining) || (5 - (qualified % 5 || 0)));
  const lifetimeRemaining = Math.max(0, 100 - qualified);

  if (qualified >= 90) {
    return {
      eyebrow: 'Lifetime Premium',
      title: 'Lifetime Premium is close',
      body: `${lifetimeRemaining} more qualified ${lifetimeRemaining === 1 ? 'referral' : 'referrals'} unlocks Lifetime Premium for this Twitch account.`,
    };
  }

  if (qualified >= 5) {
    return {
      eyebrow: 'Keep building your Squad',
      title: 'Earn another free month',
      body: `${nextRemaining} more qualified ${nextRemaining === 1 ? 'referral' : 'referrals'} adds another 30 days of Premium. Every 5 keeps stacking.`,
    };
  }

  if (qualified > 0) {
    return {
      eyebrow: 'You are getting close',
      title: `${nextRemaining} more ${nextRemaining === 1 ? 'friend' : 'friends'} to Premium`,
      body: 'Share the SquadView you are watching. Every 5 qualified new users unlocks 30 days of Premium.',
    };
  }

  return {
    eyebrow: 'SquadView Rewards',
    title: 'Get Premium free',
    body: 'Invite 5 new SquadView users and unlock 30 days of Premium. Every additional 5 earns another month.',
  };
}

function getDesktopPageChannels(sourceChannels, _leadChannel, page, visibleTwitchLimit = 4) {
  if (!sourceChannels.length) return [];
  const safeVisibleLimit = Math.max(1, Math.min(4, Number(visibleTwitchLimit) || 4));
  const start = Math.max(0, page) * safeVisibleLimit;
  return sourceChannels.slice(start, start + safeVisibleLimit).filter(Boolean);
}

function getDesktopChatRotationChannels(sourceChannels, pinnedChannel, rotationChannels = []) {
  if (!sourceChannels.length) return [];
  const pinned = sourceChannels.includes(pinnedChannel) ? pinnedChannel : sourceChannels[0];
  const validRotation = [...new Set(rotationChannels)]
    .filter((channel) => sourceChannels.includes(channel) && channel !== pinned);
  const missingChannels = sourceChannels
    .filter((channel) => channel !== pinned && !validRotation.includes(channel));
  return [...validRotation, ...missingChannels];
}

function getDesktopChatPageChannels(
  sourceChannels,
  pinnedChannel,
  pinnedSlot,
  page,
  visibleTwitchLimit = 3,
  rotationChannels = [],
) {
  if (!sourceChannels.length) return [];
  const safeVisibleLimit = Math.max(1, Math.min(4, Number(visibleTwitchLimit) || 3));
  const pinned = sourceChannels.includes(pinnedChannel) ? pinnedChannel : sourceChannels[0];
  const otherChannels = getDesktopChatRotationChannels(sourceChannels, pinned, rotationChannels);
  const otherPerPage = Math.max(0, safeVisibleLimit - 1);
  const start = Math.max(0, page) * otherPerPage;
  const pageOthers = otherChannels.slice(start, start + otherPerPage);
  const safePinnedSlot = Math.max(0, Math.min(safeVisibleLimit - 1, Number(pinnedSlot) || 0));
  const result = [...pageOthers];
  result.splice(Math.min(safePinnedSlot, result.length), 0, pinned);
  return result.slice(0, safeVisibleLimit).filter(Boolean);
}

function readSharedViewerLink() {
  try {
    const url = new URL(window.location.href);
    const rawChannels = url.searchParams.get('channels');
    if (!rawChannels) return null;

    const sharedChannels = [...new Set(
      rawChannels
        .split(',')
        .map(cleanChannel)
        .filter(Boolean),
    )].slice(0, MAX_SUPPORTED_VIEWER_STREAMS);

    if (!sharedChannels.length) return null;

    const requestedActive = cleanChannel(url.searchParams.get('active'));
    const activeChannel = sharedChannels.includes(requestedActive)
      ? requestedActive
      : sharedChannels[0];

    return {
      channels: sharedChannels,
      activeChannel,
      viewMode: 'dual',
      slotChannels: sharedChannels.slice(0, 2),
      desktopPage: 0,
      desktopLeadChannel: activeChannel,
      chatLayout: 'single',
    };
  } catch {
    return null;
  }
}

function readViewerSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEWER_SESSION_KEY) || 'null');
    const restoredChannels = Array.isArray(saved?.channels)
      ? [...new Set(saved.channels.map(cleanChannel).filter(Boolean))].slice(0, MAX_SUPPORTED_VIEWER_STREAMS)
      : [];

    if (!restoredChannels.length) return null;

    const requestedActive = cleanChannel(saved?.activeChannel);
    const restoredActive = restoredChannels.includes(requestedActive)
      ? requestedActive
      : restoredChannels[0];
    const restoredMode = ['dual', 'chat', 'solo'].includes(saved?.viewMode)
      ? saved.viewMode
      : 'dual';
    const restoredSlots = Array.isArray(saved?.slotChannels)
      ? [...new Set(saved.slotChannels.map(cleanChannel).filter((channel) => restoredChannels.includes(channel)))].slice(0, 2)
      : [];
    const fallbackSecondary = restoredChannels.find((channel) => channel !== restoredActive);
    const normalizedSlots = restoredSlots.includes(restoredActive)
      ? restoredSlots
      : [restoredActive, restoredSlots[0] || fallbackSecondary].filter(Boolean);

    const requestedDesktopLead = cleanChannel(saved?.desktopLeadChannel);
    const restoredDesktopLead = restoredChannels.includes(requestedDesktopLead)
      ? requestedDesktopLead
      : restoredChannels[0];
    const restoredChatLayout = ['grid', 'single'].includes(saved?.chatLayout)
      ? saved.chatLayout
      : 'single';

    return {
      channels: restoredChannels,
      activeChannel: restoredActive,
      viewMode: restoredMode,
      slotChannels: normalizedSlots,
      desktopPage: Number.isInteger(saved?.desktopPage) && saved.desktopPage >= 0 ? saved.desktopPage : 0,
      desktopLeadChannel: restoredDesktopLead,
      chatLayout: restoredChatLayout,
    };
  } catch {
    return null;
  }
}

function SquadViewApp() {
  const [incomingReferralCode] = useState(capturePendingReferralFromLocation);
  const [sharedViewer] = useState(readSharedViewerLink);
  const [restoredViewer] = useState(() => sharedViewer ? null : readViewerSession());
  const initialViewer = sharedViewer
    ? (() => {
      const freeLimit = Math.max(1, Math.min(
        MAX_SUPPORTED_VIEWER_STREAMS,
        FREE_ENTITLEMENTS.viewerMaxStreams || 8,
      ));
      const allowedChannels = sharedViewer.channels.slice(0, freeLimit);
      const allowedActive = allowedChannels.includes(sharedViewer.activeChannel)
        ? sharedViewer.activeChannel
        : allowedChannels[0] || '';

      return {
        ...sharedViewer,
        channels: allowedChannels,
        activeChannel: allowedActive,
        slotChannels: allowedChannels.slice(0, 2),
        desktopPage: 0,
        desktopLeadChannel: allowedActive || allowedChannels[0] || '',
      };
    })()
    : restoredViewer;
  const [screen, setScreen] = useState(() => sharedViewer ? 'shared_pending' : initialViewer ? 'viewer' : 'home');
  const [inputs, setInputs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CHANNELS_KEY) || '[]');
      return padViewerInputs(saved, FREE_ENTITLEMENTS.viewerMaxStreams);
    } catch {
      return ['', '', '', ''];
    }
  });
  const [channels, setChannels] = useState(() => initialViewer?.channels || []);
  // activeChannel owns the visual/solo focus. Chat has its own channel target so
  // desktop chat switching never rewrites Focus or the viewer's audio mix.
  const [activeChannel, setActiveChannel] = useState(() => initialViewer?.activeChannel || '');
  const [chatChannel, setChatChannel] = useState(() => initialViewer?.activeChannel || '');
  const [listeningChannels, setListeningChannels] = useState(() => new Set());
  // UI status follows the controller's current audible result, not remembered
  // Listen intent. This keeps the Listening label honest when paging or another
  // viewer transition temporarily mutes a stream.
  const [audibleChannels, setAudibleChannels] = useState(() => new Set());
  const [favoriteStreamers, setFavoriteStreamers] = useState(readFavoriteStreamers);
  const [liveFavoriteStreamers, setLiveFavoriteStreamers] = useState(() => new Set());
  const [favoriteLiveStatusReady, setFavoriteLiveStatusReady] = useState(false);
  const [autoFillFavorites, setAutoFillFavorites] = useState(() => readStoredBoolean(AUTO_FILL_FAVORITES_KEY, false));
  const [favoriteLiveAlertsEnabled, setFavoriteLiveAlertsEnabled] = useState(() => readStoredBoolean(FAVORITE_LIVE_ALERTS_KEY, true));
  const [favoriteLiveAlertSound, setFavoriteLiveAlertSound] = useState(() => readStoredBoolean(FAVORITE_LIVE_ALERT_SOUND_KEY, false));
  const [favoriteLiveNotice, setFavoriteLiveNotice] = useState(null);
  const autoFillSuppressedFavoritesRef = useRef(new Set());
  const [landingTab, setLandingTab] = useState('home');
  const [followingView, setFollowingView] = useState('live');
  const [showEdit, setShowEdit] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [managerDraftChannels, setManagerDraftChannels] = useState([]);
  const [managerClearedAll, setManagerClearedAll] = useState(false);
  const [managerLiveChannels, setManagerLiveChannels] = useState(() => new Set());
  const [managerLiveStatus, setManagerLiveStatus] = useState('idle');
  // Twitch players already know when a mounted viewer stream is ONLINE/OFFLINE.
  // Mirror that signal here so Manage streams can classify current-view channels
  // even when the generic live-status endpoint is unavailable or the channel is
  // not part of the user's followed list.
  const [viewerLiveStatusByChannel, setViewerLiveStatusByChannel] = useState(() => new Map());
  const managerOriginalChannelsRef = useRef([]);
  const [managerSource, setManagerSource] = useState('live');
  const [managerSearch, setManagerSearch] = useState('');
  const [manualManagerChannel, setManualManagerChannel] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState('');
  const [draggedManagerChannel, setDraggedManagerChannel] = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [showGuestBenefits, setShowGuestBenefits] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const guestBenefitsPromptedRef = useRef(false);
  const [accountSession, setAccountSession] = useState(null);
  const [accountReady, setAccountReady] = useState(false);
  const [accountProfile, setAccountProfile] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [referralSummary, setReferralSummary] = useState(null);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState('');
  const [showShareSquad, setShowShareSquad] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [referralPromoReady, setReferralPromoReady] = useState(false);
  const [referralPromoSuppressed, setReferralPromoSuppressed] = useState(referralPromoCooldownActive);
  const referralPromoWatchMsRef = useRef(0);
  const referralPromoLastTickRef = useRef(Date.now());
  const [defaultLayout, setDefaultLayout] = useState('smart');
  const [followedLiveStreams, setFollowedLiveStreams] = useState([]);
  const [followingStatus, setFollowingStatus] = useState('idle');
  const [followingError, setFollowingError] = useState('');
  const [followedChannels, setFollowedChannels] = useState([]);
  const [followedChannelsStatus, setFollowedChannelsStatus] = useState('idle');
  const [followedChannelsError, setFollowedChannelsError] = useState('');
  const [entitlements, setEntitlements] = useState(() => ({ ...FREE_ENTITLEMENTS }));
  const [savedSquads, setSavedSquads] = useState([]);
  const [savedSquadsStatus, setSavedSquadsStatus] = useState('idle');
  const [savedSquadsError, setSavedSquadsError] = useState('');
  const [liveSavedSquadStreamers, setLiveSavedSquadStreamers] = useState(() => new Set());
  const [showSaveSquad, setShowSaveSquad] = useState(false);
  const [saveSquadName, setSaveSquadName] = useState('');
  const [saveSquadChannels, setSaveSquadChannels] = useState([]);
  const [saveSquadBusy, setSaveSquadBusy] = useState(false);
  const [editingSavedSquad, setEditingSavedSquad] = useState(null);
  const [editSquadName, setEditSquadName] = useState('');
  const [editSquadMembers, setEditSquadMembers] = useState([]);
  const [editSquadSource, setEditSquadSource] = useState('live');
  const [editSquadSearch, setEditSquadSearch] = useState('');
  const [editSquadManualChannel, setEditSquadManualChannel] = useState('');
  const [editSquadBusy, setEditSquadBusy] = useState(false);
  const [editSquadError, setEditSquadError] = useState('');
  const [youtubeCompanion, setYoutubeCompanion] = useState(null);
  const [showYoutubeCompanion, setShowYoutubeCompanion] = useState(false);
  const [showSharedArrival, setShowSharedArrival] = useState(() => Boolean(sharedViewer?.channels?.length));
  const [pendingAdLaunch, setPendingAdLaunch] = useState(null);
  const pendingAdLaunchRef = useRef(null);
  const loadingAdRef = useRef(null);
  const accountHydratedUserRef = useRef('');
  const sharedViewStartedRef = useRef(false);
  const [viewMode, setViewMode] = useState(() => initialViewer?.viewMode || 'dual');
  // Always restore refreshed viewers muted. Browsers generally block autoplaying
  // audio after a hard refresh until the user interacts with the page again.
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [slotChannels, setSlotChannels] = useState(() => initialViewer?.slotChannels || []);
  const [desktopPage, setDesktopPage] = useState(() => initialViewer?.desktopPage || 0);
  // Keep the displayed desktop page independent from the stream that is focused.
  // Focusing a stream can enable its audio without reshuffling the grid.
  const [desktopLeadChannel, setDesktopLeadChannel] = useState(() => initialViewer?.desktopLeadChannel || initialViewer?.channels?.[0] || '');
  // Grid + Chat remembers the screen slot where chat was activated. The chat
  // owner stays in that slot while paging instead of jumping to tile one as
  // soon as Chat is clicked.
  const [desktopChatPinnedSlot, setDesktopChatPinnedSlot] = useState(0);
  // Grid + Chat treats the chat owner as the one stream that travels between
  // pages. The remaining streams stay assigned to their current page slots.
  // When chat moves to another visible stream, the previous chat owner drops
  // into that page instead of jumping back to its original roster position.
  const [desktopChatRotationChannels, setDesktopChatRotationChannels] = useState(() => {
    const initialChannels = initialViewer?.channels || [];
    const initialPinned = initialViewer?.activeChannel || initialChannels[0] || '';
    return initialChannels.filter((channel) => channel !== initialPinned);
  });
  const [chatLayout, setChatLayout] = useState(() => initialViewer?.chatLayout || 'single');
  const [isDesktopGrid, setIsDesktopGrid] = useState(() => window.matchMedia?.('(min-width: 761px)').matches ?? false);
  const [isWideDesktopChat, setIsWideDesktopChat] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false);
  const [chatDockSide, setChatDockSide] = useState(() => {
    try {
      return localStorage.getItem('squadview:chat-dock-side-v1') === 'left' ? 'left' : 'right';
    } catch {
      return 'right';
    }
  });
  // iOS can keep multiple Twitch videos visible, but asking a second embed to
  // become audible may interrupt the first media session. Keep playback and
  // audio ownership separate: all visible videos remain independent, while iOS
  // uses one audible Twitch owner at a time. Other platforms keep additive Listen.
  const iosSingleAudioMode = useMemo(() => isIOSLikeDevice(), []);
  // Mobile browsers are far more reliable when exactly one Twitch embed owns
  // audio at a time. Keep multiple videos visible, but make Listen a
  // single-select control on every phone-sized viewer. The user can also
  // select the current owner again to return to an all-muted state.
  const mobileSingleAudioMode = !isDesktopGrid;
  const playersRef = useRef(new Map());
  // The focused stream owns the primary audio level. Keep that level stable
  // while paging, opening/closing chat, or moving focus to another stream.
  const focusedAudioVolumeRef = useRef(1);
  // Audio has one final-state authority. Layout components may decide whether a
  // Twitch embed is visible or paused for performance, but they never decide
  // mute/volume. The controller below is the only place that reconciles the
  // user's intended audio mix onto mounted Twitch players.
  const audioPolicyRef = useRef(null);
  const lastAppliedAudioPolicyRef = useRef(null);
  const focusReturnAudioRef = useRef(null);

  function clampFocusedAudioVolume(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(1, numeric));
  }

  function rememberFocusedAudioVolume(channel = activeChannel) {
    const player = playersRef.current.get(channel);

    if (!player) {
      return clampFocusedAudioVolume(focusedAudioVolumeRef.current, 1);
    }

    try {
      const muted = player.getMuted?.();
      const currentVolume = Number(player.getVolume?.());

      if (
        muted === false &&
        Number.isFinite(currentVolume) &&
        currentVolume >= 0
      ) {
        const remembered = clampFocusedAudioVolume(currentVolume, 1);
        focusedAudioVolumeRef.current = remembered;
        player.__squadViewPreferredVolume = remembered;
      }
    } catch {
      // Keep the last known focused volume while Twitch is initializing.
    }

    return clampFocusedAudioVolume(focusedAudioVolumeRef.current, 1);
  }


  const audioModeKey = viewMode === 'solo'
    ? 'solo'
    : (!isDesktopGrid && viewMode === 'chat')
      ? 'mobile-chat'
      : 'mix';

  function makeAudioPolicy(overrides = {}) {
    return {
      channels: [...(overrides.channels ?? channels)],
      activeChannel: cleanChannel(overrides.activeChannel ?? activeChannel),
      listeningChannels: new Set(overrides.listeningChannels ?? listeningChannels),
      audioEnabled: overrides.audioEnabled ?? audioEnabled,
      iosSingleAudioMode: overrides.iosSingleAudioMode ?? iosSingleAudioMode,
      mobileSingleAudioMode: overrides.mobileSingleAudioMode ?? mobileSingleAudioMode,
      mode: overrides.mode ?? audioModeKey,
    };
  }

  // Keep the ref current during render so Twitch READY/PLAYING callbacks always
  // reconcile against the latest intent without waiting for another state edge.
  audioPolicyRef.current = makeAudioPolicy();

  function audioPolicySelectsChannel(policy, channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || !policy?.audioEnabled || !policy.channels.includes(cleaned)) return false;

    if (policy.mode === 'solo' || policy.mode === 'mobile-chat') {
      return cleaned === policy.activeChannel;
    }

    if (policy.mobileSingleAudioMode) {
      const manualOwner = [...policy.listeningChannels].find((candidate) =>
        policy.channels.includes(candidate),
      );
      return cleaned === (manualOwner || policy.activeChannel);
    }

    return cleaned === policy.activeChannel || policy.listeningChannels.has(cleaned);
  }

  function snapshotAudioLevels(policy = lastAppliedAudioPolicyRef.current || audioPolicyRef.current) {
    if (!policy?.audioEnabled) return;

    playersRef.current.forEach((player, channel) => {
      if (!audioPolicySelectsChannel(policy, channel)) return;

      try {
        const muted = player?.getMuted?.();
        const currentVolume = Number(player?.getVolume?.());
        if (muted !== false || !Number.isFinite(currentVolume) || currentVolume < 0) return;

        const rememberedVolume = clampFocusedAudioVolume(currentVolume, 1);
        if (channel === policy.activeChannel) {
          focusedAudioVolumeRef.current = rememberedVolume;
          player.__squadViewPreferredVolume = rememberedVolume;
        } else {
          player.__squadViewManualVolume = rememberedVolume;
        }
      } catch {
        // Keep the last known SquadView level while Twitch is initializing.
      }
    });
  }

  function getPlayerAudioTarget(channel, player = playersRef.current.get(channel), policy = audioPolicyRef.current) {
    if (!player || !policy) {
      return { displayed: false, selected: false, targetVolume: 0, audible: false };
    }

    const displayed = Boolean(
      player?.__squadViewStateRef?.current?.visible ??
      player?.__squadViewState?.visible ??
      false
    );
    const selected = displayed && audioPolicySelectsChannel(policy, channel);
    const targetVolume = channel === policy.activeChannel
      ? clampFocusedAudioVolume(
          player.__squadViewPreferredVolume ?? focusedAudioVolumeRef.current,
          1,
        )
      : clampFocusedAudioVolume(player.__squadViewManualVolume, 1);

    return {
      displayed,
      selected,
      targetVolume,
      audible: Boolean(selected && targetVolume > 0),
    };
  }

  function syncAudibleChannelStatus(policy = audioPolicyRef.current) {
    const nextAudible = new Set();

    playersRef.current.forEach((player, channel) => {
      const target = getPlayerAudioTarget(channel, player, policy);
      if (target.audible) nextAudible.add(channel);
    });

    setAudibleChannels((current) => {
      if (
        current.size === nextAudible.size &&
        [...current].every((channel) => nextAudible.has(channel))
      ) {
        return current;
      }
      return nextAudible;
    });
  }

  function applyAudioPolicyToPlayer(channel, player = playersRef.current.get(channel), policy = audioPolicyRef.current) {
    if (!player || !policy) return;

    // Audio is allowed only for Twitch tiles that are actually displayed.
    // Listen choices remain remembered underneath paging so returning to a
    // page can restore the user's mix without letting hidden streams bleed.
    const { selected, targetVolume, audible } = getPlayerAudioTarget(channel, player, policy);

    try {
      player.setVolume?.(selected ? targetVolume : 0);
      player.setMuted?.(!audible);
    } catch {
      // Twitch may still be initializing. READY/PLAYING will retry this policy.
    }
  }

  function reconcileViewerAudio(overrides = {}, { captureCurrent = true } = {}) {
    const previousPolicy = lastAppliedAudioPolicyRef.current || audioPolicyRef.current;
    if (captureCurrent) snapshotAudioLevels(previousPolicy);

    const nextPolicy = makeAudioPolicy(overrides);
    audioPolicyRef.current = nextPolicy;

    playersRef.current.forEach((player, channel) => {
      applyAudioPolicyToPlayer(channel, player, nextPolicy);
    });
    syncAudibleChannelStatus(nextPolicy);

    lastAppliedAudioPolicyRef.current = nextPolicy;
    return nextPolicy;
  }

  const reconcilePlayerAudio = useCallback((channel, player) => {
    applyAudioPolicyToPlayer(channel, player, audioPolicyRef.current);
    syncAudibleChannelStatus(audioPolicyRef.current);
  }, []);

  // Twitch's native iframe controls can change mute/volume without going
  // through SquadView's Listen button. Mirror those real user audio changes
  // back into the central audio intent so the next Chat/page transition does
  // not overwrite them. Playback pause is deliberately NOT treated as an
  // audio preference.
  const syncNativeTwitchAudioIntent = useCallback((channel, nativeState = {}) => {
    const cleaned = cleanChannel(channel);
    if (!cleaned || !channels.includes(cleaned)) return;

    const nativeVolume = clampFocusedAudioVolume(nativeState.volume, 0);
    const wantsAudio = nativeState.muted !== true && nativeVolume > 0;
    const player = playersRef.current.get(cleaned);

    if (cleaned === activeChannel) {
      const nextFocusedVolume = wantsAudio ? nativeVolume : 0;
      if (Math.abs(clampFocusedAudioVolume(focusedAudioVolumeRef.current, 0) - nextFocusedVolume) > 0.01) {
        focusedAudioVolumeRef.current = nextFocusedVolume;
      }
      if (player) player.__squadViewPreferredVolume = nextFocusedVolume;
      if (wantsAudio && !audioEnabled) setAudioEnabled(true);
      return;
    }

    if (player) player.__squadViewManualVolume = wantsAudio ? nativeVolume : 0;

    setListeningChannels((current) => {
      const alreadySelected = current.has(cleaned);
      if (alreadySelected === wantsAudio) return current;

      const next = new Set(current);
      if (wantsAudio) next.add(cleaned);
      else next.delete(cleaned);
      return next;
    });

    if (wantsAudio && !audioEnabled) setAudioEnabled(true);
  }, [channels, activeChannel, audioEnabled]);

  function resumeViewerChannelsFromGesture(candidateChannels = []) {
    [...new Set(candidateChannels.map(cleanChannel).filter(Boolean))].forEach((channel) => {
      const player = playersRef.current.get(channel);
      if (!player) return;
      try {
        if (player.isPaused?.() === true) player.play?.();
      } catch {
        // Twitch's native controls remain available if playback is rejected.
      }
    });
  }

  function resumeAudioSelectedPlayers(policy) {
    playersRef.current.forEach((player, channel) => {
      if (!audioPolicySelectsChannel(policy, channel)) return;
      const displayed = Boolean(
        player?.__squadViewStateRef?.current?.visible ??
        player?.__squadViewState?.visible ??
        false
      );
      if (!displayed) return;
      try {
        if (player?.isPaused?.() === true) player.play?.();
      } catch {
        // Playback can still recover through Twitch's native controls.
      }
    });
  }

  // Twitch players are created lazily. The initial page creates only its
  // visible players. Once a channel has been visited, its player stays mounted
  // and pauses while off page so returning can resume without rebuilding every
  // Twitch embed. A completely new viewer session resets this cache.
  const mountedPlayerChannelsRef = useRef(new Set());
  // iOS/WebKit visibly restarts Twitch embeds after SquadView pauses an
  // off-page player and later calls play() again. Keep only the immediately
  // previous mobile layout warm so a normal page-back/page-forward action can
  // return instantly without keeping the entire 16-stream roster decoding.
  const mobileWarmPlaybackHistoryRef = useRef({ key: '', current: [], previous: [] });

  const viewerSessionActiveRef = useRef(Boolean(initialViewer));
  const viewerStreamLimit = Math.max(1, Math.min(MAX_SUPPORTED_VIEWER_STREAMS, entitlements.viewerMaxStreams || FREE_ENTITLEMENTS.viewerMaxStreams));
  const favoriteStreamerLimit = entitlements.isPremium
    ? PREMIUM_FAVORITE_STREAMER_LIMIT
    : FREE_FAVORITE_STREAMER_LIMIT;

  useEffect(() => {
    if (!sharedViewer?.channels?.length) return;
    trackEvent('shared_view_opened', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
    });
    trackEvent('shared_view_arrived', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
      referral_attached: Boolean(incomingReferralCode),
    });
    trackEvent('shared_view_arrival_shown', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
    });
  }, [sharedViewer, incomingReferralCode]);

  useEffect(() => {
    document.title = 'SquadView Viewer — Build Your Multi Stream View';
    const descriptionTag = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    descriptionTag?.setAttribute('content', 'Build a SquadView with multiple Twitch channels and switch between grid, chat, solo viewing, and audio focus.');
    const canonicalUrl = window.location.pathname.startsWith('/watch')
      ? 'https://squadview.app/watch'
      : 'https://squadview.app';
    canonical?.setAttribute('href', canonicalUrl);
    ogUrl?.setAttribute('content', canonicalUrl);
  }, []);

  const registerPlayer = useCallback((channel, player) => {
    if (player) playersRef.current.set(channel, player);
    else playersRef.current.delete(channel);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const session = await getCurrentAccountSession();
        if (!cancelled) {
          setAccountSession(session);
          if (!session?.user?.id) setAccountReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setAccountError(error?.message || 'Could not read the SquadView account session.');
          setAccountReady(true);
        }
      }
    }

    void loadSession();
    const unsubscribe = subscribeToAccountChanges((session) => {
      setAccountSession(session);
      setAccountReady(!session?.user?.id || accountHydratedUserRef.current === session?.user?.id);
      if (!session) {
        setAccountProfile(null);
        setDefaultLayout('smart');
        setEntitlements({ ...FREE_ENTITLEMENTS });
        setSavedSquads([]);
        setSavedSquadsStatus('idle');
        setSavedSquadsError('');
        setLiveSavedSquadStreamers(new Set());
        setReferralSummary(null);
        setReferralMessage('');
        accountHydratedUserRef.current = '';
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = accountSession?.user;
    if (!user?.id || accountHydratedUserRef.current === user.id) return;

    let cancelled = false;

    async function hydrateAccount() {
      setAccountError('');
      try {
        const [profile, cloudState, access] = await Promise.all([
          ensureSquadViewProfile(user),
          loadSquadViewUserState(user.id),
          loadSquadViewEntitlements(user.id),
        ]);

        if (cancelled) return;
        setAccountProfile(profile);
        setEntitlements(access);

        const accountViewerLimit = Math.max(1, Math.min(MAX_SUPPORTED_VIEWER_STREAMS, access.viewerMaxStreams || FREE_ENTITLEMENTS.viewerMaxStreams));
        if (sharedViewer?.channels?.length) {
          const allowedSharedChannels = sharedViewer.channels.slice(0, accountViewerLimit);
          const sharedActive = allowedSharedChannels.includes(sharedViewer.activeChannel)
            ? sharedViewer.activeChannel
            : allowedSharedChannels[0];

          setChannels(allowedSharedChannels);
          setActiveChannel(sharedActive || '');
          setSlotChannels(allowedSharedChannels.slice(0, 2));
          setDesktopPage(0);
          setDesktopLeadChannel(sharedActive || allowedSharedChannels[0] || '');
          setDesktopChatRotationChannels(
            allowedSharedChannels.filter((channel) => channel !== (sharedActive || allowedSharedChannels[0] || '')),
          );
          setDesktopChatPinnedSlot(0);
          setViewMode('dual');
          setChatLayout('single');
          viewerSessionActiveRef.current = Boolean(allowedSharedChannels.length);
        }

        let localFavorites = [];
        let localLastChannels = [];
        try {
          localFavorites = JSON.parse(localStorage.getItem(FAVORITE_STREAMERS_KEY) || '[]');
          localLastChannels = JSON.parse(localStorage.getItem(LAST_CHANNELS_KEY) || '[]');
        } catch {
          // Restricted storage should not block Twitch sign in.
        }

        const remoteFavorites = Array.isArray(cloudState?.favorite_streamers)
          ? cloudState.favorite_streamers
          : [];
        const mergedFavorites = [
          ...new Set([...remoteFavorites, ...localFavorites].map(cleanChannel).filter(Boolean)),
        ];

        const remoteLastChannels = Array.isArray(cloudState?.last_channels)
          ? cloudState.last_channels.map(cleanChannel).filter(Boolean).slice(0, accountViewerLimit)
          : [];
        const cleanedLocalLastChannels = Array.isArray(localLastChannels)
          ? localLastChannels.map(cleanChannel).filter(Boolean).slice(0, accountViewerLimit)
          : [];
        const syncedLastChannels = remoteLastChannels.length
          ? remoteLastChannels
          : cleanedLocalLastChannels;

        const syncedDefaultLayout = ['smart', 'dual', 'chat', 'solo'].includes(cloudState?.default_view)
          ? cloudState.default_view
          : 'smart';

        setFavoriteStreamers(mergedFavorites);
        setDefaultLayout(syncedDefaultLayout);
        if (syncedLastChannels.length) {
          setInputs(padViewerInputs(syncedLastChannels, accountViewerLimit));
        }

        try {
          localStorage.setItem(FAVORITE_STREAMERS_KEY, JSON.stringify(mergedFavorites));
          if (syncedLastChannels.length) {
            localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(syncedLastChannels));
          }
        } catch {
          // Cloud state remains usable even if local storage is unavailable.
        }

        await saveSquadViewUserState(user.id, {
          favorite_streamers: mergedFavorites,
          last_channels: syncedLastChannels,
          default_view: syncedDefaultLayout,
        });

        try {
          const growthSummary = await loadSquadViewReferralSummary();
          if (!cancelled) setReferralSummary(growthSummary);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.info('[SquadView Rewards] referral summary unavailable', error);
          }
        }

        if (!cancelled) accountHydratedUserRef.current = user.id;
      } catch (error) {
        if (!cancelled) {
          setAccountError(error?.message || 'Could not sync this SquadView account.');
        }
      } finally {
        if (!cancelled) setAccountReady(true);
      }
    }

    void hydrateAccount();
    return () => {
      cancelled = true;
    };
  }, [accountSession?.user?.id]);

  useEffect(() => {
    if (!showAccount || !accountSession?.user?.id || !accountReady) return;
    let cancelled = false;

    async function refreshAccountGrowthState() {
      try {
        const [summary, access] = await Promise.all([
          loadSquadViewReferralSummary(),
          loadSquadViewEntitlements(accountSession.user.id),
        ]);
        if (cancelled) return;
        setReferralSummary(summary);
        setEntitlements(access);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info('[SquadView Rewards] account refresh unavailable', error);
        }
      }
    }

    void refreshAccountGrowthState();
    return () => {
      cancelled = true;
    };
  }, [showAccount, accountReady, accountSession?.user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_FILL_FAVORITES_KEY, String(autoFillFavorites));
      localStorage.setItem(FAVORITE_LIVE_ALERTS_KEY, String(favoriteLiveAlertsEnabled));
      localStorage.setItem(FAVORITE_LIVE_ALERT_SOUND_KEY, String(favoriteLiveAlertSound));
    } catch {
      // Device-local preferences still work for this session when storage is restricted.
    }
  }, [autoFillFavorites, favoriteLiveAlertsEnabled, favoriteLiveAlertSound]);

  useEffect(() => {
    if (!favoriteLiveNotice) return undefined;
    const timeout = window.setTimeout(() => setFavoriteLiveNotice(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [favoriteLiveNotice]);

  useEffect(() => {
    if (screen !== 'viewer' || !accountReady || !accountSession?.user?.id) return;
    const pendingReferralCode = getPendingReferralCode();
    if (!pendingReferralCode) return;

    let cancelled = false;
    setReferralBusy(true);

    async function qualifyPendingReferral() {
      try {
        const result = await claimSquadViewReferral(pendingReferralCode);
        if (cancelled || !result?.available) return;

        if (result.status === 'qualified') {
          setReferralMessage('Invite credited. Thanks for joining SquadView through a shared view.');
          trackEvent('referral_qualified', {
            source: incomingReferralCode ? 'shared_view' : 'stored_referral',
          });
        }
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          console.info('[SquadView Rewards] referral claim unavailable', error);
        }
      } finally {
        if (!cancelled) setReferralBusy(false);
      }
    }

    void qualifyPendingReferral();
    return () => {
      cancelled = true;
    };
  }, [screen, accountReady, accountSession?.user?.id, incomingReferralCode]);

  useEffect(() => {
    const watchEligible =
      screen === 'viewer' &&
      accountReady &&
      !entitlements.isPremium &&
      channels.length >= 2 &&
      !referralPromoReady &&
      !referralPromoSuppressed;

    referralPromoLastTickRef.current = Date.now();
    if (!watchEligible) return undefined;

    const tickWatchTime = () => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(2000, now - referralPromoLastTickRef.current));
      referralPromoLastTickRef.current = now;

      if (document.visibilityState !== 'visible') return;
      referralPromoWatchMsRef.current += elapsed;

      if (referralPromoWatchMsRef.current >= REFERRAL_PROMO_WATCH_MS) {
        setReferralPromoReady(true);
        trackEvent('referral_promo_ready', {
          signed_in: Boolean(accountSession?.user?.id),
          stream_count_bucket: getStreamCountBucket(channels.length),
        });
      }
    };

    const handleVisibilityChange = () => {
      referralPromoLastTickRef.current = Date.now();
    };

    const interval = window.setInterval(tickWatchTime, 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    accountReady,
    accountSession?.user?.id,
    channels.length,
    entitlements.isPremium,
    referralPromoReady,
    referralPromoSuppressed,
    screen,
  ]);

  useEffect(() => {
    // Final mute/volume reconciliation lives here. Desktop Chat does not change
    // audioModeKey, activeChannel, or listeningChannels, so merely switching
    // chat targets never causes an audio rewrite.
    reconcileViewerAudio({}, { captureCurrent: true });
  }, [listeningChannels, audioEnabled, activeChannel, channels, iosSingleAudioMode, mobileSingleAudioMode, audioModeKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    window.__squadViewAudioDebug = () => ({
      activeChannel,
      listeningChannels: [...listeningChannels],
      audibleChannels: [...audibleChannels],
      audioEnabled,
      audioMode: audioModeKey,
      desiredAudioChannels: channels.filter((channel) => {
        const player = playersRef.current.get(channel);
        const displayed = Boolean(
          player?.__squadViewStateRef?.current?.visible ??
          player?.__squadViewState?.visible ??
          false
        );
        return displayed && audioPolicySelectsChannel(audioPolicyRef.current, channel);
      }),
      iosSingleAudioMode,
      mobileSingleAudioMode,
      isDesktopGrid,
      viewMode,
      desktopPage,
      desktopLeadChannel,
      channels: [...channels],
      players: typeof window.__squadViewPlayerDebug === 'function'
        ? window.__squadViewPlayerDebug()
        : [],
    });

    return () => {
      delete window.__squadViewAudioDebug;
    };
  }, [
    activeChannel,
    listeningChannels,
    audibleChannels,
    audioEnabled,
    audioModeKey,
    iosSingleAudioMode,
    mobileSingleAudioMode,
    isDesktopGrid,
    viewMode,
    desktopPage,
    desktopLeadChannel,
    channels,
  ]);

  useEffect(() => {
    if (!channels.length) {
      if (listeningChannels.size) setListeningChannels(new Set());
      if (audioEnabled) setAudioEnabled(false);
      return;
    }

    const allowed = new Set(channels);
    const allowedListening = [
      ...listeningChannels,
    ].filter((channel) => allowed.has(channel));
    const nextListening = new Set(
      mobileSingleAudioMode ? allowedListening.slice(0, 1) : allowedListening,
    );

    if (
      nextListening.size !== listeningChannels.size ||
      [...nextListening].some((channel) => !listeningChannels.has(channel))
    ) {
      setListeningChannels(nextListening);
    }

    const focusedChannelStillAvailable = channels.includes(activeChannel);

    if (!nextListening.size && !focusedChannelStillAvailable && audioEnabled) {
      setAudioEnabled(false);
    }
  }, [channels, listeningChannels, audioEnabled, activeChannel, mobileSingleAudioMode]);

  useEffect(() => {
    document.body.classList.toggle('viewer-active', screen === 'viewer');
    return () => document.body.classList.remove('viewer-active');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'viewer' || !sharedViewer?.channels?.length || sharedViewStartedRef.current) return;
    sharedViewStartedRef.current = true;
    trackEvent('shared_view_started', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
      referral_attached: Boolean(incomingReferralCode),
    });
  }, [screen, sharedViewer, incomingReferralCode]);

  // Preserve the active viewer layout across a browser refresh. Session storage
  // intentionally expires with the tab, so reopening SquadView later still
  // starts on the normal home screen.
  useEffect(() => {
    if (screen !== 'viewer' || !channels.length) return;

    try {
      sessionStorage.setItem(VIEWER_SESSION_KEY, JSON.stringify({
        channels,
        activeChannel: channels.includes(activeChannel) ? activeChannel : channels[0],
        viewMode,
        slotChannels,
        desktopPage,
        desktopLeadChannel,
        chatLayout,
      }));
    } catch {
      // Storage can be unavailable in private or restricted browsing contexts.
    }
  }, [screen, channels, activeChannel, viewMode, slotChannels, desktopPage, desktopLeadChannel, chatLayout]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)');
    const syncDesktopGrid = () => setIsDesktopGrid(media.matches);
    syncDesktopGrid();
    media.addEventListener?.('change', syncDesktopGrid);
    return () => media.removeEventListener?.('change', syncDesktopGrid);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const syncWideDesktopChat = () => setIsWideDesktopChat(media.matches);
    syncWideDesktopChat();
    media.addEventListener?.('change', syncWideDesktopChat);
    return () => media.removeEventListener?.('change', syncWideDesktopChat);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('squadview:chat-dock-side-v1', chatDockSide);
    } catch {
      // Chat docking still works for the current page when storage is blocked.
    }
  }, [chatDockSide]);

  useEffect(() => {
    const trackViewerExitOnPageLeave = () => {
      if (!viewerSessionActiveRef.current) return;
      viewerSessionActiveRef.current = false;
      trackEvent('viewer_exited', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        exit_method: 'page_leave',
      });
    };

    window.addEventListener('pagehide', trackViewerExitOnPageLeave);
    return () => window.removeEventListener('pagehide', trackViewerExitOnPageLeave);
  }, [channels.length]);


  useEffect(() => {
    setInputs((current) => padViewerInputs(current, viewerStreamLimit));

    setChannels((current) => {
      if (current.length <= viewerStreamLimit) return current;
      const trimmed = current.slice(0, viewerStreamLimit);
      setActiveChannel((active) => trimmed.includes(active) ? active : (trimmed[0] || ''));
      setSlotChannels((slots) => slots.filter((channel) => trimmed.includes(channel)).slice(0, 2));
      setDesktopPage(0);
      setDesktopLeadChannel(trimmed[0] || '');
      saveLastChannels(trimmed);
      return trimmed;
    });
  }, [viewerStreamLimit]);

  const validInputs = useMemo(
    () => [...new Set(inputs.map(cleanChannel).filter(Boolean))].slice(0, viewerStreamLimit),
    [inputs, viewerStreamLimit],
  );
  const manualBuilderInputCount = useMemo(() => {
    const availableInputs = inputs.slice(0, viewerStreamLimit);
    let lastFilledIndex = -1;

    availableInputs.forEach((value, index) => {
      if (String(value || '').trim()) lastFilledIndex = index;
    });

    // Keep the builder compact: one empty field is always visible, and typing
    // into the last visible field reveals exactly one more slot underneath.
    return Math.min(
      viewerStreamLimit,
      Math.max(1, lastFilledIndex + 2),
    );
  }, [inputs, viewerStreamLimit]);
  const shouldPreloadLoadingAd = screen === 'home'
    && accountReady
    && entitlements.squadViewAds
    && isLoadingAdConfigured()
    && (
      Boolean(pendingAdLaunch)
      || (
        shouldShowLoadingAd()
        && (validInputs.length > 0 || liveSavedSquadStreamers.size > 0)
      )
    );
  const followedLiveLogins = useMemo(
    () => new Set(followedLiveStreams.map((stream) => cleanChannel(stream.user_login)).filter(Boolean)),
    [followedLiveStreams],
  );
  const followedChannelLogins = useMemo(
    () => new Set(followedChannels.map((item) => cleanChannel(item.broadcaster_login)).filter(Boolean)),
    [followedChannels],
  );
  const knownLiveFavoriteLogins = useMemo(() => {
    const favoriteSet = new Set(favoriteStreamers.map(cleanChannel));
    const live = new Set();

    // Twitch Following Live is authoritative for positive live status. The
    // Favorites-only poll supplements that list for SquadView Favorites that
    // are not currently present in Twitch's followed-live response. Neither
    // source is allowed to hide a creator that the other source confirms live.
    followedLiveLogins.forEach((login) => {
      if (favoriteSet.has(login)) live.add(login);
    });
    liveFavoriteStreamers.forEach((login) => {
      const cleaned = cleanChannel(login);
      if (favoriteSet.has(cleaned)) live.add(cleaned);
    });

    return live;
  }, [favoriteStreamers, followedLiveLogins, liveFavoriteStreamers]);
  const sortedFavoriteStreamers = useMemo(
    () => [...favoriteStreamers].sort((first, second) => {
      const liveDifference =
        Number(knownLiveFavoriteLogins.has(second)) - Number(knownLiveFavoriteLogins.has(first));
      return liveDifference || first.localeCompare(second);
    }),
    [favoriteStreamers, knownLiveFavoriteLogins],
  );
  const liveFavoriteList = useMemo(
    () => sortedFavoriteStreamers.filter((streamer) => knownLiveFavoriteLogins.has(streamer)),
    [sortedFavoriteStreamers, knownLiveFavoriteLogins],
  );
  const savedSquadMemberLogins = useMemo(
    () => [...new Set(savedSquads.flatMap((squad) => squad.members.map((member) => member.twitchLogin)).filter(Boolean))],
    [savedSquads],
  );
  const activeSavedSquadCount = useMemo(
    () => savedSquads.filter((squad) => squad.members.some((member) => liveSavedSquadStreamers.has(member.twitchLogin))).length,
    [savedSquads, liveSavedSquadStreamers],
  );
  const orderedFollowedLiveStreams = useMemo(() => {
    const favoriteSet = new Set(favoriteStreamers.map(cleanChannel));
    const favoriteRank = new Map(
      favoriteStreamers.map((channel, index) => [cleanChannel(channel), index]),
    );
    const followedRank = new Map(
      followedLiveStreams.map((stream, index) => [cleanChannel(stream.user_login), index]),
    );
    const streamByLogin = new Map();

    // Never subtract from Twitch's followed-live result. If Twitch says a
    // followed creator is live, that card belongs in Live now even when the
    // separate Favorites-only status endpoint is still loading or disagrees.
    followedLiveStreams.forEach((stream) => {
      const login = cleanChannel(stream.user_login);
      if (!login) return;
      streamByLogin.set(login, stream);
    });

    // The Favorites-only poll is additive. It lets a SquadView Favorite appear
    // immediately even when they are not part of the current Twitch follow list
    // or they went live after the latest full Following snapshot.
    knownLiveFavoriteLogins.forEach((login) => {
      if (!favoriteSet.has(login) || streamByLogin.has(login)) return;
      const followed = followedChannels.find(
        (item) => cleanChannel(item.broadcaster_login) === login,
      );
      streamByLogin.set(login, {
        id: `favorite-live-${login}`,
        user_login: login,
        user_name: followed?.broadcaster_name || login,
        title: 'Favorite streamer is live now',
        game_name: 'Twitch',
        viewer_count: 0,
        thumbnail_url: '',
        squadviewFavoriteStatusOnly: true,
      });
    });

    return [...streamByLogin.values()].sort((first, second) => {
      const firstLogin = cleanChannel(first.user_login);
      const secondLogin = cleanChannel(second.user_login);
      const firstIsFavorite = favoriteSet.has(firstLogin);
      const secondIsFavorite = favoriteSet.has(secondLogin);

      // Live Favorites always stay inside Live now / Following Live and occupy
      // the first positions. Within that priority group keep the user's Favorite
      // order; everyone else keeps Twitch's
      // current live-list order.
      if (firstIsFavorite !== secondIsFavorite) return firstIsFavorite ? -1 : 1;
      if (firstIsFavorite && secondIsFavorite) {
        return (favoriteRank.get(firstLogin) ?? Number.MAX_SAFE_INTEGER)
          - (favoriteRank.get(secondLogin) ?? Number.MAX_SAFE_INTEGER);
      }

      return (followedRank.get(firstLogin) ?? Number.MAX_SAFE_INTEGER)
        - (followedRank.get(secondLogin) ?? Number.MAX_SAFE_INTEGER)
        || String(first.user_name || firstLogin).localeCompare(String(second.user_name || secondLogin));
    });
  }, [favoriteStreamers, followedChannels, followedLiveStreams, knownLiveFavoriteLogins]);
  const managerFollowedChannels = useMemo(() => {
    const query = managerSearch.trim().toLowerCase();
    const favoriteSet = new Set(favoriteStreamers.map(cleanChannel));
    const sorted = [...followedChannels].sort((first, second) => {
      const firstLogin = cleanChannel(first.broadcaster_login);
      const secondLogin = cleanChannel(second.broadcaster_login);
      const favoriteDifference =
        Number(favoriteSet.has(secondLogin)) - Number(favoriteSet.has(firstLogin));
      const liveDifference =
        Number(followedLiveLogins.has(secondLogin)) - Number(followedLiveLogins.has(firstLogin));
      return favoriteDifference || liveDifference ||
        String(first.broadcaster_name || firstLogin).localeCompare(String(second.broadcaster_name || secondLogin));
    });

    if (!query) return sorted;
    return sorted.filter((item) => {
      const login = cleanChannel(item.broadcaster_login);
      const name = String(item.broadcaster_name || '').toLowerCase();
      return login.includes(query) || name.includes(query);
    });
  }, [favoriteStreamers, followedChannels, followedLiveLogins, managerSearch]);

  const managerKnownLiveChannels = useMemo(() => {
    const live = new Set(managerLiveChannels);
    followedLiveLogins.forEach((channel) => live.add(channel));
    knownLiveFavoriteLogins.forEach((channel) => live.add(channel));
    // The mounted Twitch player is the freshest source for channels already in
    // the viewer. Let an explicit OFFLINE event override a stale Following Live
    // response, while ONLINE/PLAYING/PAUSED can confirm that the channel is live.
    viewerLiveStatusByChannel.forEach((status, channel) => {
      if (status === 'offline') live.delete(channel);
      if (status === 'live') live.add(channel);
    });
    return live;
  }, [managerLiveChannels, followedLiveLogins, knownLiveFavoriteLogins, viewerLiveStatusByChannel]);

  const managerOfflineChannels = useMemo(() => {
    const genericCheckReady = managerLiveStatus === 'ready';
    const followedStatusReady =
      followingStatus === 'ready' && followedChannelsStatus === 'ready';

    return managerDraftChannels.filter((channel) => {
      const viewerStatus = viewerLiveStatusByChannel.get(channel);
      if (viewerStatus === 'offline') return true;
      if (managerKnownLiveChannels.has(channel)) return false;
      if (genericCheckReady) return true;
      return followedStatusReady && followedChannelLogins.has(channel);
    });
  }, [
    managerDraftChannels,
    managerKnownLiveChannels,
    managerLiveStatus,
    followingStatus,
    followedChannelsStatus,
    followedChannelLogins,
    viewerLiveStatusByChannel,
  ]);

  const managerUnknownChannels = useMemo(() => {
    const offline = new Set(managerOfflineChannels);
    return managerDraftChannels.filter(
      (channel) => !managerKnownLiveChannels.has(channel) && !offline.has(channel),
    );
  }, [managerDraftChannels, managerKnownLiveChannels, managerOfflineChannels]);

  const managerAddedChannelCount = useMemo(() => {
    const original = new Set(managerOriginalChannelsRef.current);
    return managerDraftChannels.filter((channel) => !original.has(channel)).length;
  }, [managerDraftChannels]);

  const managerRetainedOriginalCount = useMemo(() => {
    const original = new Set(managerOriginalChannelsRef.current);
    return managerDraftChannels.filter((channel) => original.has(channel)).length;
  }, [managerDraftChannels]);

  const managerCommercialPending = Boolean(
    entitlements.squadViewAds
    && managerDraftChannels.length
    && (
      managerClearedAll
      || managerAddedChannelCount >= 4
      || (managerOriginalChannelsRef.current.length > 0 && managerRetainedOriginalCount === 0)
    ),
  );

  const editSquadCandidateChannels = useMemo(() => {
    const memberSet = new Set(editSquadMembers);
    const query = editSquadSearch.trim().toLowerCase();
    let candidates = [];

    if (editSquadSource === 'live') {
      candidates = orderedFollowedLiveStreams.map((stream) => ({
        login: cleanChannel(stream.user_login),
        name: stream.user_name || stream.user_login,
        meta: stream.game_name || 'Live on Twitch',
        live: true,
      }));
    } else if (editSquadSource === 'favorites') {
      candidates = favoriteStreamers.map((channel) => ({
        login: cleanChannel(channel),
        name: channel,
        meta: knownLiveFavoriteLogins.has(cleanChannel(channel)) ? 'Live now' : 'Favorite',
        live: knownLiveFavoriteLogins.has(cleanChannel(channel)),
      }));
    } else {
      candidates = followedChannels.map((item) => {
        const login = cleanChannel(item.broadcaster_login);
        return {
          login,
          name: item.broadcaster_name || login,
          meta: followedLiveLogins.has(login) ? 'Live now' : `@${login}`,
          live: followedLiveLogins.has(login),
        };
      });
    }

    return candidates
      .filter((item) => item.login && !memberSet.has(item.login))
      .filter((item) => !query || item.login.includes(query) || String(item.name || '').toLowerCase().includes(query))
      .sort((first, second) => Number(second.live) - Number(first.live) || String(first.name).localeCompare(String(second.name)))
      .slice(0, 80);
  }, [
    editSquadMembers,
    editSquadSearch,
    editSquadSource,
    favoriteStreamers,
    followedChannels,
    followedLiveLogins,
    followedLiveStreams,
    orderedFollowedLiveStreams,
    knownLiveFavoriteLogins,
  ]);

  const refreshSavedSquads = useCallback(async ({ silent = false } = {}) => {
    const userId = accountSession?.user?.id;
    if (!userId) {
      setSavedSquads([]);
      setSavedSquadsStatus('idle');
      setSavedSquadsError('');
      return;
    }

    if (!silent) setSavedSquadsStatus('loading');
    setSavedSquadsError('');

    try {
      const squads = await loadSavedSquads(userId);
      setSavedSquads(squads);
      setSavedSquadsStatus('ready');
    } catch (error) {
      setSavedSquads([]);
      setSavedSquadsStatus('error');
      setSavedSquadsError(error?.message || 'Could not load your Saved Squads.');
    }
  }, [accountSession?.user?.id]);

  useEffect(() => {
    if (!accountSession?.user?.id) return undefined;
    void refreshSavedSquads();
    return undefined;
  }, [accountSession?.user?.id, refreshSavedSquads]);

  useEffect(() => {
    if (!LIVE_STATUS_API_URL || !savedSquadMemberLogins.length) {
      setLiveSavedSquadStreamers(new Set());
      return undefined;
    }

    let cancelled = false;

    async function refreshSavedSquadLiveStatus() {
      try {
        const batches = [];
        for (let index = 0; index < savedSquadMemberLogins.length; index += 40) {
          batches.push(savedSquadMemberLogins.slice(index, index + 40));
        }

        const results = await Promise.all(batches.map(async (batch) => {
          const url = new URL(LIVE_STATUS_API_URL);
          batch.forEach((streamer) => url.searchParams.append('login', streamer));
          const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error(`Live status request failed with ${response.status}`);
          return response.json();
        }));

        if (cancelled) return;
        const live = results.flatMap((result) => Array.isArray(result?.live) ? result.live : [])
          .map(cleanChannel)
          .filter(Boolean);
        setLiveSavedSquadStreamers(new Set(live));
      } catch (error) {
        if (!cancelled) setLiveSavedSquadStreamers(new Set());
        if (import.meta.env.DEV) console.info('[SquadView saved squad live status] unavailable', error);
      }
    }

    void refreshSavedSquadLiveStatus();
    const interval = window.setInterval(refreshSavedSquadLiveStatus, 3 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [savedSquadMemberLogins]);

  useEffect(() => {
    if (!LIVE_STATUS_API_URL || !favoriteStreamers.length) {
      setLiveFavoriteStreamers(new Set());
      // The Twitch followed-live response can still provide Favorite priority
      // when the optional Favorites-only status endpoint is unavailable. Do not
      // leave the Following screen stuck waiting for a supplemental source.
      setFavoriteLiveStatusReady(true);
      return undefined;
    }

    let cancelled = false;
    let baselineReady = false;
    let previousLive = new Set();
    setFavoriteLiveStatusReady(false);

    async function refreshFavoriteLiveStatus() {
      if (document.visibilityState === 'hidden') return;

      try {
        const url = new URL(LIVE_STATUS_API_URL);
        favoriteStreamers.forEach((streamer) => url.searchParams.append('login', streamer));

        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error(`Live status request failed with ${response.status}`);

        const result = await response.json();
        if (cancelled) return;

        const live = Array.isArray(result?.live)
          ? result.live.map(cleanChannel).filter(Boolean)
          : [];
        const nextLive = new Set(live);

        if (baselineReady) {
          const newlyLive = live.filter((streamer) => !previousLive.has(streamer));
          if (
            newlyLive.length &&
            favoriteLiveAlertsEnabled &&
            document.visibilityState === 'visible'
          ) {
            setFavoriteLiveNotice({
              kind: 'favorite_live',
              channels: newlyLive,
              createdAt: Date.now(),
            });
            if (favoriteLiveAlertSound) playFavoriteLiveAlertTone();
          }
        }

        previousLive = nextLive;
        baselineReady = true;
        setLiveFavoriteStreamers(nextLive);
        setFavoriteLiveStatusReady(true);
      } catch (error) {
        if (!cancelled) setFavoriteLiveStatusReady(true);
        if (import.meta.env.DEV) {
          console.info('[SquadView live status] unavailable', error);
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshFavoriteLiveStatus();
    };

    void refreshFavoriteLiveStatus();
    const interval = window.setInterval(refreshFavoriteLiveStatus, FAVORITE_LIVE_POLL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [favoriteStreamers, favoriteLiveAlertsEnabled, favoriteLiveAlertSound]);

  // Only the streams that are actively in the viewer receive generic background
  // live checks. This keeps Following lightweight while still letting SquadView
  // clear a dead player even when that creator is not a Favorite.
  useEffect(() => {
    if (screen !== 'viewer' || !channels.length || !LIVE_STATUS_API_URL) return undefined;

    let cancelled = false;

    async function refreshViewerLiveStatus() {
      if (document.visibilityState === 'hidden') return;
      try {
        const targets = [...new Set(channels.map(cleanChannel).filter(Boolean))];
        const url = new URL(LIVE_STATUS_API_URL);
        targets.forEach((channel) => url.searchParams.append('login', channel));

        const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Live status request failed with ${response.status}`);
        const result = await response.json();
        if (cancelled) return;

        const live = new Set(
          Array.isArray(result?.live)
            ? result.live.map(cleanChannel).filter(Boolean)
            : [],
        );

        setViewerLiveStatusByChannel((current) => {
          const next = new Map(current);
          let changed = false;
          targets.forEach((channel) => {
            const status = live.has(channel) ? 'live' : 'offline';
            if (next.get(channel) !== status) {
              next.set(channel, status);
              changed = true;
            }
          });
          return changed ? next : current;
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info('[SquadView active viewer live status] unavailable', error);
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshViewerLiveStatus();
    };

    void refreshViewerLiveStatus();
    const interval = window.setInterval(refreshViewerLiveStatus, VIEWER_LIVE_POLL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen, channels]);

  function reconcileOpenSlotsWithLiveFavorites(roster, { excludedChannels = [] } = {}) {
    const normalizedRoster = [...new Set((roster || []).map(cleanChannel).filter(Boolean))]
      .slice(0, viewerStreamLimit);

    if (!autoFillFavorites || !favoriteLiveStatusReady || !knownLiveFavoriteLogins.size) {
      return normalizedRoster;
    }

    const selected = new Set(normalizedRoster);
    const excluded = new Set((excludedChannels || []).map(cleanChannel).filter(Boolean));
    const openSlots = Math.max(0, viewerStreamLimit - normalizedRoster.length);
    if (!openSlots) return normalizedRoster;

    const additions = favoriteStreamers
      .map(cleanChannel)
      .filter(Boolean)
      .filter((streamer) => knownLiveFavoriteLogins.has(streamer))
      .filter((streamer) => !selected.has(streamer))
      .filter((streamer) => !excluded.has(streamer))
      .filter((streamer) => !autoFillSuppressedFavoritesRef.current.has(streamer))
      .slice(0, openSlots);

    return additions.length ? [...normalizedRoster, ...additions] : normalizedRoster;
  }

  // A single OFFLINE signal is not enough to tear down a stream. Give Twitch a
  // short restart/grace window; any ONLINE/PLAYING update cancels this timer.
  useEffect(() => {
    if (screen !== 'viewer' || !channels.length) return undefined;
    const offlineChannels = channels.filter(
      (channel) => viewerLiveStatusByChannel.get(channel) === 'offline',
    );
    if (!offlineChannels.length) return undefined;

    const timer = window.setTimeout(() => {
      const offline = new Set(offlineChannels);
      const remainingChannels = channels.filter((channel) => !offline.has(channel));

      // An offline Favorite may still appear live in a stale Twitch snapshot.
      // Suppress that exact creator until the merged live sources clear them so
      // Auto-fill cannot immediately put the just-removed offline stream back.
      offlineChannels.forEach(suppressFavoriteAutoFill);

      // Natural offline removal creates a real vacancy. When Auto-fill is on,
      // use that vacancy immediately for another eligible live Favorite.
      const nextChannels = reconcileOpenSlotsWithLiveFavorites(remainingChannels, {
        excludedChannels: offlineChannels,
      });
      const autoFilledCount = Math.max(0, nextChannels.length - remainingChannels.length);

      trackEvent('viewer_offline_streams_auto_removed', {
        removed_count_bucket: getStreamCountBucket(offlineChannels.length),
        auto_fill_favorites: autoFillFavorites,
        auto_filled_count_bucket: getStreamCountBucket(autoFilledCount),
      });

      commitViewerChannels(nextChannels, {
        preferredActive: nextChannels.includes(activeChannel) ? activeChannel : nextChannels[0],
        preserveDesktopPage: true,
        preferredDesktopLead: nextChannels.includes(desktopLeadChannel) ? desktopLeadChannel : nextChannels[0],
        preserveAudioMix: true,
      });
    }, OFFLINE_REMOVAL_GRACE_MS);

    return () => window.clearTimeout(timer);
  }, [
    screen,
    channels,
    viewerLiveStatusByChannel,
    activeChannel,
    desktopLeadChannel,
    autoFillFavorites,
    favoriteLiveStatusReady,
    knownLiveFavoriteLogins,
    favoriteStreamers,
    viewerStreamLimit,
  ]);

  // Manual removals stay suppressed until every positive live source agrees the
  // creator is no longer live. This prevents a stale/missing supplemental status
  // response from immediately making a still-live Favorite eligible again.
  useEffect(() => {
    autoFillSuppressedFavoritesRef.current.forEach((streamer) => {
      if (!knownLiveFavoriteLogins.has(streamer)) {
        autoFillSuppressedFavoritesRef.current.delete(streamer);
      }
    });
  }, [knownLiveFavoriteLogins]);

  // Auto-fill is intentionally additive only. Reconcile against the merged live
  // Favorite set whenever the app loads, Twitch Following refreshes, Favorite
  // status refreshes, Auto-fill is enabled, or a slot opens. It can use any open
  // slot, but it never replaces a live stream the viewer chose. If the user
  // manually removes a Favorite, only that Favorite stays suppressed; a different
  // eligible live Favorite may still use the newly opened slot.
  useEffect(() => {
    if (!autoFillFavorites || !favoriteLiveStatusReady || !knownLiveFavoriteLogins.size) return;

    const eligible = favoriteStreamers.filter(
      (streamer) => knownLiveFavoriteLogins.has(streamer) && !autoFillSuppressedFavoritesRef.current.has(streamer),
    );
    if (!eligible.length) return;

    if (screen === 'viewer') {
      // Manage streams edits a draft roster. Keep Auto-fill active there too so
      // removing a non-Favorite (or a Favorite the user explicitly dismissed)
      // can offer the vacancy to the next eligible live Favorite before Done.
      if (showEdit) {
        if (managerClearedAll) return;
        const reconciledDraft = reconcileOpenSlotsWithLiveFavorites(managerDraftChannels);
        if (reconciledDraft.length === managerDraftChannels.length) return;
        const addedCount = reconciledDraft.length - managerDraftChannels.length;
        setManagerDraftChannels(reconciledDraft);
        trackEvent('favorite_auto_fill_applied', {
          source: 'manager',
          added_count_bucket: getStreamCountBucket(addedCount),
        });
        return;
      }

      const missing = eligible.filter((streamer) => !channels.includes(streamer));
      const openSlots = Math.max(0, viewerStreamLimit - channels.length);
      if (!missing.length || !openSlots) return;
      const additions = missing.slice(0, openSlots);
      commitViewerChannels([...channels, ...additions], {
        preserveDesktopPage: true,
        preferredDesktopLead: desktopLeadChannel,
        preserveAudioMix: true,
      });
      trackEvent('favorite_auto_fill_applied', {
        source: 'viewer',
        added_count_bucket: getStreamCountBucket(additions.length),
      });
      return;
    }

    if (screen === 'home') {
      setInputs((current) => {
        const selected = new Set(current.map(cleanChannel).filter(Boolean));
        const additions = eligible.filter((streamer) => !selected.has(streamer));
        if (!additions.length) return current;

        const next = [...current];
        let additionIndex = 0;
        for (let index = 0; index < next.length && additionIndex < additions.length; index += 1) {
          if (cleanChannel(next[index])) continue;
          next[index] = additions[additionIndex];
          additionIndex += 1;
        }
        return next;
      });
    }
  }, [
    autoFillFavorites,
    favoriteLiveStatusReady,
    knownLiveFavoriteLogins,
    favoriteStreamers,
    screen,
    channels,
    viewerStreamLimit,
    desktopLeadChannel,
    showEdit,
    managerDraftChannels,
    managerClearedAll,
  ]);

  useEffect(() => {
    if (!showEdit) return undefined;

    const targets = [...new Set(managerDraftChannels.map(cleanChannel).filter(Boolean))];

    if (!targets.length) {
      setManagerLiveChannels(new Set());
      setManagerLiveStatus('ready');
      return undefined;
    }

    if (!LIVE_STATUS_API_URL) {
      setManagerLiveChannels(new Set());
      setManagerLiveStatus('unavailable');
      return undefined;
    }

    let cancelled = false;
    setManagerLiveStatus('loading');

    async function refreshManagerLiveStatus() {
      try {
        const url = new URL(LIVE_STATUS_API_URL);
        targets.forEach((channel) => url.searchParams.append('login', channel));

        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error(`Live status request failed with ${response.status}`);

        const result = await response.json();
        if (cancelled) return;

        const live = Array.isArray(result?.live)
          ? result.live.map(cleanChannel).filter(Boolean)
          : [];

        setManagerLiveChannels(new Set(live));
        setManagerLiveStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setManagerLiveChannels(new Set());
        setManagerLiveStatus('unavailable');
        if (import.meta.env.DEV) {
          console.info('[SquadView stream manager live status] unavailable', error);
        }
      }
    }

    void refreshManagerLiveStatus();

    return () => {
      cancelled = true;
    };
  }, [showEdit, managerDraftChannels]);


  const refreshFollowedLiveStreams = useCallback(async ({ silent = false } = {}) => {
    if (!accountSession?.user?.id) {
      setFollowedLiveStreams([]);
      setFollowingStatus('idle');
      setFollowingError('');
      return;
    }

    if (!silent) setFollowingStatus('loading');
    setFollowingError('');

    try {
      const streams = await loadFollowedLiveStreams();
      setFollowedLiveStreams(streams);
      setFollowingStatus('ready');
    } catch (error) {
      const needsReconnect =
        error?.code === 'twitch_reconnect_required' ||
        error?.code === 'twitch_scope_required';
      setFollowedLiveStreams([]);
      setFollowingStatus(needsReconnect ? 'reconnect' : 'error');
      setFollowingError(error?.message || 'Could not load the Twitch channels you follow.');
    }
  }, [accountSession?.user?.id]);

  const refreshFollowedChannels = useCallback(async ({ force = false } = {}) => {
    if (!accountSession?.user?.id) {
      setFollowedChannels([]);
      setFollowedChannelsStatus('idle');
      setFollowedChannelsError('');
      return;
    }

    setFollowedChannelsStatus('loading');
    setFollowedChannelsError('');

    try {
      const follows = await loadFollowedChannels({ force });
      setFollowedChannels(follows);
      setFollowedChannelsStatus('ready');
    } catch (error) {
      const needsReconnect =
        error?.code === 'twitch_reconnect_required' ||
        error?.code === 'twitch_scope_required';
      setFollowedChannels([]);
      setFollowedChannelsStatus(needsReconnect ? 'reconnect' : 'error');
      setFollowedChannelsError(error?.message || 'Could not load your Twitch follows.');
    }
  }, [accountSession?.user?.id]);

  useEffect(() => {
    if (!accountSession?.user?.id) {
      setFollowedLiveStreams([]);
      setFollowingStatus('idle');
      setFollowingError('');
      setFollowedChannels([]);
      setFollowedChannelsStatus('idle');
      setFollowedChannelsError('');
      return;
    }

    // Take one full Following snapshot when Twitch connects. Background live
    // checks are reserved for Favorites; everyone else refreshes manually or
    // when the user returns to Following Live.
    void refreshFollowedLiveStreams();
  }, [accountSession?.user?.id, refreshFollowedLiveStreams]);

  useEffect(() => {
    if (!accountSession?.user?.id || landingTab !== 'following') return;
    void refreshFollowedLiveStreams({ silent: true });
  }, [accountSession?.user?.id, landingTab, refreshFollowedLiveStreams]);

  useEffect(() => {
    if (
      !accountSession?.user?.id ||
      landingTab !== 'following' ||
      followedChannelsStatus !== 'idle'
    ) {
      return;
    }
    void refreshFollowedChannels();
  }, [accountSession?.user?.id, landingTab, followedChannelsStatus, refreshFollowedChannels]);

  useEffect(() => {
    if (
      screen !== 'viewer' ||
      !accountSession?.user?.id ||
      followedChannelsStatus !== 'idle'
    ) {
      return;
    }

    void refreshFollowedChannels();
  }, [
    screen,
    accountSession?.user?.id,
    followedChannelsStatus,
    refreshFollowedChannels,
  ]);

  async function handleReconnectTwitchFollows() {
    setAuthBusy(true);
    setFollowingError('');
    try {
      await signInWithTwitch({ forceVerify: true });
    } catch (error) {
      setFollowingStatus('reconnect');
      setFollowingError(error?.message || 'Could not reconnect Twitch.');
      setAuthBusy(false);
    }
  }

  function addFollowedToGroup(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    setInputs((current) => {
      if (current.some((item) => cleanChannel(item) === cleaned)) return current;
      const emptyIndex = current.findIndex((item) => !cleanChannel(item));
      if (emptyIndex === -1) return current;
      return current.map((item, index) => index === emptyIndex ? cleaned : item);
    });
  }

  function dismissGuestBenefitsPrompt() {
    setShowGuestBenefits(false);
    try {
      sessionStorage.setItem(GUEST_BENEFITS_SESSION_KEY, '1');
    } catch {
      // A restricted browser can still continue as a guest.
    }
  }

  function handleBuilderInputChange(index, value) {
    setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));

    if (
      !String(value || '').trim() ||
      !accountReady ||
      accountSession?.user?.id ||
      guestBenefitsPromptedRef.current
    ) {
      return;
    }

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(GUEST_BENEFITS_SESSION_KEY) === '1';
    } catch {
      dismissed = false;
    }

    if (dismissed) return;
    guestBenefitsPromptedRef.current = true;
    setShowGuestBenefits(true);
  }

  function commitViewerStart(unique) {
    mountedPlayerChannelsRef.current = new Set();
    mobileWarmPlaybackHistoryRef.current = { key: '', current: [], previous: [] };

    setChannels(unique);
    setActiveChannel(unique[0]);
    setListeningChannels(new Set());
    // Desktop keeps its established lead-stream audio behavior. Mobile starts
    // fully muted so iOS/Android audio is claimed only by a real user gesture.
    // This avoids the first Twitch embed looking selected for audio even when
    // WebKit rejected its automatic unmute during startup.
    setAudioEnabled(isDesktopGrid ? Boolean(unique[0]) : false);
    const startWithGridChat = false;
    const initialViewMode = defaultLayout === 'smart'
      ? (startWithGridChat ? 'chat' : 'dual')
      : defaultLayout;
    const initialChatLayout = initialViewMode === 'chat'
      ? (isDesktopGrid && unique.length > 1 ? 'grid' : 'single')
      : 'single';
    setViewMode(initialViewMode);
    setSlotChannels(unique.slice(0, 2));
    setDesktopPage(0);
    setDesktopLeadChannel(unique[0]);
    setDesktopChatRotationChannels(unique.slice(1));
    setDesktopChatPinnedSlot(0);
    setChatLayout(initialChatLayout);
    saveLastChannels(unique);
    viewerSessionActiveRef.current = true;
    trackEvent('viewer_started', {
      stream_count_bucket: getStreamCountBucket(unique.length),
    });
    setScreen('viewer');
  }

  function shouldGateViewerWithAd() {
    // Do not guess a signed-in user's plan while entitlement hydration is still
    // in flight. Skipping an ad is preferable to accidentally serving one to a
    // Premium member.
    return accountReady
      && entitlements.squadViewAds
      && isLoadingAdConfigured()
      && shouldShowLoadingAd();
  }

  function queueLoadingAd(launch, { userGesture = false } = {}) {
    pendingAdLaunchRef.current = launch;
    setPendingAdLaunch(launch);

    if (userGesture) {
      // The home-screen VAST component is already mounted and has parsed the
      // sponsor response. Borrow this exact Start Squad click to initialize IMA
      // so mobile browsers do not require a second "Play sponsor" tap.
      const preparedStarted = loadingAdRef.current?.startPreparedAd?.(launch.source) === true;

      if (preparedStarted) {
        markLoadingAdShown();
        trackEvent('squadview_ad_break_queued', {
          provider: AD_CONFIG.vast.provider,
          source: launch.source,
          plan_key: entitlements.planKey,
          start_mode: 'prepared_gesture',
        });
        return true;
      }

      // If the SDK/tag was not ready in time, protect the viewing experience.
      // Do not make the user click again just to satisfy an ad player.
      pendingAdLaunchRef.current = null;
      setPendingAdLaunch(null);
      trackEvent('squadview_ad_preload_missed', {
        provider: AD_CONFIG.vast.provider,
        source: launch.source,
        plan_key: entitlements.planKey,
      });
      return false;
    }

    markLoadingAdShown();
    trackEvent('squadview_ad_break_queued', {
      provider: AD_CONFIG.vast.provider,
      source: launch.source,
      plan_key: entitlements.planKey,
      start_mode: 'standalone_autoplay',
    });
    setScreen('ad');
    return true;
  }

  function beginWatching(selected = validInputs, source = 'builder') {
    const unique = [...new Set(selected)].slice(0, viewerStreamLimit);
    if (!unique.length) return;

    if (shouldGateViewerWithAd()) {
      const adStarted = queueLoadingAd(
        { kind: 'channels', channels: unique, source },
        { userGesture: true },
      );
      if (adStarted) return;
    }

    commitViewerStart(unique);
  }

  function finishLoadingAd(result) {
    const launch = pendingAdLaunchRef.current || pendingAdLaunch;
    pendingAdLaunchRef.current = null;
    setPendingAdLaunch(null);

    trackEvent('squadview_ad_break_exited', {
      provider: AD_CONFIG.vast.provider,
      result,
      source: launch?.source || 'unknown',
      plan_key: entitlements.planKey,
    });

    if (launch?.kind === 'existing_viewer') {
      setScreen('viewer');
      return;
    }

    if (launch?.kind === 'manager_draft' && launch.channels?.length) {
      commitViewerChannels(launch.channels, {
        preserveDesktopPage: true,
        preferredDesktopLead: desktopLeadChannel,
        preserveAudioMix: true,
      });
      setScreen('viewer');
      return;
    }

    if (launch?.kind === 'channels' && launch.channels?.length) {
      commitViewerStart(launch.channels);
      return;
    }

    setScreen(channels.length ? 'viewer' : 'home');
  }


  // Volume state is stored with the Twitch player, but only the controller
  // above is allowed to write the final mute/volume state to the embed.
  function setStreamVolume(channel, value) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;

    // Preserve every other currently audible stream before changing one slider.
    snapshotAudioLevels(lastAppliedAudioPolicyRef.current || audioPolicyRef.current);

    const nextVolume = clampFocusedAudioVolume(value, 1);
    const player = playersRef.current.get(cleaned);

    if (cleaned === activeChannel) {
      focusedAudioVolumeRef.current = nextVolume;
      if (player) player.__squadViewPreferredVolume = nextVolume;
    } else if (player) {
      player.__squadViewManualVolume = nextVolume;
    }

    const canOwnAudio = audioPolicySelectsChannel(
      { ...audioPolicyRef.current, audioEnabled: true },
      cleaned,
    );
    const nextAudioEnabled = canOwnAudio ? true : audioEnabled;

    if (canOwnAudio && !audioEnabled) setAudioEnabled(true);

    reconcileViewerAudio(
      { audioEnabled: nextAudioEnabled },
      { captureCurrent: false },
    );
  }

  const handleViewerStreamStatusChange = useCallback((channel, nextStatus) => {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;

    const normalized = String(nextStatus || '').toLowerCase();
    let availability = '';

    if (normalized === 'offline') availability = 'offline';
    if (['live', 'playing', 'paused'].includes(normalized)) availability = 'live';
    if (!availability) return;

    setViewerLiveStatusByChannel((current) => {
      if (current.get(cleaned) === availability) return current;
      const next = new Map(current);
      next.set(cleaned, availability);
      return next;
    });
  }, []);

  function muteOtherMobilePlayers(nextOwner = '') {
    if (!mobileSingleAudioMode) return;
    playersRef.current.forEach((player, playerChannel) => {
      if (playerChannel === nextOwner) return;
      try {
        player?.setMuted?.(true);
        player?.setVolume?.(0);
      } catch {
        // Twitch may still be initializing. The central controller retries.
      }
    });
  }

  function claimMobileAudioFromGesture(channel, player, volume = 1) {
    if (!mobileSingleAudioMode || !player || player.__squadViewReady !== true) return false;
    const nextVolume = Math.max(0.01, clampFocusedAudioVolume(volume, 1));

    // Keep these calls inside the user's tap. iOS WebKit is substantially more
    // reliable when play + volume + unmute happen synchronously with the gesture
    // instead of arriving later from a React effect/READY callback.
    try {
      muteOtherMobilePlayers(channel);
      player.play?.();
      player.setVolume?.(nextVolume);
      player.setMuted?.(false);
      return true;
    } catch {
      return false;
    }
  }

  function listenToChannel(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || !channels.includes(cleaned)) return;

    if (viewMode === 'solo') {
      // Listen is a real toggle in Focus on both desktop and mobile. Mobile
      // claims audio directly from the user's tap; desktop keeps the established
      // controller path. In either case, the label is driven by real Twitch
      // mute/volume state, so Listening always means the embed is actually audible.
      if (cleaned !== activeChannel) return;

      const player = playersRef.current.get(cleaned);
      if (!player) return;
      if (mobileSingleAudioMode && player.__squadViewReady !== true) return;

      let actuallyAudible = audibleChannels.has(cleaned);
      try {
        const muted = player.getMuted?.();
        const volume = Number(player.getVolume?.());
        if (typeof muted === 'boolean' && Number.isFinite(volume)) {
          actuallyAudible = muted === false && volume > 0 && player.isPaused?.() !== true;
        }
      } catch {
        // Fall back to the live audible status already tracked by the viewer.
      }

      if (actuallyAudible) {
        focusedAudioVolumeRef.current = 0;
        player.__squadViewPreferredVolume = 0;
        try {
          player.setMuted?.(true);
          player.setVolume?.(0);
        } catch {}
        setAudioEnabled(false);
        reconcileViewerAudio({ audioEnabled: false, mode: 'solo' });
      } else if (mobileSingleAudioMode) {
        if (clampFocusedAudioVolume(focusedAudioVolumeRef.current, 0) <= 0) {
          focusedAudioVolumeRef.current = 1;
          player.__squadViewPreferredVolume = 1;
        }
        const claimed = claimMobileAudioFromGesture(cleaned, player, focusedAudioVolumeRef.current);
        setAudioEnabled(Boolean(claimed));
        reconcileViewerAudio({ audioEnabled: Boolean(claimed), activeChannel: cleaned, mode: 'solo' });
      } else {
        if (clampFocusedAudioVolume(focusedAudioVolumeRef.current, 0) <= 0) {
          focusedAudioVolumeRef.current = 1;
          player.__squadViewPreferredVolume = 1;
        }
        setAudioEnabled(true);
        const nextPolicy = reconcileViewerAudio({ audioEnabled: true, activeChannel: cleaned, mode: 'solo' });
        resumeAudioSelectedPlayers(nextPolicy);
      }
      return;
    }

    if (mobileSingleAudioMode) {
      const manualOwner = [...listeningChannels].find((candidate) => channels.includes(candidate)) || '';
      const currentOwner = audioEnabled ? (manualOwner || activeChannel) : '';

      // Listen is a true single-select toggle on mobile: tap a stream to make
      // it the sole audible owner, or tap the current owner again for silence.
      if (currentOwner === cleaned) {
        const currentPlayer = playersRef.current.get(cleaned);
        try {
          currentPlayer?.setMuted?.(true);
          currentPlayer?.setVolume?.(0);
        } catch {
          // The controller below still clears the audio owner.
        }
        const nextListening = new Set();
        setListeningChannels(nextListening);
        setAudioEnabled(false);
        reconcileViewerAudio({
          listeningChannels: nextListening,
          audioEnabled: false,
        });
        return;
      }

      const player = playersRef.current.get(cleaned);
      if (cleaned === activeChannel) {
        if (clampFocusedAudioVolume(focusedAudioVolumeRef.current, 1) <= 0) {
          focusedAudioVolumeRef.current = 1;
          if (player) player.__squadViewPreferredVolume = 1;
        }
      } else if (player && clampFocusedAudioVolume(player.__squadViewManualVolume, 1) <= 0) {
        player.__squadViewManualVolume = 1;
      }

      const nextListening = cleaned === activeChannel
        ? new Set()
        : new Set([cleaned]);

      const claimed = claimMobileAudioFromGesture(
        cleaned,
        player,
        cleaned === activeChannel
          ? focusedAudioVolumeRef.current
          : player?.__squadViewManualVolume ?? 1,
      );

      // Never record a fake Listening state. If iOS rejects the direct claim,
      // stay silent and leave the control as Listen so the next user tap can retry.
      if (!claimed) {
        const silentListening = new Set();
        setListeningChannels(silentListening);
        setAudioEnabled(false);
        reconcileViewerAudio({
          listeningChannels: silentListening,
          audioEnabled: false,
        });
        return;
      }

      setListeningChannels(nextListening);
      setAudioEnabled(true);

      const nextPolicy = reconcileViewerAudio({
        listeningChannels: nextListening,
        audioEnabled: true,
      });
      resumeAudioSelectedPlayers(nextPolicy);
      return;
    }

    if (cleaned === activeChannel) {
      const player = playersRef.current.get(cleaned);
      let actuallyAudible = audibleChannels.has(cleaned);
      try {
        const muted = player?.getMuted?.();
        const volume = Number(player?.getVolume?.());
        if (typeof muted === 'boolean' && Number.isFinite(volume)) {
          actuallyAudible = muted === false && volume > 0 && player?.isPaused?.() !== true;
        }
      } catch {
        // Fall back to the live audible status already tracked by the viewer.
      }

      // The active desktop stream used to be one-way: Listen could enable it,
      // but clicking Listening could not mute it. Treat it like every other
      // stream. A 0 focused volume deselects only this stream while preserving
      // any other desktop Listen selections.
      if (actuallyAudible) {
        focusedAudioVolumeRef.current = 0;
        if (player) player.__squadViewPreferredVolume = 0;
        try {
          player?.setMuted?.(true);
          player?.setVolume?.(0);
        } catch {}
        const hasOtherDesktopAudio = [...listeningChannels].some((candidate) =>
          candidate !== cleaned && channels.includes(candidate),
        );
        setAudioEnabled(hasOtherDesktopAudio);
        reconcileViewerAudio({ audioEnabled: hasOtherDesktopAudio });
        return;
      }

      if (clampFocusedAudioVolume(focusedAudioVolumeRef.current, 0) <= 0) {
        focusedAudioVolumeRef.current = 1;
        if (player) player.__squadViewPreferredVolume = 1;
      }
      setAudioEnabled(true);
      const nextPolicy = reconcileViewerAudio({ audioEnabled: true });
      resumeAudioSelectedPlayers(nextPolicy);
      return;
    }

    const nextListening = new Set(listeningChannels);
    const player = playersRef.current.get(cleaned);
    if (nextListening.has(cleaned)) {
      const currentVolume = clampFocusedAudioVolume(player?.__squadViewManualVolume, 1);
      if (currentVolume <= 0) {
        if (player) player.__squadViewManualVolume = 1;
      } else {
        nextListening.delete(cleaned);
      }
    } else {
      nextListening.add(cleaned);
      if (player && clampFocusedAudioVolume(player.__squadViewManualVolume, 1) <= 0) {
        player.__squadViewManualVolume = 1;
      }
    }

    setListeningChannels(nextListening);
    setAudioEnabled(true);

    const nextPolicy = reconcileViewerAudio({
      listeningChannels: nextListening,
      audioEnabled: true,
    });
    resumeAudioSelectedPlayers(nextPolicy);
  }

  function rotateOther(direction) {
    if (channels.length <= 2 || slotChannels.length < 2) return;

    const activeSlotIndex = slotChannels.indexOf(activeChannel);
    const replaceIndex = activeSlotIndex === 0 ? 1 : 0;
    const currentOther = slotChannels[replaceIndex];
    const candidates = channels.filter((channel) => channel !== activeChannel);
    const currentIndex = Math.max(0, candidates.indexOf(currentOther));
    const nextIndex = (currentIndex + direction + candidates.length) % candidates.length;
    const nextChannel = candidates[nextIndex];

    setSlotChannels((current) => current.map((channel, index) => index === replaceIndex ? nextChannel : channel));
  }

  function previousOther() {
    rotateOther(-1);
  }

  function nextOther() {
    rotateOther(1);
  }

  function openEditGroup(preferredSource = '') {
    // Opening the manager is an overlay, not a playback transition. Use this
    // explicit click to keep every currently visible Twitch embed playing.
    playersRef.current.forEach((player) => {
      const visible =
        player?.__squadViewStateRef?.current?.visible ??
        player?.__squadViewState?.visible ??
        false;
      if (!visible) return;
      try {
        if (player?.isPaused?.() === true) player.play?.();
      } catch {
        // Twitch controls remain available if the browser rejects play.
      }
    });

    const nextSource = preferredSource || (accountSession?.user?.id ? 'live' : 'favorites');
    const currentRoster = [...channels];
    managerOriginalChannelsRef.current = currentRoster;
    setManagerDraftChannels(currentRoster);
    setManagerClearedAll(false);
    setManagerLiveChannels(new Set());
    setManagerLiveStatus('idle');
    setManagerSource(nextSource);
    setManagerSearch('');
    setManualManagerChannel('');
    setPendingReplacement('');
    setDraggedManagerChannel('');
    setShowEdit(true);

    if (accountSession?.user?.id) {
      void refreshFollowedLiveStreams({ silent: true });
      if (nextSource === 'following' && followedChannelsStatus === 'idle') {
        void refreshFollowedChannels();
      }
    }
  }

  function submitManualManagerChannel(event) {
    event?.preventDefault?.();
    const cleaned = cleanChannel(manualManagerChannel);
    if (!cleaned) return;
    addChannelToManagerDraft(cleaned);
    setManualManagerChannel('');
  }


  function exitViewer(exitMethod = 'back_button') {
    try {
      sessionStorage.removeItem(VIEWER_SESSION_KEY);
    } catch {
      // Leaving the viewer should still work when storage is unavailable.
    }

    if (viewerSessionActiveRef.current) {
      viewerSessionActiveRef.current = false;
      trackEvent('viewer_exited', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        exit_method: exitMethod,
      });
    }
    setYoutubeCompanion(null);
    setShowYoutubeCompanion(false);
    setScreen('home');
  }

  function cycleFocused(direction) {
    if (channels.length <= 1) return;
    const currentIndex = Math.max(0, channels.indexOf(activeChannel));
    const nextIndex = (currentIndex + direction + channels.length) % channels.length;
    const nextChannel = channels[nextIndex];

    focusChannel(nextChannel);
  }

  function focusChannel(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || !channels.includes(cleaned)) return;

    if (viewMode === 'solo' && cleaned === activeChannel) {
      returnToDual();
      return;
    }

    // Preserve the exact pre-Focus audio context once. Cycling between focused
    // streams while already in Solo must not overwrite the return target.
    if (viewMode !== 'solo') {
      focusReturnAudioRef.current = {
        activeChannel,
        audioEnabled,
      };
    }

    const inheritedFocusedVolume = rememberFocusedAudioVolume(activeChannel);
    const nextFocusedPlayer = playersRef.current.get(cleaned);
    if (nextFocusedPlayer) {
      nextFocusedPlayer.__squadViewPreferredVolume = inheritedFocusedVolume;
    }
    focusedAudioVolumeRef.current = inheritedFocusedVolume;

    // Focus is the intentional temporary audio override: one stream, one audio
    // owner. listeningChannels stays untouched underneath so Grid can restore
    // the user's mix exactly when Focus closes. Desktop keeps the existing
    // automatic Focus audio behavior. Mobile only reports audio enabled if the
    // user's tap could claim a READY Twitch player; a never-visited stream stays
    // muted until its Listen control becomes ready for a second real gesture.
    let nextFocusAudioEnabled = true;
    if (!isDesktopGrid) {
      nextFocusAudioEnabled = claimMobileAudioFromGesture(
        cleaned,
        nextFocusedPlayer,
        inheritedFocusedVolume,
      );
    }

    setActiveChannel(cleaned);
    setAudioEnabled(nextFocusAudioEnabled);
    setChatChannel(cleaned);
    setChatLayout('single');
    setViewMode('solo');

    try {
      nextFocusedPlayer?.play?.();
    } catch {
      // Twitch native playback remains available if the browser rejects play.
    }

    reconcileViewerAudio({
      activeChannel: cleaned,
      audioEnabled: nextFocusAudioEnabled,
      mode: 'solo',
    });
  }

  function enterSolo(channel = activeChannel) {
    focusChannel(channel);
  }

  function toggleChatForChannel(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || !channels.includes(cleaned)) return;

    if (
      (viewMode === 'chat' && chatChannel === cleaned) ||
      (viewMode === 'solo' && activeChannel === cleaned)
    ) {
      returnToDual();
      return;
    }

    if (isDesktopGrid) {
      // Wide desktop keeps Chat in a dedicated side rail. When the viewport is
      // too narrow for that rail, Chat deliberately becomes the fourth grid
      // tile so the remaining streams stay large enough to watch comfortably.
      const threeStreamGridChat = !youtubeCompanion && channels.length === 3;
      const chatUsesGridTile = !isWideDesktopChat || threeStreamGridChat;
      const visibleLimit = youtubeCompanion
        ? (chatUsesGridTile ? 2 : 3)
        : (chatUsesGridTile ? 3 : 4);
      const currentGridLimit = youtubeCompanion ? 3 : 4;
      const currentVisible = viewMode === 'chat'
        ? getDesktopChatPageChannels(
            channels,
            channels.includes(chatChannel) ? chatChannel : cleaned,
            desktopChatPinnedSlot,
            desktopPage,
            visibleLimit,
            desktopChatRotationChannels,
          )
        : getDesktopPageChannels(
            channels,
            desktopLeadChannel,
            desktopPage,
            currentGridLimit,
          );
      const clickedSlot = Math.max(0, currentVisible.indexOf(cleaned));
      const nextPinnedSlot = Math.min(clickedSlot, visibleLimit - 1);
      const desiredPageOthers = currentVisible.filter((item) => item !== cleaned);
      const otherPerPage = Math.max(1, visibleLimit - 1);
      const pageStart = Math.max(0, desktopPage) * otherPerPage;
      const remainingRotation = channels.filter(
        (item) => item !== cleaned && !desiredPageOthers.includes(item),
      );
      const nextRotation = [...remainingRotation];
      nextRotation.splice(Math.min(pageStart, nextRotation.length), 0, ...desiredPageOthers);
      const nextVisibleChannels = getDesktopChatPageChannels(
        channels,
        cleaned,
        nextPinnedSlot,
        desktopPage,
        visibleLimit,
        nextRotation,
      );

      resumeViewerChannelsFromGesture(nextVisibleChannels);
      setDesktopChatRotationChannels(nextRotation);
      setDesktopChatPinnedSlot(nextPinnedSlot);
      setChatChannel(cleaned);
      setChatLayout('grid');
      setViewMode('chat');
      return;
    }

    // On mobile, Chat is effectively Focus + Chat. Enter the same focused
    // workspace so the selected stream fills the stage, chat is immediately
    // available, and the horizontal channel switcher stays on top.
    focusChannel(cleaned);
  }

  function enterChatMode() {
    toggleChatForChannel(chatChannel || activeChannel);
  }

  function returnToDual() {
    const leavingSolo = viewMode === 'solo';
    const returnAudio = leavingSolo ? focusReturnAudioRef.current : null;
    const restoredActive = returnAudio?.activeChannel && channels.includes(returnAudio.activeChannel)
      ? returnAudio.activeChannel
      : activeChannel;
    const restoredAudioEnabled = leavingSolo
      ? Boolean(returnAudio?.audioEnabled)
      : audioEnabled;

    const desktopResumeLimit = youtubeCompanion ? 3 : 4;
    const resumeChannels = isDesktopGrid
      ? getDesktopPageChannels(
          channels,
          desktopLeadChannel,
          desktopPage,
          desktopResumeLimit,
        )
      : youtubeCompanion
        ? [restoredActive].filter(Boolean)
        : (slotChannels.length ? slotChannels : channels.slice(0, 2));

    resumeChannels.forEach((channel) => {
      try {
        playersRef.current.get(channel)?.play?.();
      } catch {
        // Twitch's native controls remain available if the browser rejects play.
      }
    });

    if (leavingSolo) {
      const restoredPolicy = makeAudioPolicy({
        activeChannel: restoredActive,
        audioEnabled: restoredAudioEnabled,
        mode: 'mix',
      });

      // A manually listened stream may have been paused while Solo was active.
      // Resume selected streams under this explicit click before restoring their
      // volume so browser autoplay rules are not asked to create a new gesture.
      resumeAudioSelectedPlayers(restoredPolicy);
      reconcileViewerAudio(restoredPolicy, { captureCurrent: true });
      focusReturnAudioRef.current = null;
    }

    if (restoredActive !== activeChannel) setActiveChannel(restoredActive);
    if (restoredAudioEnabled !== audioEnabled) setAudioEnabled(restoredAudioEnabled);
    setViewMode('dual');
    setChatChannel('');
    setChatLayout('single');
    setSlotChannels((current) => current.includes(restoredActive)
      ? current
      : [restoredActive, channels.find((channel) => channel !== restoredActive)].filter(Boolean));
  }

  function saveFavoriteStreamers(nextStreamers) {
    const cleaned = [...new Set(nextStreamers.map(cleanChannel).filter(Boolean))];
    setFavoriteStreamers(cleaned);
    try {
      localStorage.setItem(FAVORITE_STREAMERS_KEY, JSON.stringify(cleaned));
    } catch {
      // Favorites can still sync to the signed-in account.
    }
    if (accountSession?.user?.id) {
      void saveSquadViewUserState(accountSession.user.id, {
        favorite_streamers: cleaned,
      }).catch((error) => {
        setAccountError(error?.message || 'Could not sync favorites.');
      });
    }
  }

  function saveLastChannels(nextChannels) {
    const cleaned = [...new Set(nextChannels.map(cleanChannel).filter(Boolean))].slice(0, viewerStreamLimit);
    try {
      localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify(cleaned));
    } catch {
      // The cloud copy can still be saved for signed-in users.
    }
    if (accountSession?.user?.id) {
      void saveSquadViewUserState(accountSession.user.id, {
        last_channels: cleaned,
      }).catch((error) => {
        setAccountError(error?.message || 'Could not sync the current stream group.');
      });
    }
  }

  function updateDefaultLayout(nextLayout) {
    if (!['smart', 'dual', 'chat', 'solo'].includes(nextLayout)) return;
    setDefaultLayout(nextLayout);
    if (accountSession?.user?.id) {
      void saveSquadViewUserState(accountSession.user.id, {
        default_view: nextLayout,
      }).catch((error) => {
        setAccountError(error?.message || 'Could not sync your default layout.');
      });
    }
  }

  async function handleTwitchSignIn() {
    setAuthBusy(true);
    setAccountError('');
    try {
      await signInWithTwitch();
    } catch (error) {
      setAccountError(error?.message || 'Twitch sign in could not be started.');
      setAuthBusy(false);
    }
  }

  function openSaveSquadModal(sourceChannels = validInputs) {
    const unique = [...new Set((sourceChannels || []).map(cleanChannel).filter(Boolean))].slice(0, entitlements.maxSquadMembers);
    if (!unique.length) return;
    if (!accountSession?.user?.id) {
      setShowAccount(true);
      return;
    }
    setSaveSquadChannels(unique);
    setSaveSquadName('');
    setSavedSquadsError('');
    setShowSaveSquad(true);
  }

  async function handleCreateSavedSquad(event) {
    event?.preventDefault?.();
    if (!accountSession?.user?.id || !saveSquadChannels.length) return;

    setSaveSquadBusy(true);
    setSavedSquadsError('');
    try {
      await createSavedSquad(accountSession.user.id, saveSquadName, saveSquadChannels);
      trackEvent('saved_squad_created', {
        plan_key: entitlements.planKey,
        member_count_bucket: getStreamCountBucket(saveSquadChannels.length),
      });
      setShowSaveSquad(false);
      setSaveSquadName('');
      setSaveSquadChannels([]);
      await refreshSavedSquads();
      setLandingTab('squads');
    } catch (error) {
      const message = String(error?.message || 'Could not save this Squad.');
      setSavedSquadsError(
        message.includes('saved_squad_limit_reached')
          ? 'Your Free plan can save up to 3 Squads. Premium removes the Saved Squad limit.'
          : message.includes('saved_squad_member_limit_reached')
            ? `This plan supports up to ${entitlements.maxSquadMembers} creators in a Saved Squad.`
            : message,
      );
    } finally {
      setSaveSquadBusy(false);
    }
  }

  async function handleDeleteSavedSquad(squadId) {
    if (!accountSession?.user?.id || !squadId) return;
    setSavedSquadsError('');
    try {
      await deleteSavedSquad(accountSession.user.id, squadId);
      setSavedSquads((current) => current.filter((squad) => squad.id !== squadId));
      trackEvent('saved_squad_deleted');
    } catch (error) {
      setSavedSquadsError(error?.message || 'Could not delete that Saved Squad.');
    }
  }

  function openSavedSquadEditor(squad) {
    if (!squad?.id) return;
    setEditingSavedSquad(squad);
    setEditSquadName(squad.name || 'My Squad');
    setEditSquadMembers(
      [...new Set((squad.members || []).map((member) => cleanChannel(member.twitchLogin)).filter(Boolean))],
    );
    setEditSquadSource('live');
    setEditSquadSearch('');
    setEditSquadManualChannel('');
    setEditSquadError('');
    setSavedSquadsError('');

    if (accountSession?.user?.id) {
      void refreshFollowedLiveStreams({ silent: true });
    }
  }

  function closeSavedSquadEditor() {
    if (editSquadBusy) return;
    setEditingSavedSquad(null);
    setEditSquadName('');
    setEditSquadMembers([]);
    setEditSquadSearch('');
    setEditSquadManualChannel('');
    setEditSquadError('');
  }

  function addSavedSquadEditorMember(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    if (editSquadMembers.includes(cleaned)) return;
    if (editSquadMembers.length >= entitlements.maxSquadMembers) {
      setEditSquadError(`Your ${entitlements.isPremium ? 'Premium' : 'Free'} plan supports up to ${entitlements.maxSquadMembers} creators in a Saved Squad.`);
      return;
    }
    setEditSquadMembers((current) => [...current, cleaned]);
    setEditSquadManualChannel('');
    setEditSquadError('');
  }

  function removeSavedSquadEditorMember(channel) {
    setEditSquadMembers((current) => current.filter((item) => item !== channel));
    setEditSquadError('');
  }

  async function handleUpdateSavedSquad(event) {
    event?.preventDefault?.();
    if (!accountSession?.user?.id || !editingSavedSquad?.id) return;
    if (!editSquadMembers.length) {
      setEditSquadError('A Saved Squad needs at least one Twitch creator.');
      return;
    }

    setEditSquadBusy(true);
    setEditSquadError('');
    try {
      await updateSavedSquad(
        accountSession.user.id,
        editingSavedSquad.id,
        editSquadName,
        editSquadMembers,
      );
      trackEvent('saved_squad_updated', {
        plan_key: entitlements.planKey,
        member_count_bucket: getStreamCountBucket(editSquadMembers.length),
      });
      await refreshSavedSquads();
      setEditingSavedSquad(null);
      setEditSquadName('');
      setEditSquadMembers([]);
      setEditSquadSearch('');
      setEditSquadManualChannel('');
    } catch (error) {
      const message = String(error?.message || 'Could not update that Saved Squad.');
      setEditSquadError(
        message.includes('saved_squad_member_limit_reached')
          ? `This plan supports up to ${entitlements.maxSquadMembers} creators in a Saved Squad.`
          : message.includes('saved_squad_not_found')
            ? 'That Saved Squad could not be found. Refresh SquadView and try again.'
            : message,
      );
    } finally {
      setEditSquadBusy(false);
    }
  }

  function watchSavedSquad(squad) {
    const memberLogins = squad?.members?.map((member) => member.twitchLogin).filter(Boolean) || [];
    if (!memberLogins.length) return;

    // Saved Squads are rosters, not forced viewer sessions. Only creators who
    // are live right now are automatically loaded into the active workspace.
    const liveMembers = memberLogins
      .filter((channel) => liveSavedSquadStreamers.has(channel))
      .slice(0, entitlements.viewerMaxStreams);

    if (!liveMembers.length) {
      setSavedSquadsError(`${squad.name} does not have anyone live right now.`);
      return;
    }

    setSavedSquadsError('');
    trackEvent('saved_squad_opened', {
      plan_key: entitlements.planKey,
      live_member_count_bucket: getStreamCountBucket(liveMembers.length),
      member_count_bucket: getStreamCountBucket(memberLogins.length),
    });
    beginWatching(liveMembers, 'saved_squad');
  }

  async function handleAccountSignOut() {
    setAuthBusy(true);
    setAccountError('');
    try {
      await signOutOfSquadView();
      setShowAccount(false);
    } catch (error) {
      setAccountError(error?.message || 'Could not sign out.');
    } finally {
      setAuthBusy(false);
    }
  }

  function toggleFavoriteStreamer(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;

    const alreadyFavorite = favoriteStreamers.includes(cleaned);
    if (!alreadyFavorite && favoriteStreamers.length >= favoriteStreamerLimit) {
      setFavoriteLiveNotice({
        kind: 'message',
        message: entitlements.isPremium
          ? `You can keep up to ${favoriteStreamerLimit} Favorite streamers on this plan.`
          : `Free SquadView includes ${favoriteStreamerLimit} Favorites. Remove one to add another.`,
        createdAt: Date.now(),
      });
      return;
    }

    // If someone is already present in Twitch's current Following Live result,
    // promote them into the Favorite-live set immediately. This keeps the card
    // visible and moves it to the top the instant the heart is pressed instead
    // of waiting for the next background Favorite status poll.
    setLiveFavoriteStreamers((current) => {
      const nextLive = new Set(current);
      if (alreadyFavorite) {
        nextLive.delete(cleaned);
      } else if (followedLiveLogins.has(cleaned)) {
        nextLive.add(cleaned);
      }
      return nextLive;
    });

    const next = alreadyFavorite
      ? favoriteStreamers.filter((item) => item !== cleaned)
      : [cleaned, ...favoriteStreamers];
    saveFavoriteStreamers(next);
  }

  function addFavoriteToGroup(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    setInputs((current) => {
      if (current.some((item) => cleanChannel(item) === cleaned)) return current;
      const emptyIndex = current.findIndex((item) => !cleanChannel(item));
      if (emptyIndex === -1) return current;
      return current.map((item, index) => index === emptyIndex ? cleaned : item);
    });
  }

  function removeFavoriteStreamer(channel) {
    saveFavoriteStreamers(favoriteStreamers.filter((item) => item !== channel));
  }

  function suppressFavoriteAutoFill(channel) {
    const cleaned = cleanChannel(channel);
    if (cleaned && favoriteStreamers.includes(cleaned)) {
      autoFillSuppressedFavoritesRef.current.add(cleaned);
    }
  }

  function removeFromBuildList(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    suppressFavoriteAutoFill(cleaned);
    setInputs((current) => compactViewerInputs(
      current.filter((item) => cleanChannel(item) !== cleaned),
      viewerStreamLimit,
    ));
  }

  function removeBuildInputAt(indexToRemove) {
    setInputs((current) => {
      suppressFavoriteAutoFill(current[indexToRemove]);
      return compactViewerInputs(
        current.filter((_, index) => index !== indexToRemove),
        viewerStreamLimit,
      );
    });
  }

  function clearAllBuildStreams() {
    validInputs.forEach(suppressFavoriteAutoFill);
    setInputs(padViewerInputs([], viewerStreamLimit));
    saveLastChannels([]);
  }

  function clearAllViewerStreams() {
    if (!managerDraftChannels.length) return;
    setShowClearAllConfirm(true);
  }

  function confirmClearAllViewerStreams() {
    const previousDraftCount = managerDraftChannels.length;
    managerDraftChannels.forEach(suppressFavoriteAutoFill);
    setShowClearAllConfirm(false);
    setManagerDraftChannels([]);
    setManagerClearedAll(true);
    setPendingReplacement('');
    trackEvent('stream_manager_clear_all_draft', {
      previous_stream_count_bucket: getStreamCountBucket(previousDraftCount),
    });
  }

  function removeOfflineManagerStreams() {
    if (!managerOfflineChannels.length) return;

    const offline = new Set(managerOfflineChannels);
    setManagerDraftChannels((current) => current.filter((channel) => !offline.has(channel)));
    setPendingReplacement('');
    trackEvent('stream_manager_remove_offline', {
      removed_count_bucket: getStreamCountBucket(managerOfflineChannels.length),
    });
  }

  function closeManageStreams() {
    setShowEdit(false);
    setShowClearAllConfirm(false);
    setPendingReplacement('');
    setDraggedManagerChannel('');
    setManagerDraftChannels([]);
    setManagerClearedAll(false);
    setManagerLiveChannels(new Set());
    setManagerLiveStatus('idle');
  }

  function finishManageStreams() {
    const nextChannels = [...new Set(managerDraftChannels.map(cleanChannel).filter(Boolean))]
      .slice(0, viewerStreamLimit);

    if (!nextChannels.length) return;

    const originalChannels = [...managerOriginalChannelsRef.current];
    const originalSet = new Set(originalChannels);
    const addedCount = nextChannels.filter((channel) => !originalSet.has(channel)).length;
    const retainedOriginalCount = nextChannels.filter((channel) => originalSet.has(channel)).length;
    const fullRebuild = Boolean(
      managerClearedAll
      || (originalChannels.length && retainedOriginalCount === 0),
    );
    const rosterChanged = nextChannels.length !== originalChannels.length
      || nextChannels.some((channel, index) => channel !== originalChannels[index]);
    originalChannels
      .filter((channel) => !nextChannels.includes(channel))
      .forEach(suppressFavoriteAutoFill);
    const shouldPlayCommercial = Boolean(
      rosterChanged
      && accountReady
      && entitlements.squadViewAds
      && isLoadingAdConfigured()
      && (fullRebuild || addedCount >= 4)
    );
    const adSource = fullRebuild ? 'manager_rebuild' : 'manager_bulk_add';

    setShowEdit(false);
    setShowClearAllConfirm(false);
    setPendingReplacement('');
    setDraggedManagerChannel('');
    setManagerDraftChannels([]);
    setManagerClearedAll(false);
    setManagerLiveChannels(new Set());
    setManagerLiveStatus('idle');

    if (!rosterChanged) return;

    trackEvent('stream_manager_changes_committed', {
      stream_count_bucket: getStreamCountBucket(nextChannels.length),
      added_count_bucket: getStreamCountBucket(addedCount),
      full_rebuild: fullRebuild,
      sponsor_break: shouldPlayCommercial,
    });

    if (shouldPlayCommercial) {
      queueLoadingAd({
        kind: 'manager_draft',
        channels: nextChannels,
        source: adSource,
      });
      return;
    }

    commitViewerChannels(nextChannels, {
      preserveDesktopPage: true,
      preferredDesktopLead: desktopLeadChannel,
      preserveAudioMix: true,
    });
  }

  function openLandingTab(tab) {
    setLandingTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function commitViewerChannels(
    nextChannels,
    {
      preferredActive = activeChannel,
      preserveDesktopPage = false,
      preferredDesktopLead = desktopLeadChannel,
      preserveAudioMix = false,
      keepManagerOpen = false,
    } = {},
  ) {
    const unique = [...new Set((nextChannels || []).map(cleanChannel).filter(Boolean))].slice(0, viewerStreamLimit);

    if (!unique.length) {
      reconcileViewerAudio({
        channels: [],
        activeChannel: '',
        listeningChannels: new Set(),
        audioEnabled: false,
        mode: 'dual',
      }, { captureCurrent: false });

      setChannels([]);
      setInputs(padViewerInputs([], viewerStreamLimit));
      setActiveChannel('');
      setChatChannel('');
      setListeningChannels(new Set());
      setAudibleChannels(new Set());
      setSlotChannels([]);
      setAudioEnabled(false);
      setDesktopPage(0);
      setDesktopLeadChannel('');
      setDesktopChatRotationChannels([]);
      setDesktopChatPinnedSlot(0);
      setViewMode('dual');
      setChatLayout('single');
      setPendingReplacement('');
      saveLastChannels([]);

      if (keepManagerOpen) {
        setShowEdit(true);
        return;
      }

      setShowEdit(false);
      exitViewer('last_stream_removed');
      return;
    }

    const requestedActive = cleanChannel(preferredActive);
    const nextActive = unique.includes(requestedActive) ? requestedActive : unique[0];

    if (activeChannel && nextActive !== activeChannel) {
      const inheritedFocusedVolume = rememberFocusedAudioVolume(activeChannel);
      const nextFocusedPlayer = playersRef.current.get(nextActive);

      if (nextFocusedPlayer) {
        nextFocusedPlayer.__squadViewPreferredVolume = inheritedFocusedVolume;
      }

      focusedAudioVolumeRef.current = inheritedFocusedVolume;
    }

    const retainedSlots = slotChannels.filter((channel) => unique.includes(channel));
    const nextSlots = [
      nextActive,
      ...retainedSlots.filter((channel) => channel !== nextActive),
      ...unique.filter((channel) => channel !== nextActive && !retainedSlots.includes(channel)),
    ].slice(0, 2);

    // Removing one Twitch tile must not tear down the remaining audio mix.
    // Snapshot current levels first, prune only the removed channel from Listen,
    // then immediately publish the next policy before React reflows the grid.
    let preservedAudioPolicy = null;
    if (preserveAudioMix) {
      snapshotAudioLevels(audioPolicyRef.current);
      const nextListening = new Set(
        [...listeningChannels].filter((channel) => unique.includes(channel)),
      );
      const nextAudioEnabled = Boolean(audioEnabled && (nextActive || nextListening.size));

      setListeningChannels(nextListening);
      setAudioEnabled(nextAudioEnabled);

      preservedAudioPolicy = {
        channels: [...unique],
        activeChannel: nextActive,
        listeningChannels: nextListening,
        audioEnabled: nextAudioEnabled,
        iosSingleAudioMode,
        mode: viewMode === 'solo' ? 'solo' : audioModeKey,
      };
      audioPolicyRef.current = preservedAudioPolicy;
      lastAppliedAudioPolicyRef.current = preservedAudioPolicy;
    }

    const nextChatChannel = unique.includes(chatChannel) ? chatChannel : nextActive;

    setChannels(unique);
    setInputs(padViewerInputs(unique, viewerStreamLimit));
    setActiveChannel(nextActive);
    setChatChannel(nextChatChannel);
    setDesktopChatRotationChannels(unique.filter((channel) => channel !== nextChatChannel));
    setSlotChannels(nextSlots);

    if (preservedAudioPolicy) {
      playersRef.current.forEach((player, channel) => {
        if (!unique.includes(channel)) return;
        applyAudioPolicyToPlayer(channel, player, preservedAudioPolicy);
      });
      resumeAudioSelectedPlayers(preservedAudioPolicy);
    }

    if (preserveDesktopPage && isDesktopGrid) {
      const desktopGridChat = viewMode === 'chat' && chatLayout === 'grid';
      const youtubeVisibleForPaging = Boolean(youtubeCompanion) && (viewMode === 'dual' || desktopGridChat);
      const visibleTwitchLimit = youtubeVisibleForPaging ? 3 : 4;
      const nextPageCount = desktopGridChat
        ? Math.max(1, Math.ceil(Math.max(0, unique.length - 1) / Math.max(1, visibleTwitchLimit - 1)))
        : Math.max(1, Math.ceil(unique.length / Math.max(1, visibleTwitchLimit)));
      const requestedLead = cleanChannel(preferredDesktopLead);
      const nextLead = unique.includes(requestedLead)
        ? requestedLead
        : nextActive || unique[0];

      // Removing a stream should not throw the viewer back to page one. Keep
      // the current page whenever it still exists; if the removal collapses
      // the final page, move only as far back as the new last valid page.
      setDesktopPage((current) => Math.min(current, nextPageCount - 1));
      setDesktopLeadChannel(nextLead);
    } else {
      setDesktopPage(0);
      setDesktopLeadChannel(unique[0]);
    }

    saveLastChannels(unique);

  }

  function removeChannelFromGroup(channelToRemove) {
    const cleaned = cleanChannel(channelToRemove);

    // A manual Favorite removal means "not this creator right now," not
    // "disable Auto-fill." Suppress only that Favorite, then allow another
    // eligible live Favorite to use the open slot. Non-Favorite removals can be
    // filled immediately as well when Auto-fill is enabled.
    suppressFavoriteAutoFill(cleaned);
    const remaining = channels.filter((channel) => channel !== cleaned);
    const nextChannels = reconcileOpenSlotsWithLiveFavorites(remaining, {
      excludedChannels: [cleaned],
    });

    const desktopGridChat = viewMode === 'chat' && isDesktopGrid && chatLayout === 'grid';
    const youtubeVisibleForPaging = Boolean(youtubeCompanion) && (viewMode === 'dual' || desktopGridChat);
    const visibleTwitchLimit = youtubeVisibleForPaging ? 3 : 4;
    const currentDesktopPageChannels = isDesktopGrid
      ? getDesktopPageChannels(channels, desktopLeadChannel, desktopPage, visibleTwitchLimit)
      : [];
    const remainingOnCurrentPage = currentDesktopPageChannels.filter(
      (channel) => channel !== cleaned && remaining.includes(channel),
    );
    const nextActive = cleaned === activeChannel
      ? remainingOnCurrentPage[0] || nextChannels[0]
      : activeChannel;
    const nextDesktopLead = cleaned === desktopLeadChannel
      ? remainingOnCurrentPage[0] || nextActive || nextChannels[0]
      : desktopLeadChannel;

    commitViewerChannels(nextChannels, {
      preferredActive: nextActive,
      preserveDesktopPage: true,
      preferredDesktopLead: nextDesktopLead,
      preserveAudioMix: true,
    });
  }

  function addChannelToViewer(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || channels.includes(cleaned)) return;

    if (channels.length >= viewerStreamLimit) {
      setPendingReplacement(cleaned);
      return;
    }

    commitViewerChannels([...channels, cleaned]);
  }

  function replaceChannelInViewer(channelToReplace, replacementChannel = pendingReplacement) {
    const oldChannel = cleanChannel(channelToReplace);
    const replacement = cleanChannel(replacementChannel);
    if (!oldChannel || !replacement || channels.includes(replacement)) return;

    const nextChannels = channels.map((channel) => channel === oldChannel ? replacement : channel);
    commitViewerChannels(nextChannels, {
      preferredActive: activeChannel === oldChannel ? replacement : activeChannel,
    });
    setPendingReplacement('');
  }

  function moveViewerChannel(channel, direction) {
    const cleaned = cleanChannel(channel);
    const currentIndex = channels.indexOf(cleaned);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= channels.length) return;

    const reordered = [...channels];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    commitViewerChannels(reordered);
  }

  function dropViewerChannel(targetChannel) {
    const dragged = cleanChannel(draggedManagerChannel);
    const target = cleanChannel(targetChannel);

    if (!dragged || !target || dragged === target) {
      setDraggedManagerChannel('');
      return;
    }

    const reordered = [...channels];
    const fromIndex = reordered.indexOf(dragged);
    const toIndex = reordered.indexOf(target);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedManagerChannel('');
      return;
    }

    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragged);
    commitViewerChannels(reordered);
    setDraggedManagerChannel('');
  }

  function removeChannelFromManagerDraft(channelToRemove) {
    const cleaned = cleanChannel(channelToRemove);
    if (!cleaned) return;
    suppressFavoriteAutoFill(cleaned);
    setManagerDraftChannels((current) => {
      const remaining = current.filter((channel) => channel !== cleaned);
      if (managerClearedAll) return remaining;
      return reconcileOpenSlotsWithLiveFavorites(remaining, { excludedChannels: [cleaned] });
    });
    if (pendingReplacement === cleaned) setPendingReplacement('');
  }

  function addChannelToManagerDraft(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned || managerDraftChannels.includes(cleaned)) return;

    if (managerDraftChannels.length >= viewerStreamLimit) {
      setPendingReplacement(cleaned);
      return;
    }

    setManagerDraftChannels((current) => [...current, cleaned]);
  }

  function replaceChannelInManagerDraft(channelToReplace, replacementChannel = pendingReplacement) {
    const oldChannel = cleanChannel(channelToReplace);
    const replacement = cleanChannel(replacementChannel);
    if (!oldChannel || !replacement || managerDraftChannels.includes(replacement)) return;

    setManagerDraftChannels((current) => current.map(
      (channel) => channel === oldChannel ? replacement : channel,
    ));
    setPendingReplacement('');
  }

  function moveManagerDraftChannel(channel, direction) {
    const cleaned = cleanChannel(channel);
    const currentIndex = managerDraftChannels.indexOf(cleaned);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= managerDraftChannels.length) return;

    const reordered = [...managerDraftChannels];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    setManagerDraftChannels(reordered);
  }

  function dropManagerDraftChannel(targetChannel) {
    const dragged = cleanChannel(draggedManagerChannel);
    const target = cleanChannel(targetChannel);

    if (!dragged || !target || dragged === target) {
      setDraggedManagerChannel('');
      return;
    }

    const reordered = [...managerDraftChannels];
    const fromIndex = reordered.indexOf(dragged);
    const toIndex = reordered.indexOf(target);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedManagerChannel('');
      return;
    }

    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragged);
    setManagerDraftChannels(reordered);
    setDraggedManagerChannel('');
  }

  function openYouTubeCompanion() {
    setShowYoutubeCompanion(true);
    trackEvent('youtube_companion_picker_opened', {
      plan_key: entitlements.planKey,
      replacing_existing: Boolean(youtubeCompanion),
    });
  }

  function selectYouTubeCompanion(video) {
    if (!video?.videoId) return;
    setYoutubeCompanion(video);
    setShowYoutubeCompanion(false);
    setViewMode('dual');
    setChatLayout('single');
    setDesktopLeadChannel(activeChannel);
    setDesktopPage(0);
    setAudioEnabled(false);
    trackEvent('youtube_companion_selected', {
      plan_key: entitlements.planKey,
    });
  }

  function removeYouTubeCompanion() {
    setYoutubeCompanion(null);
    setDesktopPage(0);
    trackEvent('youtube_companion_removed', {
      plan_key: entitlements.planKey,
    });
  }

  useEffect(() => {
    if (screen !== 'shared_pending' || !sharedViewer?.channels?.length || !accountReady) return;

    if (shouldGateViewerWithAd()) {
      queueLoadingAd({ kind: 'existing_viewer', source: 'shared_view' });
    } else {
      setScreen('viewer');
    }
  }, [accountReady, entitlements.squadViewAds, screen, sharedViewer]);

  function buildShareUrl() {
    const url = new URL('/watch', window.location.origin);
    url.searchParams.set('channels', channels.join(','));
    if (activeChannel && channels.includes(activeChannel)) {
      url.searchParams.set('active', activeChannel);
    }
    if (accountSession?.user?.id && referralSummary?.available && referralSummary.referralCode) {
      url.searchParams.set('ref', referralSummary.referralCode);
    }
    return url;
  }

  async function refreshReferralRewards() {
    if (!accountSession?.user?.id) return null;
    setReferralBusy(true);
    try {
      const [summary, access] = await Promise.all([
        loadSquadViewReferralSummary(),
        loadSquadViewEntitlements(accountSession.user.id),
      ]);
      setReferralSummary(summary);
      setEntitlements(access);
      return summary;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.info('[SquadView Rewards] share refresh unavailable', error);
      }
      return referralSummary;
    } finally {
      setReferralBusy(false);
    }
  }

  function openShareSquad() {
    if (!channels.length) return;
    setShareFeedback('');
    setShowShareSquad(true);
    trackEvent('share_opened', {
      stream_count_bucket: getStreamCountBucket(channels.length),
      signed_in: Boolean(accountSession?.user?.id),
    });
    trackEvent('shared_view_created', {
      stream_count_bucket: getStreamCountBucket(channels.length),
    });
    if (accountSession?.user?.id) void refreshReferralRewards();
  }

  function suppressReferralPromo(reason) {
    setReferralPromoReady(false);
    setReferralPromoSuppressed(true);
    try {
      localStorage.setItem(REFERRAL_PROMO_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Restricted storage should not block the viewer.
    }
    trackEvent('referral_promo_dismissed', {
      reason,
      signed_in: Boolean(accountSession?.user?.id),
      stream_count_bucket: getStreamCountBucket(channels.length),
    });
  }

  function handleReferralPromoAction() {
    trackEvent('referral_promo_cta_clicked', {
      signed_in: Boolean(accountSession?.user?.id),
      qualified_referrals: Math.max(0, Number(referralSummary?.qualifiedReferrals) || 0),
    });
    suppressReferralPromo(accountSession?.user?.id ? 'share_clicked' : 'signin_clicked');

    if (accountSession?.user?.id) {
      openShareSquad();
      return;
    }

    void handleTwitchSignIn();
  }

  async function copyShareLink() {
    if (!channels.length) return;
    const shareUrl = buildShareUrl().toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setShareFeedback('Squad link copied');
      trackEvent('share_link_copied', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        referral_attached: Boolean(referralSummary?.referralCode),
      });
    } catch {
      setShareFeedback('Could not copy automatically. Try Share Squad instead.');
    }
  }

  async function shareView() {
    if (!channels.length) return;

    const url = buildShareUrl();
    const payload = {
      title: 'SquadView',
      text: `Watch ${channels.length} Twitch ${channels.length === 1 ? 'stream' : 'streams'} together on SquadView`,
      url: url.toString(),
    };

    if (!navigator.share) {
      await copyShareLink();
      return;
    }

    try {
      await navigator.share(payload);
      setShareFeedback('Squad shared');
      trackEvent('share_native_completed', {
        stream_count_bucket: getStreamCountBucket(channels.length),
        referral_attached: Boolean(referralSummary?.referralCode),
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareFeedback('Share did not open. You can still copy the link.');
      }
    }
  }


  function renderFavoriteLiveNotice() {
    if (!favoriteLiveNotice) return null;
    const isLiveNotice = favoriteLiveNotice.kind === 'favorite_live';
    const channelsGoingLive = Array.isArray(favoriteLiveNotice.channels) ? favoriteLiveNotice.channels : [];
    const primaryChannel = channelsGoingLive[0] || '';
    const message = favoriteLiveNotice.kind === 'message'
      ? favoriteLiveNotice.message
      : channelsGoingLive.length > 1
        ? `${channelsGoingLive.length} Favorites just went live.`
        : `${primaryChannel} is live now.`;

    return (
      <div className="favorite-live-toast" role="status" aria-live="polite">
        <div>
          <span>{isLiveNotice ? 'Favorite live' : 'SquadView'}</span>
          <strong>{message}</strong>
          {isLiveNotice && autoFillFavorites && <small>Auto-fill will use an open slot without replacing a live stream.</small>}
        </div>
        {isLiveNotice && (
          <button type="button" onClick={() => {
            setFavoriteLiveNotice(null);
            if (screen === 'viewer') openEditGroup('live');
            else { setFollowingView('live'); openLandingTab('following'); }
          }}>
            {screen === 'viewer' ? 'Manage' : 'View'}
          </button>
        )}
        <button type="button" className="favorite-live-toast-dismiss" onClick={() => setFavoriteLiveNotice(null)} aria-label="Dismiss Favorite live alert">×</button>
      </div>
    );
  }

  if (screen === 'shared_pending') {
    return (
      <main className="loading-screen shared-loading-screen" aria-live="polite">
        <a className="loading-brand" href="/">SquadView</a>
        <section className="loading-card">
          <div className="loading-copy">
            <span>Shared SquadView</span>
            <h1>Preparing this shared view.</h1>
            <p>SquadView is checking this session before the streams open.</p>
          </div>
          <div className="shared-loading-pulse" aria-hidden="true" />
        </section>
      </main>
    );
  }

  if (screen === 'ad') {
    return (
      <VastLoadingAd
        source={pendingAdLaunch?.source || 'viewer_start'}
        onFinish={finishLoadingAd}
      />
    );
  }


  if (screen === 'viewer') {
    const dualChannels = slotChannels.length ? slotChannels : channels.slice(0, 2);

    // Desktop page order is anchored separately from activeChannel. In normal
    // Grid the saved desktop lead stays pinned. In Grid + Chat, the channel that
    // owns the open chat becomes the pinned Twitch tile while only the remaining
    // streams rotate as the user changes pages.
    const desktopGridChat = viewMode === 'chat' && isDesktopGrid && chatLayout === 'grid';
    const desktopSingleChat = viewMode === 'chat' && isDesktopGrid && !desktopGridChat;
    // Keep the Companion mounted across viewer modes. Desktop Grid + Chat
    // shows it as a pinned tile. On mobile, Dual becomes a deliberate two-panel
    // workspace: focused Twitch on top and YouTube Companion below. Entering
    // Chat temporarily hides/pauses YouTube and gives that lower panel to chat.
    const mobileYoutubeDual = Boolean(youtubeCompanion) && !isDesktopGrid && viewMode === 'dual';
    const youtubeVisible = Boolean(youtubeCompanion) && (viewMode === 'dual' || desktopGridChat);
    // Chat uses the fourth 2x2 quadrant in two cases: the viewport is too
    // narrow for a comfortable side rail, or exactly three Twitch streams are
    // selected. With three streams the fourth quadrant is already empty, so
    // keeping Chat there preserves the natural 2x2 composition instead of
    // squeezing all three streams sideways for an unnecessary rail.
    const narrowDesktopGridChat = desktopGridChat && !isWideDesktopChat;
    const threeStreamDesktopChat = desktopGridChat && !youtubeVisible && channels.length === 3;
    const desktopChatUsesGridTile = narrowDesktopGridChat || threeStreamDesktopChat;
    const showDesktopChatRail = isDesktopGrid && (
      viewMode === 'solo' ||
      (viewMode === 'chat' && !desktopChatUsesGridTile)
    );
    // Preserve the responsive capacity rule from Phase 1.1, then specialize the
    // wide three-stream case so the otherwise-empty fourth quadrant becomes Chat.
    const responsiveDesktopVisibleTwitchLimit = youtubeVisible
      ? (narrowDesktopGridChat ? 2 : 3)
      : (narrowDesktopGridChat ? 3 : 4);
    const desktopVisibleTwitchLimit = threeStreamDesktopChat
      ? 3
      : responsiveDesktopVisibleTwitchLimit;
    const desktopPageCount = desktopGridChat
      ? Math.max(1, Math.ceil(Math.max(0, channels.length - 1) / Math.max(1, desktopVisibleTwitchLimit - 1)))
      : Math.max(1, Math.ceil(channels.length / Math.max(1, desktopVisibleTwitchLimit)));
    const desktopPageForRender = Math.min(desktopPage, desktopPageCount - 1);
    const activeChatChannel = channels.includes(chatChannel) ? chatChannel : activeChannel;
    const desktopPinnedChannel = desktopGridChat
      ? activeChatChannel
      : desktopLeadChannel;
    const desktopChannels = desktopGridChat
      ? getDesktopChatPageChannels(
          channels,
          desktopPinnedChannel,
          desktopChatPinnedSlot,
          desktopPageForRender,
          desktopVisibleTwitchLimit,
          desktopChatRotationChannels,
        )
      : getDesktopPageChannels(
          channels,
          desktopPinnedChannel,
          desktopPageForRender,
          desktopVisibleTwitchLimit,
        );
    const visibleChannels = viewMode === 'dual'
      ? (isDesktopGrid
          ? desktopChannels
          : mobileYoutubeDual
            ? [activeChannel]
            : dualChannels)
      : viewMode === 'chat'
        ? (isDesktopGrid ? desktopChannels : [activeChatChannel])
        : [activeChannel];

    // iOS warm-resume cache: keep only the immediately previous mobile layout
    // decoding offscreen and muted. Twitch's iOS embed otherwise shows its
    // startup screen every time a scheduler-paused player is resumed. Android
    // stays on the existing pause/resume policy until we validate it separately.
    let mobileWarmPlaybackChannels = new Set();
    if (!isDesktopGrid && iosSingleAudioMode) {
      const nextKey = visibleChannels.join('|');
      const history = mobileWarmPlaybackHistoryRef.current;
      if (history.key !== nextKey) {
        history.previous = history.current.slice(0, 2);
        history.current = visibleChannels.slice(0, 2);
        history.key = nextKey;
      }
      mobileWarmPlaybackChannels = new Set(
        history.previous.filter(
          (channel) => channels.includes(channel) && !visibleChannels.includes(channel),
        ).slice(0, 2),
      );
    } else if (mobileWarmPlaybackHistoryRef.current.key) {
      mobileWarmPlaybackHistoryRef.current = { key: '', current: [], previous: [] };
    }

    // Only instantiate Twitch embeds as the user actually visits channels.
    // Previously visited channels remain mounted but receive visible={false},
    // which pauses them in TwitchPlayer until their page becomes active again.
    visibleChannels.forEach((channel) => {
      mountedPlayerChannelsRef.current.add(channel);
    });

    const mountedChannels = channels.filter((channel) =>
      mountedPlayerChannelsRef.current.has(channel),
    );

    const mobileManualAudioOwner = mobileSingleAudioMode
      ? [...listeningChannels][0] || ''
      : '';
    const selectedAudioOwner = mobileSingleAudioMode && audioEnabled
      ? (mobileManualAudioOwner || activeChannel)
      : '';

    const desktopTileCount = viewMode === 'solo'
      ? 1
      : visibleChannels.length + (youtubeVisible ? 1 : 0);

    // In the YouTube Companion desktop grid, slot 1 is always the pinned Twitch
    // lead/focused stream, slot 2 is always YouTube, and only slots 3-4 rotate
    // as the user pages through the remaining Twitch roster. Grid + Chat keeps
    // the fourth Twitch player alive behind chat. If the focused stream was in
    // quadrant four, swap it into quadrant three so the viewer can still see and
    // interact with the streamer whose chat they opened.
    const baseTwitchTileOrder = (channel) => {
      if (!isDesktopGrid || !visibleChannels.includes(channel)) return undefined;
      if (viewMode !== 'dual' && !desktopGridChat) return undefined;
      const visibleIndex = visibleChannels.indexOf(channel);
      if (youtubeVisible) return visibleIndex === 0 ? 1 : visibleIndex + 2;
      return visibleIndex + 1;
    };

    const twitchTileOrder = (channel) => baseTwitchTileOrder(channel);

    const twitchGridPosition = (channel) => {
      if (!desktopGridChat) return {};
      const tile = twitchTileOrder(channel);
      if (!Number.isFinite(tile)) return {};
      return {
        gridColumn: tile % 2 === 0 ? 2 : 1,
        gridRow: tile <= 2 ? 1 : 2,
        chatCovered: false,
      };
    };

    const referralPromoBlocked =
      viewMode !== 'dual' ||
      showEdit ||
      showShareSquad ||
      showAccount ||
      showSaveSquad ||
      Boolean(editingSavedSquad) ||
      showYoutubeCompanion ||
      showSharedArrival;

    const referralPromoVisible = Boolean(
      referralPromoReady &&
      !referralPromoSuppressed &&
      !entitlements.isPremium &&
      !referralPromoBlocked &&
      visibleChannels.length >= 2
    );
    const referralPromoCopy = getReferralPromoCopy(
      referralSummary,
      Boolean(accountSession?.user?.id),
    );
    const referralQualifiedCount = Math.max(0, Number(referralSummary?.qualifiedReferrals) || 0);
    const referralNextProgress = Math.max(0, Math.min(5, Number(referralSummary?.nextMonthProgress) || (referralQualifiedCount % 5)));

    const rotatingChannel = dualChannels.find((channel) => channel !== activeChannel) || dualChannels[1] || '';
    const desktopPagedMode = viewMode === 'dual' || desktopGridChat;
    const cycleForward = desktopPagedMode ? null : () => cycleFocused(1);
    const moveDesktopPage = (direction) => {
      if (desktopPageCount <= 1) return;
      rememberFocusedAudioVolume(activeChannel);

      const nextPage = (desktopPageForRender + direction + desktopPageCount) % desktopPageCount;
      const nextVisibleChannels = desktopGridChat
        ? getDesktopChatPageChannels(
            channels,
            desktopPinnedChannel,
            desktopChatPinnedSlot,
            nextPage,
            desktopVisibleTwitchLimit,
            desktopChatRotationChannels,
          )
        : getDesktopPageChannels(
            channels,
            desktopLeadChannel,
            nextPage,
            desktopVisibleTwitchLimit,
          );

      // Page arrows are explicit user gestures. Resume already-mounted incoming
      // embeds here; TwitchPlayer still owns the off-page pause policy after
      // the render completes.
      resumeViewerChannelsFromGesture(nextVisibleChannels);
      setDesktopPage(nextPage);
    };
    const previousDesktopPage = () => moveDesktopPage(-1);
    const nextDesktopPage = () => moveDesktopPage(1);

    return (
      <div className={`viewer-shell mode-${viewMode} chat-layout-${chatLayout} ${mobileYoutubeDual ? 'mobile-youtube-dual' : ''}`}>
        <header className="viewer-header">
          <button className="icon-button" onClick={() => exitViewer('back_button')} aria-label="Back"><ArrowLeft /></button>
          <div>
            <strong>SquadView</strong>
            <span>{viewMode === 'dual' ? (isDesktopGrid && channels.length > 2 ? 'Desktop grid' : 'Dual view') : viewMode === 'chat' ? (desktopGridChat ? 'Grid + chat' : 'Stream + chat') : 'Focused stream + chat'}</span>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className={`youtube-header-button ${youtubeCompanion ? 'has-companion' : ''}`}
              onClick={openYouTubeCompanion}
              title={youtubeCompanion ? 'Replace YouTube Companion' : 'Add one YouTube Companion video'}
            >
              <span aria-hidden="true">▶</span>
              <b>{youtubeCompanion ? 'YouTube added' : '+ YouTube'}</b>
            </button>
            <button className="edit-group-button" onClick={() => openEditGroup()}>Manage streams</button>
            <button className="icon-button" onClick={() => openSaveSquadModal(channels)} aria-label="Save current view as a Squad" title="Save Squad"><Save /></button>
            <button className="share-squad-button" onClick={openShareSquad} aria-label="Share this SquadView" title="Share Squad"><Share2 /><span className="share-label-full">Share Squad</span><span className="share-label-short">Share</span></button>
            <button
              className={`icon-button ${favoriteStreamers.includes(activeChannel) ? 'is-favorite' : ''}`}
              onClick={() => toggleFavoriteStreamer(activeChannel)}
              aria-label={favoriteStreamers.includes(activeChannel) ? `Remove ${activeChannel} from favorite streamers` : `Save ${activeChannel} as a favorite streamer`}
              title={favoriteStreamers.includes(activeChannel) ? 'Remove favorite streamer' : 'Save favorite streamer'}
            >
              {favoriteStreamers.includes(activeChannel) ? <FilledHeart /> : <Heart />}
            </button>
          </div>
        </header>

        <main className="viewer-content">
          <div className="viewer-workspace">
            <div className={`viewer-primary-layout ${showDesktopChatRail ? 'has-chat-rail' : ''} ${desktopChatUsesGridTile ? 'has-chat-grid-tile' : ''} chat-dock-${chatDockSide}`}>
              {isDesktopGrid && viewMode === 'solo' && channels.length > 1 && (
                <div className="focus-stream-selector" aria-label="Choose focused stream">
                  {channels.map((channel) => (
                    <button
                      type="button"
                      key={channel}
                      className={channel === activeChannel ? 'is-current' : ''}
                      onClick={() => channel !== activeChannel && focusChannel(channel)}
                      title={`Focus ${channel}`}
                    >
                      {favoriteStreamers.includes(channel) && <FilledHeart />}
                      <span>{channel}</span>
                    </button>
                  ))}
                </div>
              )}

              {!isDesktopGrid && viewMode === 'solo' && channels.length > 1 && (
                <div className="mobile-focus-stream-selector" aria-label="Choose focused stream">
                  {channels.map((channel) => (
                    <button
                      type="button"
                      key={channel}
                      className={channel === activeChannel ? 'is-current' : ''}
                      onClick={() => channel !== activeChannel && focusChannel(channel)}
                      title={`Focus ${channel}`}
                    >
                      <span className="mobile-focus-avatar" aria-hidden="true">
                        {channel.slice(0, 1).toUpperCase()}
                      </span>
                      {favoriteStreamers.includes(channel) && <FilledHeart />}
                      <span>{channel}</span>
                    </button>
                  ))}
                </div>
              )}
              <section className={`stream-stage mode-${viewMode} desktop-count-${desktopTileCount}`}>
              <div className="stream-stage-players">
                {mountedChannels.map((channel) => (
                  <TwitchPlayer
                    key={channel}
                    channel={channel}
                    visible={visibleChannels.includes(channel)}
                    visibleCount={Math.max(1, visibleChannels.length)}
                    active={activeChannel === channel}
                    highlightActive={
                      desktopGridChat
                        ? activeChatChannel === channel
                        : activeChannel === channel
                    }
                    focusActive={viewMode === 'solo' && activeChannel === channel}
                    audioSelected={
                      mobileSingleAudioMode
                        ? selectedAudioOwner === channel
                        : viewMode === 'solo'
                          ? activeChannel === channel
                          : activeChannel === channel || listeningChannels.has(channel)
                    }
                    audioEnabled={audioEnabled}
                    audioAudible={audibleChannels.has(channel)}
                    preserveAudibleSession={iosSingleAudioMode}
                    mobileSingleAudioMode={mobileSingleAudioMode}
                    keepPlaybackWarm={
                      iosSingleAudioMode &&
                      !visibleChannels.includes(channel) &&
                      mobileWarmPlaybackChannels.has(channel)
                    }
                    allowBackgroundAudio={false}
                    focusVolume={focusedAudioVolumeRef.current}
                    audioVolume={
                      activeChannel === channel
                        ? clampFocusedAudioVolume(focusedAudioVolumeRef.current, 1)
                        : clampFocusedAudioVolume(
                            playersRef.current.get(channel)?.__squadViewManualVolume,
                            1,
                          )
                    }
                    onVolumeChange={(value) => setStreamVolume(channel, value)}
                    onListen={() => listenToChannel(channel)}
                    onFocus={() => focusChannel(channel)}
                    onChat={() => toggleChatForChannel(channel)}
                    onAudioReconcile={reconcilePlayerAudio}
                    onLiveAudioStateChange={syncNativeTwitchAudioIntent}
                    onStreamStatusChange={handleViewerStreamStatusChange}
                    chatActive={
                      (viewMode === 'chat' && activeChatChannel === channel) ||
                      (viewMode === 'solo' && activeChannel === channel)
                    }
                    isTwitchFollowed={
                      followedLiveLogins.has(channel) ||
                      followedChannelLogins.has(channel)
                    }
                    isFavorite={favoriteStreamers.includes(channel)}
                    onToggleFavorite={() => toggleFavoriteStreamer(channel)}
                    onRemove={() => removeChannelFromGroup(channel)}
                    registerPlayer={registerPlayer}
                    tileOrder={twitchTileOrder(channel)}
                    gridColumn={twitchGridPosition(channel).gridColumn}
                    gridRow={twitchGridPosition(channel).gridRow}
                    chatCovered={twitchGridPosition(channel).chatCovered}
                  />
                ))}

                {desktopChatUsesGridTile && activeChatChannel && (
                  <section className="desktop-chat-grid-tile" aria-label={`Chat with ${activeChatChannel}`}>
                    <ChatPanel channel={activeChatChannel} mentionCandidates={channels} />
                  </section>
                )}

                {referralPromoVisible && (
                  <section
                    className="referral-promo-tile viewer-rewards-popover"
                    role="dialog"
                    aria-label="SquadView Premium referral rewards"
                  >
                    <button
                      type="button"
                      className="referral-promo-close"
                      onClick={() => suppressReferralPromo('closed')}
                      aria-label="Dismiss SquadView rewards"
                    >
                      ×
                    </button>

                    <div className="referral-promo-copy">
                      <span>{referralPromoCopy.eyebrow}</span>
                      <strong>{referralPromoCopy.title}</strong>
                      <p>{referralPromoCopy.body}</p>
                    </div>

                    {accountSession?.user?.id && referralSummary?.available && (
                      <div className="referral-promo-progress">
                        <div>
                          <span>Next free month</span>
                          <strong>{referralNextProgress}/5</strong>
                        </div>
                        <div className="referral-promo-progress-track" aria-hidden="true">
                          <span style={{ width: `${(referralNextProgress / 5) * 100}%` }} />
                        </div>
                        <div>
                          <span>Lifetime Premium</span>
                          <strong>{Math.min(referralQualifiedCount, 100)}/100</strong>
                        </div>
                      </div>
                    )}

                    <div className="referral-promo-benefits" aria-label="SquadView Premium benefits">
                      <span>No SquadView ads</span>
                      <span>Up to 16 Twitch streams</span>
                      <span>Unlimited Saved Squads</span>
                      <span>YouTube Companion</span>
                    </div>

                    <div className="referral-promo-actions">
                      <button type="button" className="primary-button" onClick={handleReferralPromoAction}>
                        {accountSession?.user?.id ? 'Share My Squad' : 'Sign in to earn Premium'}
                      </button>
                      <button type="button" className="referral-promo-later" onClick={() => suppressReferralPromo('maybe_later')}>
                        Maybe later
                      </button>
                    </div>
                  </section>
                )}

                {youtubeCompanion && (
                  <YouTubeCompanion
                    video={youtubeCompanion}
                    visible={youtubeVisible}
                    isPremium={entitlements.isPremium}
                    onReplace={openYouTubeCompanion}
                    onRemove={removeYouTubeCompanion}
                    tileOrder={youtubeVisible && isDesktopGrid ? 2 : undefined}
                  />
                )}

                {isDesktopGrid && viewMode === 'dual' && channels.length < viewerStreamLimit && visibleChannels.length < (youtubeVisible ? 3 : 4) && (
                  <button
                    type="button"
                    className="stream-add-tile"
                    onClick={() => openEditGroup(accountSession?.user?.id ? 'live' : 'favorites')}
                  >
                    <span>+</span>
                    <strong>Add a stream</strong>
                    <small>
                      {accountSession?.user?.id && orderedFollowedLiveStreams.length
                        ? `${orderedFollowedLiveStreams.length} people you follow are live`
                        : accountSession?.user?.id
                          ? 'Choose from Twitch follows or favorites'
                          : 'Choose from favorites or enter a channel'}
                    </small>
                  </button>
                )}


                {!isDesktopGrid && activeChannel && (
                  <section
                    className={`mobile-chat-tile persistent-mobile-chat ${viewMode === 'chat' || viewMode === 'solo' ? 'is-active' : 'is-parked'}`}
                    aria-hidden={viewMode !== 'chat' && viewMode !== 'solo'}
                  >
                    <ChatPanel channel={activeChatChannel} mentionCandidates={channels} />
                  </section>
                )}
              </div>
              </section>

              {showDesktopChatRail && (activeChatChannel || activeChannel) && (
                <aside className="desktop-chat-rail" aria-label="Twitch chat">
                  {isWideDesktopChat && (
                    <div className="desktop-chat-dock-toolbar">
                      <span>Chat position</span>
                      <button
                        type="button"
                        onClick={() => setChatDockSide((side) => side === 'right' ? 'left' : 'right')}
                        aria-label={chatDockSide === 'right' ? 'Move chat to the left side' : 'Move chat to the right side'}
                        title={chatDockSide === 'right' ? 'Dock chat left' : 'Dock chat right'}
                      >
                        {chatDockSide === 'right' ? '← Dock left' : 'Dock right →'}
                      </button>
                    </div>
                  )}
                  <ChatPanel channel={viewMode === 'chat' ? activeChatChannel : activeChannel} mentionCandidates={channels} />
                </aside>
              )}
            </div>

            {!isDesktopGrid && mobileYoutubeDual && channels.length > 1 && (
              <div className="mobile-stream-pager youtube-mobile-stream-pager" aria-label="Change the Twitch stream above YouTube">
                <button onClick={() => cycleFocused(-1)} aria-label="Previous Twitch stream">←</button>
                <div>
                  <span>Focused Twitch</span>
                  <strong>{channels.indexOf(activeChannel) + 1} of {channels.length}</strong>
                </div>
                <button onClick={() => cycleFocused(1)} aria-label="Next Twitch stream">→</button>
              </div>
            )}

            {!isDesktopGrid && !mobileYoutubeDual && viewMode === 'dual' && channels.length === 2 && dualChannels.length > 1 && (
              <div className="mix-controls" aria-label="Change the secondary stream">
                <button onClick={previousOther} aria-label="Previous secondary stream">←</button>
                <div>
                  <span>Rotate the other stream</span>
                  <strong>{rotatingChannel}</strong>
                </div>
                <button onClick={nextOther} aria-label="Next secondary stream">→</button>
              </div>
            )}

            {!isDesktopGrid && channels.length > 2 && !mobileYoutubeDual && viewMode !== 'solo' && (
              <div className="mobile-stream-pager" aria-label="Move through streams">
                <button
                  onClick={viewMode === 'dual' ? previousOther : () => cycleFocused(-1)}
                  aria-label="Previous stream"
                >
                  ←
                </button>
                <div>
                  <span>{viewMode === 'dual' ? 'Other stream' : viewMode === 'chat' ? 'Stream + chat' : 'Focused stream'}</span>
                  <strong>
                    {viewMode === 'dual'
                      ? `${channels.indexOf(rotatingChannel) + 1} of ${channels.length}`
                      : `${channels.indexOf(activeChannel) + 1} of ${channels.length}`}
                  </strong>
                </div>
                <button
                  onClick={viewMode === 'dual' ? nextOther : () => cycleFocused(1)}
                  aria-label="Next stream"
                >
                  →
                </button>
              </div>
            )}

            {!isDesktopGrid && channels.length === 2 && viewMode === 'chat' && (
              <div className="focus-carousel" aria-label="Move through selected streams">
                <button onClick={() => cycleFocused(-1)} aria-label="Previous stream">←</button>
                <div>
                  <span>{viewMode === 'chat' ? 'Stream + chat' : 'Focused stream'}</span>
                  <strong>{activeChannel}</strong>
                </div>
                <button onClick={() => cycleFocused(1)} aria-label="Next stream">→</button>
              </div>
            )}

            {isDesktopGrid && viewMode === 'chat' && chatLayout === 'single' && channels.length > 1 && (
              <div className="desktop-stream-pager" aria-label="Move through streams in chat view">
                <button onClick={() => cycleFocused(-1)} aria-label="Previous stream">←</button>
                <div>
                  <span>Stream + chat</span>
                  <strong>{channels.indexOf(activeChannel) + 1} of {channels.length}</strong>
                </div>
                <button onClick={() => cycleFocused(1)} aria-label="Next stream">→</button>
              </div>
            )}
          </div>

          <nav className={`viewer-toolbar ${isDesktopGrid && desktopPageCount > 1 && desktopPagedMode ? 'has-page-controls' : ''}`}>
            <button className={viewMode === 'dual' ? 'is-current' : ''} onClick={returnToDual}>▦ {isDesktopGrid ? 'Grid' : 'Dual'}</button>
            {isDesktopGrid && desktopPageCount > 1 && desktopPagedMode && (
              <div className="toolbar-page-controls" aria-label="Change visible stream page">
                <button type="button" onClick={previousDesktopPage} aria-label="Previous stream page">←</button>
                <span>Page {desktopPageForRender + 1} of {desktopPageCount}</span>
                <button type="button" onClick={nextDesktopPage} aria-label="Next stream page">→</button>
              </div>
            )}

            {isDesktopGrid && (
              <button
                onClick={desktopPagedMode ? nextDesktopPage : cycleForward}
                disabled={desktopPagedMode ? desktopPageCount <= 1 : channels.length <= 1}
              >
                Next →
              </button>
            )}
          </nav>
        </main>

        {showEdit && (
          <div className="stream-manager-backdrop" onClick={closeManageStreams}>
            <aside className="stream-manager-drawer" onClick={(event) => event.stopPropagation()}>
              <header className="stream-manager-header">
                <div>
                  <span>Current SquadView</span>
                  <h2>Manage streams</h2>
                  <p>Build your next lineup here. Your current viewer stays unchanged until you choose Done.</p>
                </div>
                <button className="stream-manager-close" onClick={closeManageStreams} aria-label="Close stream manager"><X /></button>
              </header>

              <section className="stream-manager-current">
                <div className="stream-manager-section-heading">
                  <div>
                    <strong>In this view</strong>
                    <small>Drag on desktop or use the arrows to reorder.</small>
                  </div>
                  <b>{managerDraftChannels.length}/{viewerStreamLimit}</b>
                </div>

                <div className="stream-manager-current-list">
                  {!managerDraftChannels.length && (
                    <div className="stream-manager-current-empty">
                      <span>Fresh lineup</span>
                      <strong>No streams selected</strong>
                      <p>Choose streams on the right to rebuild this SquadView. Add at least one stream to continue.</p>
                    </div>
                  )}

                  {managerDraftChannels.map((channel, index) => (
                    <article
                      key={channel}
                      className={`stream-manager-current-row ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''} ${managerKnownLiveChannels.has(channel) ? 'is-live' : ''} ${draggedManagerChannel === channel ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={() => setDraggedManagerChannel(channel)}
                      onDragEnd={() => setDraggedManagerChannel('')}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropManagerDraftChannel(channel)}
                    >
                      <button
                        type="button"
                        className="stream-manager-drag"
                        aria-label={`Drag ${channel} to reorder`}
                        title="Drag to reorder"
                      >
                        ≡
                      </button>
                      <div className="stream-manager-channel-copy">
                        <strong>{channel}</strong>
                        <small>
                          {managerKnownLiveChannels.has(channel) && <><i className="live-dot" aria-hidden="true" /> Live now</>}
                          {!managerKnownLiveChannels.has(channel) && managerOfflineChannels.includes(channel) && 'Offline'}
                          {!managerKnownLiveChannels.has(channel) && !managerOfflineChannels.includes(channel) && 'Live status unknown'}
                        </small>
                      </div>
                      <div className="stream-manager-row-actions">
                        <button
                          type="button"
                          className={`stream-manager-favorite-toggle ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''}`}
                          onClick={() => toggleFavoriteStreamer(channel)}
                          aria-label={favoriteStreamers.includes(channel) ? `Remove ${channel} from Favorites` : `Favorite ${channel}`}
                          title={favoriteStreamers.includes(channel) ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                          {favoriteStreamers.includes(channel) ? <FilledHeart /> : <Heart />}
                        </button>
                        <div className="stream-manager-order-buttons">
                          <button type="button" onClick={() => moveManagerDraftChannel(channel, -1)} disabled={index === 0} aria-label={`Move ${channel} earlier`}>↑</button>
                          <button type="button" onClick={() => moveManagerDraftChannel(channel, 1)} disabled={index === managerDraftChannels.length - 1} aria-label={`Move ${channel} later`}>↓</button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="stream-manager-remove"
                        onClick={() => removeChannelFromManagerDraft(channel)}
                        aria-label={`Remove ${channel}`}
                      >
                        <X />
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="stream-manager-add">
                <div className="stream-manager-section-heading">
                  <div>
                    <strong>Add a stream</strong>
                    <small>{managerDraftChannels.length < viewerStreamLimit ? `${viewerStreamLimit - managerDraftChannels.length} open spot${viewerStreamLimit - managerDraftChannels.length === 1 ? '' : 's'}` : 'View full. Choose someone to replace.'}</small>
                  </div>
                </div>

                <label className="automation-toggle stream-manager-automation-toggle">
                  <span>
                    <strong>Auto-fill live Favorites</strong>
                    <small>Fill open slots when a Favorite is live. Existing live streams are never replaced.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoFillFavorites}
                    onChange={(event) => setAutoFillFavorites(event.target.checked)}
                  />
                  <i aria-hidden="true" />
                </label>

                <div className="stream-manager-tabs" role="tablist" aria-label="Choose a stream source">
                  <button type="button" className={managerSource === 'live' ? 'is-current' : ''} onClick={() => setManagerSource('live')}>
                    Following Live
                    {orderedFollowedLiveStreams.length > 0 && <span>{orderedFollowedLiveStreams.length}</span>}
                  </button>
                  <button type="button" className={managerSource === 'favorites' ? 'is-current' : ''} onClick={() => setManagerSource('favorites')}>Favorites</button>
                  <button type="button" className={managerSource === 'following' ? 'is-current' : ''} onClick={() => {
                    setManagerSource('following');
                    if (accountSession?.user?.id && followedChannelsStatus === 'idle') void refreshFollowedChannels();
                  }}>Following</button>
                  <button type="button" className={managerSource === 'manual' ? 'is-current' : ''} onClick={() => setManagerSource('manual')}>Add channel</button>
                </div>

                <div className="stream-manager-source-panel">
                  {managerSource === 'live' && (
                    !accountSession ? (
                      <div className="stream-manager-empty">
                        <strong>Sign in with Twitch to see who is live</strong>
                        <p>Your Twitch follows stay separate from SquadView Favorites.</p>
                        <button className="twitch-login-button" onClick={() => { setShowEdit(false); setShowAccount(true); }}>Sign in with Twitch</button>
                      </div>
                    ) : followingStatus === 'reconnect' ? (
                      <div className="stream-manager-empty">
                        <strong>Reconnect Twitch follows</strong>
                        <p>{followingError}</p>
                        <button className="twitch-login-button" onClick={handleReconnectTwitchFollows} disabled={authBusy}>
                          {authBusy ? 'Opening Twitch…' : 'Reconnect Twitch'}
                        </button>
                      </div>
                    ) : followingStatus === 'loading' ? (
                      <div className="stream-manager-empty compact"><strong>Checking who is live…</strong></div>
                    ) : orderedFollowedLiveStreams.length ? (
                      <div className="stream-manager-source-list">
                        {orderedFollowedLiveStreams.map((stream) => {
                          const channel = cleanChannel(stream.user_login);
                          const alreadyAdded = managerDraftChannels.includes(channel);
                          return (
                            <article key={stream.id || channel} className={`stream-manager-source-row is-live ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''}`}>
                              <div>
                                <strong>{stream.user_name || channel}</strong>
                                <small><i className="live-dot" aria-hidden="true" /> @{channel} · {stream.game_name || 'Twitch'}</small>
                              </div>
                              <div className="stream-manager-source-actions">
                                <button
                                  type="button"
                                  className={`stream-manager-favorite-toggle ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''}`}
                                  onClick={() => toggleFavoriteStreamer(channel)}
                                  aria-label={favoriteStreamers.includes(channel) ? `Remove ${channel} from Favorites` : `Favorite ${channel}`}
                                  title={favoriteStreamers.includes(channel) ? 'Remove from Favorites' : 'Add to Favorites'}
                                >
                                  {favoriteStreamers.includes(channel) ? <FilledHeart /> : <Heart />}
                                </button>
                                <button type="button" className="stream-manager-add-button" onClick={() => addChannelToManagerDraft(channel)} disabled={alreadyAdded}>
                                  {alreadyAdded ? 'Added ✓' : managerDraftChannels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="stream-manager-empty compact">
                        <strong>No followed channels are live right now</strong>
                        <p>Try Favorites, Following, or enter any Twitch channel. Use the heart to favorite creators from here.</p>
                      </div>
                    )
                  )}

                  {managerSource === 'favorites' && (
                    sortedFavoriteStreamers.length ? (
                      <div className="stream-manager-source-list">
                        {sortedFavoriteStreamers.map((channel) => {
                          const alreadyAdded = managerDraftChannels.includes(channel);
                          const isLive = knownLiveFavoriteLogins.has(channel);
                          return (
                            <article key={channel} className={`stream-manager-source-row is-favorite ${isLive ? 'is-live' : ''}`}>
                              <div>
                                <strong>{channel}</strong>
                                <small>{isLive ? <><i className="live-dot" aria-hidden="true" /> Live now</> : 'SquadView favorite'}</small>
                              </div>
                              <div className="stream-manager-source-actions">
                                <button
                                  type="button"
                                  className="stream-manager-favorite-toggle is-favorite"
                                  onClick={() => toggleFavoriteStreamer(channel)}
                                  aria-label={`Remove ${channel} from Favorites`}
                                  title="Remove from Favorites"
                                >
                                  <FilledHeart />
                                </button>
                                <button type="button" className="stream-manager-add-button" onClick={() => addChannelToManagerDraft(channel)} disabled={alreadyAdded}>
                                  {alreadyAdded ? 'Added ✓' : managerDraftChannels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="stream-manager-empty compact">
                        <strong>No favorites yet</strong>
                        <p>Heart a streamer while watching and they will appear here.</p>
                      </div>
                    )
                  )}

                  {managerSource === 'following' && (
                    !accountSession ? (
                      <div className="stream-manager-empty">
                        <strong>Sign in with Twitch to browse your follows</strong>
                        <button className="twitch-login-button" onClick={() => { setShowEdit(false); setShowAccount(true); }}>Sign in with Twitch</button>
                      </div>
                    ) : followedChannelsStatus === 'reconnect' ? (
                      <div className="stream-manager-empty">
                        <strong>Reconnect Twitch follows</strong>
                        <p>{followedChannelsError}</p>
                        <button className="twitch-login-button" onClick={handleReconnectTwitchFollows}>Reconnect Twitch</button>
                      </div>
                    ) : followedChannelsStatus === 'loading' ? (
                      <div className="stream-manager-empty compact"><strong>Loading your Twitch follows…</strong></div>
                    ) : followedChannelsStatus === 'error' ? (
                      <div className="stream-manager-empty">
                        <strong>Could not load Twitch follows</strong>
                        <p>{followedChannelsError}</p>
                        <button className="secondary-button" onClick={() => void refreshFollowedChannels({ force: true })}>Try again</button>
                      </div>
                    ) : (
                      <>
                        <div className="stream-manager-search">
                          <input
                            value={managerSearch}
                            onChange={(event) => setManagerSearch(event.target.value)}
                            placeholder="Search people you follow"
                            autoCapitalize="none"
                            autoCorrect="off"
                          />
                          <span>{followedChannels.length} following</span>
                        </div>
                        <div className="stream-manager-source-list">
                          {managerFollowedChannels.map((item) => {
                            const channel = cleanChannel(item.broadcaster_login);
                            const alreadyAdded = managerDraftChannels.includes(channel);
                            const isLive = followedLiveLogins.has(channel);
                            return (
                              <article key={item.broadcaster_id || channel} className={`stream-manager-source-row ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''} ${isLive ? 'is-live' : ''}`}>
                                <div>
                                  <strong>{item.broadcaster_name || channel}</strong>
                                  <small>{isLive ? <><i className="live-dot" aria-hidden="true" /> @{channel} · Live now</> : `@${channel}`}</small>
                                </div>
                                <div className="stream-manager-source-actions">
                                  <button
                                    type="button"
                                    className={`stream-manager-favorite-toggle ${favoriteStreamers.includes(channel) ? 'is-favorite' : ''}`}
                                    onClick={() => toggleFavoriteStreamer(channel)}
                                    aria-label={favoriteStreamers.includes(channel) ? `Remove ${channel} from Favorites` : `Favorite ${channel}`}
                                    title={favoriteStreamers.includes(channel) ? 'Remove from Favorites' : 'Add to Favorites'}
                                  >
                                    {favoriteStreamers.includes(channel) ? <FilledHeart /> : <Heart />}
                                  </button>
                                  <button type="button" className="stream-manager-add-button" onClick={() => addChannelToManagerDraft(channel)} disabled={alreadyAdded}>
                                    {alreadyAdded ? 'Added ✓' : managerDraftChannels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                        {!managerFollowedChannels.length && (
                          <div className="stream-manager-empty compact"><strong>No matching followed channels</strong></div>
                        )}
                      </>
                    )
                  )}

                  {managerSource === 'manual' && (
                    <form className="stream-manager-manual" onSubmit={submitManualManagerChannel}>
                      <label htmlFor="manager-channel-input">Twitch username</label>
                      <div>
                        <input
                          id="manager-channel-input"
                          value={manualManagerChannel}
                          onChange={(event) => setManualManagerChannel(event.target.value)}
                          placeholder="e.g. streamername"
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                        <button className="primary-button" type="submit" disabled={!cleanChannel(manualManagerChannel)}>
                          {managerDraftChannels.length >= viewerStreamLimit ? 'Choose replacement' : '+ Add stream'}
                        </button>
                      </div>
                      <small>You can add any Twitch channel even if you do not follow or favorite them.</small>
                    </form>
                  )}
                </div>
              </section>

              {pendingReplacement && (
                <div className="stream-manager-replace-card">
                  <div>
                    <span>View full</span>
                    <strong>Add {pendingReplacement}</strong>
                    <p>Choose which current stream you want to replace.</p>
                  </div>
                  <div className="stream-manager-replace-list">
                    {managerDraftChannels.map((channel) => (
                      <button type="button" key={channel} onClick={() => replaceChannelInManagerDraft(channel)}>
                        <span>{channel}</span>
                        <strong>Replace →</strong>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setPendingReplacement('')}>Cancel replacement</button>
                </div>
              )}

              <footer className="stream-manager-footer">
                <div>
                  <span>{managerDraftChannels.length}/{viewerStreamLimit} streams</span>
                  <small>
                    {!managerDraftChannels.length
                      ? 'Add at least one stream to continue.'
                      : managerCommercialPending
                        ? 'Done plays a short sponsor, then applies your updated view.'
                        : 'Changes apply when you choose Done.'}
                  </small>
                </div>
                <div className="stream-manager-footer-actions">
                  <button
                    type="button"
                    className="secondary-button stream-manager-remove-offline"
                    onClick={removeOfflineManagerStreams}
                    disabled={!managerOfflineChannels.length}
                  >
                    {managerOfflineChannels.length
                      ? `Remove offline · ${managerOfflineChannels.length}`
                      : managerUnknownChannels.length
                        ? 'No confirmed offline'
                        : 'All live'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button stream-manager-clear-all"
                    onClick={clearAllViewerStreams}
                    disabled={!managerDraftChannels.length}
                  >
                    Clear all
                  </button>
                  <button
                    className="primary-button"
                    onClick={finishManageStreams}
                    disabled={!managerDraftChannels.length}
                  >
                    Done
                  </button>
                </div>
              </footer>
            </aside>
          </div>
        )}

        {showClearAllConfirm && (
          <div
            className="modal-backdrop clear-all-confirm-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowClearAllConfirm(false);
              }
            }}
          >
            <section
              className="modal clear-all-confirm-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-all-confirm-title"
            >
              <button
                type="button"
                className="modal-close clear-all-confirm-close"
                onClick={() => setShowClearAllConfirm(false)}
                aria-label="Close clear all confirmation"
              >
                <X />
              </button>

              <span className="modal-eyebrow">Current SquadView</span>

              <div
                className="clear-all-confirm-mark"
                aria-hidden="true"
              >
                !
              </div>

              <h2 id="clear-all-confirm-title">
                Clear all streams?
              </h2>

              <p>
                This will clear all {managerDraftChannels.length}{' '}
                {managerDraftChannels.length === 1 ? 'stream' : 'streams'} from this Manage Streams draft. Your current viewer will not change until you choose Done.
              </p>

              <div className="clear-all-confirm-note">
                Your Twitch follows and SquadView favorites will not be changed. You can rebuild the lineup here before applying anything.
              </div>

              <div className="clear-all-confirm-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowClearAllConfirm(false)}
                >
                  Keep streams
                </button>

                <button
                  type="button"
                  className="clear-all-confirm-primary"
                  onClick={confirmClearAllViewerStreams}
                >
                  Clear all
                </button>
              </div>
            </section>
          </div>
        )}

        {showShareSquad && (
          <div
            className="modal-backdrop share-squad-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowShareSquad(false);
            }}
          >
            <section className="modal share-squad-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="share-squad-title">
              <button className="modal-close" onClick={() => setShowShareSquad(false)}><X /></button>
              <span className="modal-eyebrow">Share this viewing setup</span>
              <h2 id="share-squad-title">Share this SquadView</h2>
              <p>Send this exact lineup of {channels.length} Twitch {channels.length === 1 ? 'stream' : 'streams'} to somebody else. They can open it with the streams already loaded.</p>

              <div className="share-squad-preview" aria-label="Streams in this shared view">
                {channels.slice(0, 8).map((channel) => <span key={channel}>@{channel}</span>)}
                {channels.length > 8 && <span>+{channels.length - 8} more</span>}
              </div>

              <div className="share-squad-actions">
                <button type="button" className="primary-button" onClick={shareView}>
                  <Share2 />
                  {navigator.share ? 'Share Squad' : 'Copy Squad link'}
                </button>
                {navigator.share && (
                  <button type="button" className="secondary-button" onClick={copyShareLink}>Copy Link</button>
                )}
              </div>

              {shareFeedback && <div className="share-squad-feedback" role="status">{shareFeedback}</div>}

              {accountSession?.user?.id ? (
                referralSummary?.available ? (
                  <div className="share-rewards-card">
                    <div className="share-rewards-heading">
                      <div>
                        <span>SquadView Rewards</span>
                        <strong>{referralSummary.lifetimePremium ? 'Lifetime Premium unlocked' : 'Invite 5. Earn 30 days Premium.'}</strong>
                      </div>
                      {referralBusy && <small>Syncing…</small>}
                    </div>

                    {!referralSummary.lifetimePremium && (
                      <>
                        <div className="reward-progress-row">
                          <span>Next free month</span>
                          <strong>{referralSummary.nextMonthProgress}/5</strong>
                        </div>
                        <div className="reward-progress-track" aria-hidden="true">
                          <span style={{ width: `${(referralSummary.nextMonthProgress / 5) * 100}%` }} />
                        </div>
                        <small>
                          Every 5 qualified new SquadView users you bring in adds another 30 days. Rewards stack.
                        </small>
                      </>
                    )}

                    <div className="reward-lifetime-row">
                      <span>Lifetime Premium</span>
                      <strong>{Math.min(referralSummary.qualifiedReferrals, 100)}/100</strong>
                    </div>
                    <div className="reward-progress-track lifetime" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, referralSummary.qualifiedReferrals)}%` }} />
                    </div>
                    <small>
                      {referralSummary.lifetimePremium
                        ? 'This Twitch account has permanent SquadView Premium.'
                        : `${referralSummary.lifetimeRemaining} more qualified ${referralSummary.lifetimeRemaining === 1 ? 'referral' : 'referrals'} to Lifetime Premium.`}
                    </small>
                    <small className="reward-definition">A referral qualifies when a new SquadView user opens your link, signs in with Twitch, and starts watching.</small>
                  </div>
                ) : null
              ) : (
                <div className="share-rewards-card guest">
                  <span>Want free Premium?</span>
                  <strong>Sign in with Twitch to get referral credit.</strong>
                  <small>Every 5 new SquadView users you refer earns 30 days of Premium. Reach 100 for Lifetime Premium.</small>
                  <button type="button" className="twitch-login-button" onClick={handleTwitchSignIn} disabled={authBusy || !isSquadViewAuthConfigured}>
                    {authBusy ? 'Opening Twitch…' : 'Continue with Twitch'}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {showSharedArrival && sharedViewer?.channels?.length > 0 && (
          <div
            className="shared-arrival-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowSharedArrival(false);
                trackEvent('shared_view_arrival_dismissed', {
                  stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
                });
              }
            }}
          >
            <section
              className="shared-arrival-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="shared-arrival-title"
            >
              <button
                type="button"
                className="shared-arrival-close"
                onClick={() => {
                  setShowSharedArrival(false);
                  trackEvent('shared_view_arrival_dismissed', {
                    stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
                  });
                }}
                aria-label="Close shared view message"
              >
                ×
              </button>

              <span className="shared-arrival-eyebrow">Shared SquadView</span>
              <h2 id="shared-arrival-title">
                {sharedViewer.channels.length > viewerStreamLimit
                  ? `${viewerStreamLimit} of ${sharedViewer.channels.length} streams loaded`
                  : `${sharedViewer.channels.length} ${sharedViewer.channels.length === 1 ? 'stream is' : 'streams are'} ready`}
              </h2>
              <p>
                Someone shared this Twitch view with you. The streams are already loaded, so you can start watching right away.
              </p>

              {incomingReferralCode && !accountSession?.user?.id && (
                <div className="shared-arrival-referral">
                  <strong>New to SquadView?</strong>
                  <span>Sign in with Twitch during this visit and the person who shared this view gets credit toward Premium. Your viewing experience stays the same.</span>
                  <button type="button" onClick={handleTwitchSignIn} disabled={authBusy || !isSquadViewAuthConfigured}>
                    {authBusy ? 'Opening Twitch…' : 'Continue with Twitch'}
                  </button>
                </div>
              )}

              {sharedViewer.channels.length > viewerStreamLimit && (
                <div className="shared-arrival-limit">
                  <strong>Your current plan supports {viewerStreamLimit} streams at once.</strong>
                  <span>SquadView loaded the first {viewerStreamLimit} from this shared view. Premium supports up to 16.</span>
                </div>
              )}

              <div className="shared-arrival-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowSharedArrival(false);
                    trackEvent('shared_view_arrival_continue', {
                      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
                    });
                  }}
                >
                  Start watching
                </button>
                <InstallSquadView
                  className="secondary-button shared-arrival-install"
                  label="Install SquadView"
                  source="shared_view_arrival"
                />
              </div>

              <small className="shared-arrival-footnote">
                Install SquadView to keep it one tap away on your phone or computer. No app store required.
              </small>
            </section>
          </div>
        )}

        {renderFavoriteLiveNotice()}

        {referralMessage && (
          <div className="referral-toast" role="status">
            <span>{referralMessage}</span>
            <button type="button" onClick={() => setReferralMessage('')} aria-label="Dismiss referral message">×</button>
          </div>
        )}

        {showYoutubeCompanion && (
          <YouTubeCompanionModal
            existingVideo={youtubeCompanion}
            isPremium={entitlements.isPremium}
            onClose={() => setShowYoutubeCompanion(false)}
            onSelect={selectYouTubeCompanion}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {shouldPreloadLoadingAd && (
        <VastLoadingAd
          ref={loadingAdRef}
          preload
          source="preload"
          onFinish={finishLoadingAd}
        />
      )}

      <header className="topbar">
        <a className="brand" href="#top" onClick={() => setLandingTab('home')}>
          <span><Radio /></span>SquadView
        </a>

        <nav className="topbar-nav" aria-label="SquadView pages">
          <button
            type="button"
            className={landingTab === 'home' ? 'is-current' : ''}
            onClick={() => openLandingTab('home')}
          >
            Build
          </button>
          <button
            type="button"
            className={landingTab === 'following' ? 'is-current' : ''}
            onClick={() => openLandingTab('following')}
          >
            Following
            {orderedFollowedLiveStreams.length > 0 && (
              <span className="nav-live-count">{orderedFollowedLiveStreams.length} live</span>
            )}
          </button>
          <button
            type="button"
            className={landingTab === 'squads' ? 'is-current' : ''}
            onClick={() => openLandingTab('squads')}
          >
            Squads
            {activeSavedSquadCount > 0 && (
              <span className="nav-live-count">{activeSavedSquadCount} active</span>
            )}
          </button>
          <button
            type="button"
            className="topbar-help-link"
            onClick={() => setShowHowItWorks(true)}
          >
            How it works
          </button>
        </nav>

        <div className="topbar-actions">
          <InstallSquadView className="install-button" label="Install app" source="viewer_header" />
          <button
            type="button"
            className={`account-button ${accountSession ? 'is-signed-in' : ''}`}
            onClick={() => setShowAccount(true)}
          >
            {accountProfile?.avatar_url ? (
              <img src={accountProfile.avatar_url} alt="" />
            ) : (
              <span className="account-avatar-fallback">T</span>
            )}
            <span>{accountSession ? (accountProfile?.display_name || 'Account') : 'Sign in with Twitch'}</span>
          </button>
        </div>
      </header>

      <main id="top">
        {landingTab === 'home' ? (
          <>
            <section className="hero">
              <div className="eyebrow"><span /> Built for phones, tablets, and laptops</div>
              <h1>Your streams.<br /><em>One view.</em></h1>
              <p>Add up to {viewerStreamLimit} Twitch channels on your current plan. Build the roster you want, then SquadView manages playback so only the streams currently on screen are playing.</p>
            </section>

            <section className="builder-card">
              <div className="section-title">
                <div><span>Build your view</span><h2>Choose your streams</h2></div>
                <small>{validInputs.length}/{viewerStreamLimit}</small>
              </div>

              <label className="automation-toggle builder-automation-toggle">
                <span>
                  <strong>Auto-fill live Favorites</strong>
                  <small>Use open slots only. SquadView never replaces a live stream you chose.</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoFillFavorites}
                  onChange={(event) => setAutoFillFavorites(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>

              {validInputs.length > 0 && (
                <div className="builder-quick-watch-dock">
                  <button
                    type="button"
                    className="primary-button builder-quick-watch-button"
                    onClick={() => beginWatching()}
                  >
                    Start watching {validInputs.length} <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button builder-clear-all-button"
                    onClick={clearAllBuildStreams}
                  >
                    Clear all
                  </button>
                </div>
              )}

              <div className="channel-list">
                {inputs.slice(0, manualBuilderInputCount).map((value, index) => (
                  <label key={index} className={favoriteStreamers.includes(cleanChannel(value)) ? 'is-favorite' : ''}>
                    <span>{index + 1}</span>
                    <input
                      value={value}
                      onChange={(event) => handleBuilderInputChange(index, event.target.value)}
                      placeholder={index === 0 ? 'Twitch username' : 'Add another stream'}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    {cleanChannel(value) && (
                      <button
                        type="button"
                        className={`builder-favorite-toggle ${favoriteStreamers.includes(cleanChannel(value)) ? 'is-favorite' : ''}`}
                        onClick={() => toggleFavoriteStreamer(cleanChannel(value))}
                        aria-label={favoriteStreamers.includes(cleanChannel(value)) ? `Remove ${cleanChannel(value)} from Favorites` : `Favorite ${cleanChannel(value)}`}
                        title={favoriteStreamers.includes(cleanChannel(value)) ? 'Remove from Favorites' : 'Add to Favorites'}
                      >
                        {favoriteStreamers.includes(cleanChannel(value)) ? <FilledHeart /> : <Heart />}
                      </button>
                    )}
                    {value && (
                      <button
                        type="button"
                        className="builder-clear-stream"
                        onClick={() => removeBuildInputAt(index)}
                        aria-label={`Remove ${cleanChannel(value) || 'stream'}`}
                      >
                        <X />
                      </button>
                    )}
                  </label>
                ))}
              </div>

              {validInputs.length > 0 && (
                <div className="build-selection-strip">
                  <div className="build-selection-heading">
                    <span>Your view</span>
                    <strong>{validInputs.length} of {viewerStreamLimit} selected</strong>
                  </div>
                  <div className="build-selection-chips">
                    {validInputs.map((streamer) => (
                      <button
                        type="button"
                        key={streamer}
                        onClick={() => removeFromBuildList(streamer)}
                        aria-label={`Remove ${streamer} from view`}
                      >
                        {streamer} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button className="primary-button start-button" disabled={!validInputs.length} onClick={() => beginWatching()}>
                {validInputs.length ? `Start watching ${validInputs.length}` : 'Start watching'} <span>→</span>
              </button>
              {validInputs.length > 0 && (
                <button className="secondary-button save-squad-button" type="button" onClick={() => openSaveSquadModal(validInputs)}>
                  <Save /> {accountSession ? 'Save as Squad' : 'Sign in to save this Squad'}
                </button>
              )}
              <p className="ad-note">Streams open muted so you can choose which channel you want to hear.</p>
            </section>




          </>
        ) : landingTab === 'following' ? (
          <section className="following-page">
            <div className="following-page-heading">
              <div>
                <span>From your Twitch account</span>
                <h1>Following</h1>
                <p>Live Favorites rise to the top automatically. Favorite or unfavorite creators here without maintaining a separate Favorites page.</p>
              </div>
              {accountSession && (
                <div className="following-heading-actions">
                  <div className="following-live-summary">
                    <strong>{orderedFollowedLiveStreams.length}</strong>
                    <span>live now</span>
                  </div>
                  <button
                    type="button"
                    className="following-refresh-button"
                    onClick={() => followingView === 'all'
                      ? void refreshFollowedChannels({ force: true })
                      : void refreshFollowedLiveStreams()}
                    disabled={followingStatus === 'loading' || followedChannelsStatus === 'loading'}
                  >
                    {(followingStatus === 'loading' || followedChannelsStatus === 'loading') ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              )}
            </div>

            {accountSession && (
              <>
                <div className="following-view-tabs" role="tablist" aria-label="Following views">
                  <button type="button" className={followingView === 'live' ? 'is-current' : ''} onClick={() => setFollowingView('live')}>
                    Live now <span>{orderedFollowedLiveStreams.length}</span>
                  </button>
                  <button type="button" className={followingView === 'favorites' ? 'is-current' : ''} onClick={() => setFollowingView('favorites')}>
                    Favorites <span>{favoriteStreamers.length}/{favoriteStreamerLimit}</span>
                  </button>
                  <button type="button" className={followingView === 'all' ? 'is-current' : ''} onClick={() => {
                    setFollowingView('all');
                    if (followedChannelsStatus === 'idle') void refreshFollowedChannels();
                  }}>
                    All following
                  </button>
                </div>

                <div className="following-preferences">
                  <label className="automation-toggle compact">
                    <span><strong>Favorite live alerts</strong><small>Show a small alert while SquadView is open.</small></span>
                    <input type="checkbox" checked={favoriteLiveAlertsEnabled} onChange={(event) => setFavoriteLiveAlertsEnabled(event.target.checked)} />
                    <i aria-hidden="true" />
                  </label>
                  <label className={`automation-toggle compact ${!favoriteLiveAlertsEnabled ? 'is-disabled' : ''}`}>
                    <span><strong>Alert sound</strong><small>Play a short tone when a Favorite goes live.</small></span>
                    <input type="checkbox" checked={favoriteLiveAlertSound} disabled={!favoriteLiveAlertsEnabled} onChange={(event) => setFavoriteLiveAlertSound(event.target.checked)} />
                    <i aria-hidden="true" />
                  </label>
                </div>
              </>
            )}

            {!accountSession ? (
              <div className="following-state-card">
                <div className="twitch-account-mark">T</div>
                <strong>Sign in with Twitch to see who you follow</strong>
                <p>SquadView uses your Twitch follows for discovery, while SquadView Favorites control priority, live alerts, and optional Auto-fill.</p>
                <button type="button" className="twitch-login-button" onClick={() => setShowAccount(true)}>
                  Sign in with Twitch
                </button>
              </div>
            ) : followingView === 'live' ? (
              followingStatus === 'reconnect' ? (
                <div className="following-state-card">
                  <div className="twitch-account-mark">T</div>
                  <strong>Connect your Twitch follows</strong>
                  <p>{followingError || 'Authorize the follow-list permission once and SquadView can show your live followed channels here.'}</p>
                  <button type="button" className="twitch-login-button" onClick={handleReconnectTwitchFollows} disabled={authBusy}>
                    {authBusy ? 'Opening Twitch…' : 'Reconnect Twitch'}
                  </button>
                </div>
              ) : followingStatus === 'loading' || (favoriteStreamers.length > 0 && !favoriteLiveStatusReady) ? (
                <div className="following-state-card compact"><strong>Checking your live Favorites and Twitch follows…</strong><p>SquadView is combining both live-status sources so Favorites can be placed first without dropping anyone Twitch already reports as live.</p></div>
              ) : followingStatus === 'error' ? (
                <div className="following-state-card"><strong>Following Live is temporarily unavailable</strong><p>{followingError}</p><button type="button" className="secondary-button" onClick={() => void refreshFollowedLiveStreams()}>Try again</button></div>
              ) : orderedFollowedLiveStreams.length ? (
                <div className="following-live-grid">
                  {orderedFollowedLiveStreams.map((stream) => {
                    const channel = cleanChannel(stream.user_login);
                    const alreadyAdded = validInputs.includes(channel);
                    const groupIsFull = validInputs.length >= viewerStreamLimit;
                    const isFavorite = favoriteStreamers.includes(channel);
                    return (
                      <article key={stream.id || channel} className={`following-live-card ${isFavorite ? 'is-favorite' : ''}`}>
                        <div className="following-live-thumbnail">
                          {stream.thumbnail_url ? <img src={stream.thumbnail_url} alt="" loading="lazy" /> : <div className="following-thumbnail-fallback">T</div>}
                          <span className="following-live-badge">LIVE</span>
                        </div>
                        <div className="following-live-copy">
                          <div className="following-streamer-line">
                            <div><strong>{stream.user_name || channel}</strong><small>@{channel}</small></div>
                            <button type="button" className={`following-favorite-toggle ${isFavorite ? 'is-favorite' : ''}`} onClick={() => toggleFavoriteStreamer(channel)} aria-label={isFavorite ? `Remove ${channel} from Favorites` : `Favorite ${channel}`}>
                              {isFavorite ? <FilledHeart /> : <Heart />} {isFavorite ? 'Favorite' : 'Favorite'}
                            </button>
                          </div>
                          <p>{stream.title || 'Live on Twitch'}</p>
                          <small className="following-stream-meta">{stream.squadviewFavoriteStatusOnly ? `${stream.game_name || 'Twitch'} · Favorite live status` : `${stream.game_name || 'Twitch'} · ${Number(stream.viewer_count || 0).toLocaleString()} viewers`}</small>
                          <button type="button" className="favorite-add-button following-add-button" onClick={() => alreadyAdded ? removeFromBuildList(channel) : addFollowedToGroup(channel)} disabled={!alreadyAdded && groupIsFull} data-action={alreadyAdded ? 'remove' : 'add'}>
                            {alreadyAdded ? '− Remove from view' : groupIsFull ? 'View full' : '+ Add to view'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="following-state-card compact"><strong>No followed channels are live right now</strong><p>Favorite streamers are checked automatically while SquadView is open.</p></div>
              )
            ) : followingView === 'favorites' ? (
              sortedFavoriteStreamers.length ? (
                <div className="following-directory-list">
                  {sortedFavoriteStreamers.map((channel) => {
                    const isLive = knownLiveFavoriteLogins.has(channel);
                    const alreadyAdded = validInputs.includes(channel);
                    const groupIsFull = validInputs.length >= viewerStreamLimit;
                    return (
                      <article key={channel} className={`is-favorite ${isLive ? 'is-live' : ''}`}>
                        <div className="following-directory-copy">
                          <strong>{channel}</strong>
                          <small>{isLive ? <><i className="live-dot" aria-hidden="true" /> Live now</> : 'Offline'}</small>
                        </div>
                        <button type="button" className="following-favorite-toggle is-favorite" onClick={() => toggleFavoriteStreamer(channel)}><FilledHeart /> Favorite</button>
                        <button type="button" className="favorite-add-button" onClick={() => alreadyAdded ? removeFromBuildList(channel) : addFavoriteToGroup(channel)} disabled={!alreadyAdded && (groupIsFull || !isLive)}>
                          {alreadyAdded ? '− Remove' : !isLive ? 'Offline' : groupIsFull ? 'View full' : '+ Add'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="following-state-card compact"><strong>No Favorites yet</strong><p>Use the heart on a live or followed creator to prioritize them here.</p></div>
              )
            ) : followedChannelsStatus === 'reconnect' || followedChannelsStatus === 'error' ? (
              <div className="following-state-card"><strong>Could not load all Twitch follows</strong><p>{followedChannelsError}</p><button type="button" className="secondary-button" onClick={() => void refreshFollowedChannels({ force: true })}>Try again</button></div>
            ) : followedChannelsStatus === 'loading' ? (
              <div className="following-state-card compact"><strong>Loading everyone you follow…</strong></div>
            ) : followedChannels.length ? (
              <div className="following-directory-list">
                {followedChannels.map((follow) => {
                  const channel = cleanChannel(follow.broadcaster_login);
                  const displayName = follow.broadcaster_name || channel;
                  const isLive = followedLiveLogins.has(channel) || knownLiveFavoriteLogins.has(channel);
                  const isFavorite = favoriteStreamers.includes(channel);
                  const alreadyAdded = validInputs.includes(channel);
                  const groupIsFull = validInputs.length >= viewerStreamLimit;
                  return (
                    <article key={follow.broadcaster_id || channel} className={`${isFavorite ? 'is-favorite' : ''} ${isLive ? 'is-live' : ''}`}>
                      <div className="following-directory-copy"><strong>{displayName}</strong><small>@{channel} · {isLive ? 'Live now' : 'Offline'}</small></div>
                      <button type="button" className={`following-favorite-toggle ${isFavorite ? 'is-favorite' : ''}`} onClick={() => toggleFavoriteStreamer(channel)}>{isFavorite ? <FilledHeart /> : <Heart />} Favorite</button>
                      <button type="button" className="favorite-add-button" onClick={() => alreadyAdded ? removeFromBuildList(channel) : addFollowedToGroup(channel)} disabled={!alreadyAdded && (groupIsFull || !isLive)}>
                        {alreadyAdded ? '− Remove' : !isLive ? 'Offline' : groupIsFull ? 'View full' : '+ Add'}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="following-state-card compact"><strong>No followed channels found</strong></div>
            )}

            {accountSession && validInputs.length > 0 && (
              <div className="favorites-build-dock following-build-dock">
                <div><span>Current view</span><strong>{validInputs.length} streamer{validInputs.length === 1 ? '' : 's'} selected</strong></div>
                <button type="button" className="secondary-button" onClick={() => { setBuilderMode('manual'); openLandingTab('home'); }}>View list</button>
                <button type="button" className="primary-button" onClick={() => beginWatching()}>Start watching {validInputs.length} →</button>
              </div>
            )}
          </section>
        ) : landingTab === 'squads' ? (
          <section className="saved-squads-page">
            <div className="saved-squads-heading">
              <div>
                <span>Your repeat views</span>
                <h1>Saved Squads</h1>
                <p>Keep creator groups ready, see when members are live, and jump back into the same viewing setup without rebuilding it.</p>
              </div>
              <div className={`plan-chip ${entitlements.isPremium ? 'is-premium' : ''}`}>
                <strong>{entitlements.isPremium ? 'Premium' : 'Free'}</strong>
                <span>
                  {entitlements.savedSquadLimit === null
                    ? 'Unlimited Squads'
                    : `${savedSquads.length}/${entitlements.savedSquadLimit} Squads`}
                </span>
              </div>
            </div>

            {!accountSession ? (
              <div className="following-state-card">
                <div className="twitch-account-mark">T</div>
                <strong>Sign in with Twitch to save Squads</strong>
                <p>Your Saved Squads sync to your SquadView account so the groups you build can follow you across devices.</p>
                <button type="button" className="twitch-login-button" onClick={() => setShowAccount(true)}>
                  Sign in with Twitch
                </button>
              </div>
            ) : savedSquadsStatus === 'loading' ? (
              <div className="following-state-card compact">
                <strong>Loading your Saved Squads…</strong>
              </div>
            ) : (
              <>
                {savedSquadsError && <div className="account-error saved-squads-error">{savedSquadsError}</div>}

                {savedSquads.length ? (
                  <div className="saved-squads-grid">
                    {savedSquads.map((squad) => {
                      const memberLogins = squad.members.map((member) => member.twitchLogin);
                      const liveMembers = memberLogins.filter((channel) => liveSavedSquadStreamers.has(channel));
                      return (
                        <article key={squad.id} className="saved-squad-card">
                          <div className="saved-squad-card-heading">
                            <div>
                              <span>{liveMembers.length ? `${liveMembers.length} live now` : 'Ready when they go live'}</span>
                              <h2>{squad.name}</h2>
                            </div>
                            <button type="button" className="delete-button" onClick={() => void handleDeleteSavedSquad(squad.id)} aria-label={`Delete ${squad.name}`}>
                              <Trash2 />
                            </button>
                          </div>
                          <div className="saved-squad-members">
                            {memberLogins.map((channel) => (
                              <span key={channel} className={liveSavedSquadStreamers.has(channel) ? 'is-live' : ''}>
                                {liveSavedSquadStreamers.has(channel) && <i className="live-dot" aria-hidden="true" />}
                                {channel}
                              </span>
                            ))}
                          </div>
                          <div className="saved-squad-card-footer">
                            <div className="saved-squad-card-meta">
                              <small>{memberLogins.length}/{entitlements.maxSquadMembers} creators</small>
                              {liveMembers.length > entitlements.viewerMaxStreams && (
                                <small>{liveMembers.length} live · {entitlements.viewerMaxStreams} open at once</small>
                              )}
                            </div>
                            <div className="saved-squad-card-actions">
                              <button type="button" className="secondary-button saved-squad-edit-button" onClick={() => openSavedSquadEditor(squad)}>
                                Edit Squad
                              </button>
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => watchSavedSquad(squad)}
                                disabled={!liveMembers.length}
                                title={!liveMembers.length ? 'No members of this Squad are live right now.' : undefined}
                              >
                                {liveMembers.length ? `Watch ${Math.min(liveMembers.length, entitlements.viewerMaxStreams)} live →` : 'No one live'}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : savedSquadsStatus === 'ready' ? (
                  <div className="saved-squads-empty">
                    <Save />
                    <strong>No Saved Squads yet</strong>
                    <p>Build a Twitch view, choose Save as Squad, and it will appear here for one click access later.</p>
                    <button type="button" className="secondary-button" onClick={() => openLandingTab('home')}>Build your first Squad</button>
                  </div>
                ) : null}

                {!entitlements.isPremium && (
                  <aside className="premium-preview-card">
                    <div>
                      <span>SquadView Premium</span>
                      <h2>Build a streaming setup that keeps getting more useful.</h2>
                      <p>Premium is designed around larger reusable Squads, live Squad alerts, one YouTube Companion, Multi Window, and no SquadView ads.</p>
                    </div>
                    <ul>
                      <li><strong>16</strong><span>creators per Saved Squad</span></li>
                      <li><strong>Unlimited</strong><span>Saved Squads</span></li>
                      <li><strong>1</strong><span>YouTube Companion</span></li>
                    </ul>
                  </aside>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="following-page">
            <div className="following-state-card compact">
              <strong>Favorites moved into Following</strong>
              <p>Manage Favorites alongside the creators you follow on Twitch.</p>
              <button type="button" className="primary-button" onClick={() => { setFollowingView('favorites'); openLandingTab('following'); }}>Open Following →</button>
            </div>
          </section>
        )}
      </main>

      {renderFavoriteLiveNotice()}

      {editingSavedSquad && (
        <div className="modal-backdrop saved-squad-editor-backdrop" onClick={closeSavedSquadEditor}>
          <section className="modal saved-squad-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closeSavedSquadEditor} disabled={editSquadBusy}><X /></button>
            <div className="saved-squad-editor-header">
              <span className="modal-eyebrow">Saved Squad</span>
              <h2>Edit {editingSavedSquad.name}</h2>
              <p>Build the full creator roster here. Opening the Squad automatically loads only members who are live, up to your {viewerStreamLimit} stream viewer limit.</p>
            </div>

            <form className="saved-squad-editor-form" onSubmit={handleUpdateSavedSquad}>
              <label className="saved-squad-editor-name">
                <span>Squad name</span>
                <input
                  value={editSquadName}
                  onChange={(event) => setEditSquadName(event.target.value)}
                  maxLength={60}
                  placeholder="e.g. Day Time Gang"
                />
              </label>

              <div className="saved-squad-editor-member-heading">
                <div>
                  <strong>Squad members</strong>
                  <small>{editSquadMembers.length}/{entitlements.maxSquadMembers} creators</small>
                </div>
                {entitlements.isPremium && <span className="premium-mini-pill">Premium · 16 max</span>}
              </div>

              <div className="saved-squad-editor-members">
                {editSquadMembers.map((channel) => {
                  const isLive = liveSavedSquadStreamers.has(channel) || followedLiveLogins.has(channel);
                  return (
                    <span key={channel} className={isLive ? 'is-live' : ''}>
                      {isLive && <i className="live-dot" aria-hidden="true" />}
                      {channel}
                      <button
                        type="button"
                        onClick={() => removeSavedSquadEditorMember(channel)}
                        disabled={editSquadBusy}
                        aria-label={`Remove ${channel} from ${editingSavedSquad.name}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>

              <div className="saved-squad-editor-add">
                <strong>Add creators</strong>
                <div className="saved-squad-editor-manual">
                  <input
                    value={editSquadManualChannel}
                    onChange={(event) => setEditSquadManualChannel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSavedSquadEditorMember(editSquadManualChannel);
                      }
                    }}
                    placeholder="Twitch username"
                    disabled={editSquadBusy || editSquadMembers.length >= entitlements.maxSquadMembers}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => addSavedSquadEditorMember(editSquadManualChannel)}
                    disabled={editSquadBusy || !cleanChannel(editSquadManualChannel) || editSquadMembers.length >= entitlements.maxSquadMembers}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="saved-squad-editor-sources">
                <div className="saved-squad-editor-tabs" role="tablist" aria-label="Creator sources">
                  <button
                    type="button"
                    className={editSquadSource === 'live' ? 'is-current' : ''}
                    onClick={() => { setEditSquadSource('live'); setEditSquadSearch(''); void refreshFollowedLiveStreams({ silent: true }); }}
                  >
                    Live now
                  </button>
                  <button
                    type="button"
                    className={editSquadSource === 'favorites' ? 'is-current' : ''}
                    onClick={() => { setEditSquadSource('favorites'); setEditSquadSearch(''); }}
                  >
                    Favorites
                  </button>
                  <button
                    type="button"
                    className={editSquadSource === 'following' ? 'is-current' : ''}
                    onClick={() => {
                      setEditSquadSource('following');
                      setEditSquadSearch('');
                      if (followedChannelsStatus === 'idle') void refreshFollowedChannels();
                    }}
                  >
                    Following
                  </button>
                </div>

                {editSquadSource === 'following' && (
                  <input
                    className="saved-squad-editor-search"
                    value={editSquadSearch}
                    onChange={(event) => setEditSquadSearch(event.target.value)}
                    placeholder="Search channels you follow"
                  />
                )}

                <div className="saved-squad-editor-candidates">
                  {editSquadSource === 'following' && followedChannelsStatus === 'loading' ? (
                    <div className="saved-squad-editor-empty">Loading your Twitch follows…</div>
                  ) : editSquadSource === 'following' && (followedChannelsStatus === 'reconnect' || followedChannelsStatus === 'error') ? (
                    <div className="saved-squad-editor-empty">{followedChannelsError || 'Could not load your followed channels.'}</div>
                  ) : editSquadCandidateChannels.length ? (
                    editSquadCandidateChannels.map((item) => (
                      <button
                        key={item.login}
                        type="button"
                        className="saved-squad-editor-candidate"
                        onClick={() => addSavedSquadEditorMember(item.login)}
                        disabled={editSquadBusy || editSquadMembers.length >= entitlements.maxSquadMembers}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.live && <i className="live-dot" aria-hidden="true" />}{item.meta}</small>
                        </span>
                        <b>+</b>
                      </button>
                    ))
                  ) : (
                    <div className="saved-squad-editor-empty">
                      {editSquadMembers.length >= entitlements.maxSquadMembers
                        ? `This Squad has reached its ${entitlements.maxSquadMembers} creator limit.`
                        : 'No additional creators available in this list.'}
                    </div>
                  )}
                </div>
              </div>

              {editSquadError && <div className="account-error">{editSquadError}</div>}

              <div className="saved-squad-editor-actions">
                <button type="button" className="secondary-button" onClick={closeSavedSquadEditor} disabled={editSquadBusy}>Cancel</button>
                <button type="submit" className="primary-button" disabled={editSquadBusy || !editSquadMembers.length}>
                  {editSquadBusy ? 'Saving…' : `Save ${editSquadMembers.length} creators`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showSaveSquad && (
        <div className="modal-backdrop" onClick={() => !saveSquadBusy && setShowSaveSquad(false)}>
          <section className="modal save-squad-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSaveSquad(false)} disabled={saveSquadBusy}><X /></button>
            <span className="modal-eyebrow">Save this setup</span>
            <h2>Name your Squad</h2>
            <p>Saved Squads sync with your Twitch sign in so you can return to the same creator group later.</p>
            <form onSubmit={handleCreateSavedSquad}>
              <label>
                <span>Squad name</span>
                <input
                  value={saveSquadName}
                  onChange={(event) => setSaveSquadName(event.target.value)}
                  placeholder="e.g. AMP Streams"
                  maxLength={60}
                  autoFocus
                />
              </label>
              <div className="save-squad-preview">
                {saveSquadChannels.map((channel) => <span key={channel}>{channel}</span>)}
              </div>
              <small>
                {entitlements.isPremium
                  ? `Premium supports up to ${entitlements.maxSquadMembers} creators per Saved Squad.`
                  : `Free supports ${entitlements.savedSquadLimit} Saved Squads with up to ${entitlements.maxSquadMembers} creators each.`}
              </small>
              {savedSquadsError && <div className="account-error">{savedSquadsError}</div>}
              <button type="submit" className="primary-button" disabled={saveSquadBusy}>
                {saveSquadBusy ? 'Saving…' : 'Save Squad'}
              </button>
            </form>
          </section>
        </div>
      )}
      {showGuestBenefits && !accountSession && (
        <div className="modal-backdrop guest-benefits-backdrop" onClick={dismissGuestBenefitsPrompt}>
          <section className="modal guest-benefits-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={dismissGuestBenefitsPrompt}><X /></button>
            <div className="twitch-account-mark">T</div>
            <span className="modal-eyebrow">Optional Twitch connection</span>
            <h2>Build faster with your Twitch account</h2>
            <p>You can keep using SquadView as a guest. Connecting Twitch adds the shortcuts that make repeat viewing easier.</p>
            <div className="guest-benefit-list">
              <span><b>✓</b> See the channels you already follow</span>
              <span><b>✓</b> Put live Favorites at the top of Following Live</span>
              <span><b>✓</b> Keep Favorite live/offline status updated automatically</span>
              <span><b>✓</b> Use SquadView native Twitch chat</span>
              <span><b>✓</b> Save Squads and sync Favorites across devices</span>
            </div>
            <button
              type="button"
              className="twitch-login-button"
              onClick={() => { setShowGuestBenefits(false); void handleTwitchSignIn(); }}
              disabled={authBusy || !isSquadViewAuthConfigured}
            >
              {authBusy ? 'Opening Twitch…' : 'Connect Twitch'}
            </button>
            <button type="button" className="secondary-button account-guest-button" onClick={dismissGuestBenefitsPrompt}>
              Continue without signing in
            </button>
          </section>
        </div>
      )}

      {showHowItWorks && (
        <div className="modal-backdrop" onClick={() => setShowHowItWorks(false)}>
          <section className="modal how-it-works-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHowItWorks(false)}><X /></button>
            <span className="modal-eyebrow">SquadView in one minute</span>
            <h2>Watch the whole squad without chasing tabs.</h2>
            <p>Enter Twitch channels, keep several live perspectives visible, and decide which stream you want to hear or focus without rebuilding the view.</p>
            <div className="how-it-works-modal-grid">
              <article><b>01</b><strong>Build</strong><span>Add up to {viewerStreamLimit} Twitch channels on your current plan.</span></article>
              <article><b>02</b><strong>Listen + Focus</strong><span>Control audio independently and jump straight to the stream you want in Focus mode.</span></article>
              <article><b>03</b><strong>Chat</strong><span>Open chat in a dedicated rail without sacrificing a stream position on desktop.</span></article>
              <article><b>04</b><strong>Connect Twitch</strong><span>Unlock Following Live, native chat, synced Favorites, and Saved Squads.</span></article>
            </div>
            <div className="how-it-works-modal-actions">
              <button type="button" className="primary-button" onClick={() => setShowHowItWorks(false)}>Start building</button>
              <a href="/learn">See the full SquadView overview</a>
            </div>
          </section>
        </div>
      )}

      {showAccount && (
        <div className="modal-backdrop" onClick={() => setShowAccount(false)}>
          <section className="modal account-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAccount(false)}><X /></button>
            {!accountSession ? (
              <>
                <div className="twitch-account-mark">T</div>
                <h2>Sync SquadView with Twitch</h2>
                <p>Sign in to carry your favorite streamers, most recent stream group, and default layout across devices. SquadView can also show which Twitch channels you follow are live. Guest viewing stays available.</p>
                {accountError && <div className="account-error">{accountError}</div>}
                {!isSquadViewAuthConfigured && (
                  <div className="account-setup-note">
                    Twitch sign in is ready in the app code, but the Supabase environment values still need to be configured.
                  </div>
                )}
                <button
                  type="button"
                  className="twitch-login-button"
                  onClick={handleTwitchSignIn}
                  disabled={authBusy || !isSquadViewAuthConfigured}
                >
                  {authBusy ? 'Opening Twitch…' : 'Continue with Twitch'}
                </button>
                <button type="button" className="secondary-button account-guest-button" onClick={() => setShowAccount(false)}>
                  Keep using Guest Mode
                </button>
              </>
            ) : (
              <>
                <div className="account-profile-row">
                  {accountProfile?.avatar_url ? (
                    <img src={accountProfile.avatar_url} alt="" />
                  ) : (
                    <div className="twitch-account-mark compact">T</div>
                  )}
                  <div>
                    <small>Signed in with Twitch</small>
                    <h2>{accountProfile?.display_name || 'SquadView account'}</h2>
                    {accountProfile?.twitch_login && <p>@{accountProfile.twitch_login}</p>}
                  </div>
                </div>
                {accountError && <div className="account-error">{accountError}</div>}
                <label className="account-layout-field">
                  <span>Default viewing layout</span>
                  <select value={defaultLayout} onChange={(event) => updateDefaultLayout(event.target.value)}>
                    <option value="smart">Smart layout</option>
                    <option value="dual">Grid / Dual</option>
                    <option value="chat">Stream + Chat</option>
                    <option value="solo">Solo focus</option>
                  </select>
                  <small>Smart layout keeps SquadView's current automatic behavior, including placing chat in the fourth desktop slot when three streams are selected.</small>
                </label>
                <div className={`account-plan-summary ${entitlements.isPremium ? 'is-premium' : ''}`}>
                  <div>
                    <small>SquadView plan</small>
                    <strong>{entitlements.lifetimePremium ? 'Lifetime Premium' : entitlements.isPremium ? 'Premium' : 'Free'}</strong>
                  </div>
                  <span>
                    {entitlements.lifetimePremium
                      ? 'Lifetime Premium is permanently attached to this SquadView Twitch account.'
                      : entitlements.promoPremiumUntil && entitlements.isPremium && entitlements.planKey === 'free'
                        ? `Referral Premium is active through ${formatRewardDate(entitlements.promoPremiumUntil)}.`
                        : entitlements.isPremium
                          ? 'Premium entitlements are synced to this account.'
                          : 'Free includes the full Twitch viewer. Premium adds power user tools without changing the automatic layouts.'}
                  </span>
                </div>
                {referralSummary?.available && (
                  <div className="account-rewards-summary">
                    <div className="account-rewards-heading">
                      <div>
                        <small>SquadView Rewards</small>
                        <strong>{referralSummary.qualifiedReferrals} qualified {referralSummary.qualifiedReferrals === 1 ? 'referral' : 'referrals'}</strong>
                      </div>
                      {referralBusy && <span>Syncing…</span>}
                    </div>
                    {!referralSummary.lifetimePremium && (
                      <>
                        <div className="reward-progress-row">
                          <span>Next 30 days Premium</span>
                          <strong>{referralSummary.nextMonthProgress}/5</strong>
                        </div>
                        <div className="reward-progress-track"><span style={{ width: `${(referralSummary.nextMonthProgress / 5) * 100}%` }} /></div>
                      </>
                    )}
                    <div className="reward-lifetime-row">
                      <span>Lifetime Premium</span>
                      <strong>{Math.min(referralSummary.qualifiedReferrals, 100)}/100</strong>
                    </div>
                    <div className="reward-progress-track lifetime"><span style={{ width: `${Math.min(100, referralSummary.qualifiedReferrals)}%` }} /></div>
                    <small>
                      {referralSummary.lifetimePremium
                        ? 'Lifetime Premium unlocked.'
                        : `Every 5 qualified new users adds 30 days. ${referralSummary.lifetimeRemaining} to Lifetime.`}
                    </small>
                    <button type="button" className="secondary-button account-share-rewards-button" onClick={() => { setShowAccount(false); if (channels.length) openShareSquad(); }} disabled={!channels.length}>
                      {channels.length ? 'Share current SquadView' : 'Open a SquadView to share'}
                    </button>
                  </div>
                )}
                <div className="account-sync-summary">
                  <strong>Sync is on</strong>
                  <span>Favorites and your most recent stream group follow this account across devices. Following Live reads your Twitch follows and never changes them.</span>
                </div>
                <button type="button" className="secondary-button account-signout-button" onClick={handleAccountSignOut} disabled={authBusy}>
                  {authBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <SiteFooter />
    </div>
  );
}


export default function App() {
  const route = window.location.pathname.replace(/\/+$/, '') || '/';

  if (route === '/' || route === '/watch') return <SquadViewApp />;
  if (route === '/learn' || route === '/home') return <HomePage />;
  if (route === '/about') return <AboutPage />;
  if (route === '/privacy') return <PrivacyPage />;
  if (route === '/terms') return <TermsPage />;
  if (route === '/support' || route === '/contact') return <SupportPage />;

  return <SquadViewApp />;
}
