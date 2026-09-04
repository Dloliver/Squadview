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
const LIVE_STATUS_API_URL = (import.meta.env.VITE_LIVE_STATUS_API_URL || '').replace(/\/$/, '');
const MAX_SUPPORTED_VIEWER_STREAMS = 16;

function padViewerInputs(values, limit) {
  const safeLimit = Math.max(1, Math.min(MAX_SUPPORTED_VIEWER_STREAMS, Number(limit) || 8));
  const source = Array.isArray(values) ? values.slice(0, safeLimit) : [];
  return [...source, ...Array(Math.max(0, safeLimit - source.length)).fill('')].slice(0, safeLimit);
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

function getDesktopPageChannels(sourceChannels, leadChannel, page, visibleTwitchLimit = 4) {
  if (!sourceChannels.length) return [];
  const safeVisibleLimit = Math.max(1, Math.min(4, Number(visibleTwitchLimit) || 4));
  const lead = sourceChannels.includes(leadChannel) ? leadChannel : sourceChannels[0];
  const otherChannels = sourceChannels.filter((channel) => channel !== lead);
  const otherPerPage = Math.max(0, safeVisibleLimit - 1);
  if (!otherPerPage) return [lead].filter(Boolean);
  const start = Math.max(0, page) * otherPerPage;
  return [lead, ...otherChannels.slice(start, start + otherPerPage)].filter(Boolean);
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
  // activeChannel owns Focus + chat. listeningChannels independently owns audio.
  const [activeChannel, setActiveChannel] = useState(() => initialViewer?.activeChannel || '');
  const [listeningChannels, setListeningChannels] = useState(() => new Set());
  const [favoriteStreamers, setFavoriteStreamers] = useState(readFavoriteStreamers);
  const [liveFavoriteStreamers, setLiveFavoriteStreamers] = useState(() => new Set());
  const [landingTab, setLandingTab] = useState('home');
  const [builderMode, setBuilderMode] = useState('manual');
  const [showEdit, setShowEdit] = useState(false);
  const [managerSource, setManagerSource] = useState('live');
  const [managerSearch, setManagerSearch] = useState('');
  const [manualManagerChannel, setManualManagerChannel] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState('');
  const [draggedManagerChannel, setDraggedManagerChannel] = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [accountSession, setAccountSession] = useState(null);
  const [accountReady, setAccountReady] = useState(false);
  const [accountProfile, setAccountProfile] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
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
  const accountHydratedUserRef = useRef('');
  const [viewMode, setViewMode] = useState(() => initialViewer?.viewMode || 'dual');
  // Always restore refreshed viewers muted. Browsers generally block autoplaying
  // audio after a hard refresh until the user interacts with the page again.
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [slotChannels, setSlotChannels] = useState(() => initialViewer?.slotChannels || []);
  const [desktopPage, setDesktopPage] = useState(() => initialViewer?.desktopPage || 0);
  // Keep the displayed desktop page independent from the stream that currently
  // owns audio. Focusing a stream should highlight it, not reshuffle the grid.
  const [desktopLeadChannel, setDesktopLeadChannel] = useState(() => initialViewer?.desktopLeadChannel || initialViewer?.channels?.[0] || '');
  const [chatLayout, setChatLayout] = useState(() => initialViewer?.chatLayout || 'single');
  const [isDesktopGrid, setIsDesktopGrid] = useState(() => window.matchMedia?.('(min-width: 1100px)').matches ?? false);
  const playersRef = useRef(new Map());

  // Twitch players are created lazily. The initial page creates only its
  // visible players. Once a channel has been visited, its player stays mounted
  // and pauses while off page so returning can resume without rebuilding every
  // Twitch embed. A completely new viewer session resets this cache.
  const mountedPlayerChannelsRef = useRef(new Set());

  const viewerSessionActiveRef = useRef(Boolean(initialViewer));
  const viewerStreamLimit = Math.max(1, Math.min(MAX_SUPPORTED_VIEWER_STREAMS, entitlements.viewerMaxStreams || FREE_ENTITLEMENTS.viewerMaxStreams));

  useEffect(() => {
    if (!sharedViewer?.channels?.length) return;
    trackEvent('shared_view_opened', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
    });
    trackEvent('shared_view_arrival_shown', {
      stream_count_bucket: getStreamCountBucket(sharedViewer.channels.length),
    });
  }, [sharedViewer]);

  useEffect(() => {
    document.title = 'SquadView Viewer — Build Your Multi Stream View';
    const descriptionTag = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    descriptionTag?.setAttribute('content', 'Build a SquadView with multiple Twitch channels and switch between grid, chat, solo viewing, and audio focus.');
    canonical?.setAttribute('href', 'https://squadview.app/watch');
    ogUrl?.setAttribute('content', 'https://squadview.app/watch');
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
    playersRef.current.forEach((player, channel) => {
      try {
        const shouldPlayAudio =
          audioEnabled &&
          listeningChannels.has(channel) &&
          player.__squadViewState?.visible !== false;
        player.setMuted(!shouldPlayAudio);
        player.setVolume(shouldPlayAudio ? 1 : 0);
      } catch {
        // A player may still be finishing initialization.
      }
    });
  }, [listeningChannels, audioEnabled]);

  useEffect(() => {
    if (!channels.length) {
      if (listeningChannels.size) setListeningChannels(new Set());
      if (audioEnabled) setAudioEnabled(false);
      return;
    }

    const allowed = new Set(channels);
    const nextListening = new Set(
      [...listeningChannels].filter((channel) => allowed.has(channel)),
    );

    if (
      nextListening.size !== listeningChannels.size ||
      [...nextListening].some((channel) => !listeningChannels.has(channel))
    ) {
      setListeningChannels(nextListening);
    }

    if (!nextListening.size && audioEnabled) {
      setAudioEnabled(false);
    }
  }, [channels, listeningChannels, audioEnabled]);

  useEffect(() => {
    document.body.classList.toggle('viewer-active', screen === 'viewer');
    return () => document.body.classList.remove('viewer-active');
  }, [screen]);

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
    const media = window.matchMedia('(min-width: 1100px)');
    const syncDesktopGrid = () => setIsDesktopGrid(media.matches);
    syncDesktopGrid();
    media.addEventListener?.('change', syncDesktopGrid);
    return () => media.removeEventListener?.('change', syncDesktopGrid);
  }, []);

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
  const sortedFavoriteStreamers = useMemo(
    () => [...favoriteStreamers].sort((first, second) => {
      const liveDifference =
        Number(liveFavoriteStreamers.has(second)) - Number(liveFavoriteStreamers.has(first));
      return liveDifference || first.localeCompare(second);
    }),
    [favoriteStreamers, liveFavoriteStreamers],
  );
  const liveFavoriteList = useMemo(
    () => sortedFavoriteStreamers.filter((streamer) => liveFavoriteStreamers.has(streamer)),
    [sortedFavoriteStreamers, liveFavoriteStreamers],
  );
  const savedSquadMemberLogins = useMemo(
    () => [...new Set(savedSquads.flatMap((squad) => squad.members.map((member) => member.twitchLogin)).filter(Boolean))],
    [savedSquads],
  );
  const activeSavedSquadCount = useMemo(
    () => savedSquads.filter((squad) => squad.members.some((member) => liveSavedSquadStreamers.has(member.twitchLogin))).length,
    [savedSquads, liveSavedSquadStreamers],
  );
  const followedLiveLogins = useMemo(
    () => new Set(followedLiveStreams.map((stream) => cleanChannel(stream.user_login)).filter(Boolean)),
    [followedLiveStreams],
  );
  const followedChannelLogins = useMemo(
    () => new Set(followedChannels.map((item) => cleanChannel(item.broadcaster_login)).filter(Boolean)),
    [followedChannels],
  );
  const managerFollowedChannels = useMemo(() => {
    const query = managerSearch.trim().toLowerCase();
    const sorted = [...followedChannels].sort((first, second) => {
      const firstLogin = cleanChannel(first.broadcaster_login);
      const secondLogin = cleanChannel(second.broadcaster_login);
      const liveDifference =
        Number(followedLiveLogins.has(secondLogin)) - Number(followedLiveLogins.has(firstLogin));
      return liveDifference ||
        String(first.broadcaster_name || firstLogin).localeCompare(String(second.broadcaster_name || secondLogin));
    });

    if (!query) return sorted;
    return sorted.filter((item) => {
      const login = cleanChannel(item.broadcaster_login);
      const name = String(item.broadcaster_name || '').toLowerCase();
      return login.includes(query) || name.includes(query);
    });
  }, [followedChannels, followedLiveLogins, managerSearch]);

  const editSquadCandidateChannels = useMemo(() => {
    const memberSet = new Set(editSquadMembers);
    const query = editSquadSearch.trim().toLowerCase();
    let candidates = [];

    if (editSquadSource === 'live') {
      candidates = followedLiveStreams.map((stream) => ({
        login: cleanChannel(stream.user_login),
        name: stream.user_name || stream.user_login,
        meta: stream.game_name || 'Live on Twitch',
        live: true,
      }));
    } else if (editSquadSource === 'favorites') {
      candidates = favoriteStreamers.map((channel) => ({
        login: cleanChannel(channel),
        name: channel,
        meta: liveFavoriteStreamers.has(cleanChannel(channel)) ? 'Live now' : 'Favorite',
        live: liveFavoriteStreamers.has(cleanChannel(channel)),
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
    liveFavoriteStreamers,
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
      return;
    }

    let cancelled = false;

    async function refreshFavoriteLiveStatus() {
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

        setLiveFavoriteStreamers(new Set(live));
      } catch (error) {
        if (!cancelled) setLiveFavoriteStreamers(new Set());
        if (import.meta.env.DEV) {
          console.info('[SquadView live status] unavailable', error);
        }
      }
    }

    refreshFavoriteLiveStatus();
    const interval = window.setInterval(refreshFavoriteLiveStatus, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [favoriteStreamers]);


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
      return undefined;
    }

    void refreshFollowedLiveStreams();
    const interval = window.setInterval(
      () => void refreshFollowedLiveStreams({ silent: true }),
      3 * 60 * 1000,
    );

    return () => window.clearInterval(interval);
  }, [accountSession?.user?.id, refreshFollowedLiveStreams]);

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

  function commitViewerStart(unique) {
    mountedPlayerChannelsRef.current = new Set();

    setChannels(unique);
    setActiveChannel(unique[0]);
    setListeningChannels(new Set());
    setAudioEnabled(false);
    const startWithGridChat = isDesktopGrid && unique.length === 3;
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

  function queueLoadingAd(launch) {
    markLoadingAdShown();
    setPendingAdLaunch(launch);
    trackEvent('squadview_ad_break_queued', {
      provider: AD_CONFIG.vast.provider,
      source: launch.source,
      plan_key: entitlements.planKey,
    });
    setScreen('ad');
  }

  function beginWatching(selected = validInputs, source = 'builder') {
    const unique = [...new Set(selected)].slice(0, viewerStreamLimit);
    if (!unique.length) return;

    if (shouldGateViewerWithAd()) {
      queueLoadingAd({ kind: 'channels', channels: unique, source });
      return;
    }

    commitViewerStart(unique);
  }

  function finishLoadingAd(result) {
    const launch = pendingAdLaunch;
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

    if (launch?.kind === 'channels' && launch.channels?.length) {
      commitViewerStart(launch.channels);
      return;
    }

    setScreen(channels.length ? 'viewer' : 'home');
  }


  function listenToChannel(channel) {
    const nextListening = new Set(listeningChannels);
    const wasListening = nextListening.has(channel);

    if (wasListening) {
      nextListening.delete(channel);
    } else {
      nextListening.add(channel);
    }

    setListeningChannels(nextListening);
    setAudioEnabled(nextListening.size > 0);

    // Listen is an independent per-stream audio toggle. Focus/chat do not move.
    const visibleNow = viewMode === 'dual'
      ? (isDesktopGrid
          ? getDesktopPageChannels(channels, desktopLeadChannel, desktopPage, youtubeCompanion ? 3 : 4)
          : slotChannels)
      : [channel];

    playersRef.current.forEach((player, playerChannel) => {
      try {
        const shouldListen =
          nextListening.has(playerChannel) &&
          visibleNow.includes(playerChannel);

        if (!wasListening && playerChannel === channel && shouldListen) {
          player.play?.();
        }

        player.setMuted(!shouldListen);
        player.setVolume(shouldListen ? 1 : 0);
      } catch {
        // The React state effect will apply the same audio state once ready.
      }
    });
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

    // Keep the replacement player mounted and muted. Avoid calling play again
    // here because repeated play calls can replay Twitch's startup sequence.
    try {
      playersRef.current.get(nextChannel)?.setMuted?.(true);
      playersRef.current.get(nextChannel)?.setVolume?.(0);
    } catch {
      // The player may still be initializing.
    }

    setSlotChannels((current) => current.map((channel, index) => index === replaceIndex ? nextChannel : channel));
  }

  function previousOther() {
    rotateOther(-1);
  }

  function nextOther() {
    rotateOther(1);
  }

  function openEditGroup(preferredSource = '') {
    const nextSource = preferredSource || (accountSession?.user?.id ? 'live' : 'favorites');
    setManagerSource(nextSource);
    setManagerSearch('');
    setManualManagerChannel('');
    setPendingReplacement('');
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
    addChannelToViewer(cleaned);
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

    // Focus controls the stream linked to chat. Audio stays independent.
    setActiveChannel(nextChannel);
  }

  function focusChannel(channel) {
    // Focus controls chat/primary visual state only.
    setActiveChannel(channel);
  }

  function enterSolo(channel = activeChannel) {
    setActiveChannel(channel);
    setViewMode('solo');
  }

  function enterChatMode() {
    if (viewMode === 'chat') return;

    // Desktop grid chat keeps the current page in place and replaces its fourth
    // tile with chat. Solo -> Chat (and all mobile Chat views) stays one stream
    // plus that stream's chat.
    setChatLayout(isDesktopGrid && viewMode === 'dual' && channels.length > 1 ? 'grid' : 'single');
    setViewMode('chat');
  }

  function returnToDual() {
    setViewMode('dual');
    setSlotChannels((current) => {
      const nextSlots = current.includes(activeChannel)
        ? current
        : [activeChannel, channels.find((channel) => channel !== activeChannel)].filter(Boolean);

      nextSlots.forEach((channel) => {
        try {
          if (channel !== activeChannel) {
            playersRef.current.get(channel)?.setMuted?.(true);
            playersRef.current.get(channel)?.setVolume?.(0);
          }
        } catch {
          // Twitch's native controls remain available.
        }
      });

      return nextSlots;
    });
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
    const next = favoriteStreamers.includes(cleaned)
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

  function removeFromBuildList(channel) {
    const cleaned = cleanChannel(channel);
    if (!cleaned) return;
    setInputs((current) =>
      current.map((item) => cleanChannel(item) === cleaned ? '' : item),
    );
  }

  function openLandingTab(tab) {
    setLandingTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function commitViewerChannels(nextChannels, { preferredActive = activeChannel } = {}) {
    const unique = [...new Set((nextChannels || []).map(cleanChannel).filter(Boolean))].slice(0, viewerStreamLimit);
    const previousCount = channels.length;

    if (!unique.length) {
      setChannels([]);
      setInputs(['', '', '', '', '', '', '', '']);
      setActiveChannel('');
      setListeningChannels(new Set());
      setSlotChannels([]);
      setAudioEnabled(false);
      setDesktopPage(0);
      setDesktopLeadChannel('');
      saveLastChannels([]);
      setShowEdit(false);
      exitViewer('last_stream_removed');
      return;
    }

    const requestedActive = cleanChannel(preferredActive);
    const nextActive = unique.includes(requestedActive) ? requestedActive : unique[0];
    const retainedSlots = slotChannels.filter((channel) => unique.includes(channel));
    const nextSlots = [
      nextActive,
      ...retainedSlots.filter((channel) => channel !== nextActive),
      ...unique.filter((channel) => channel !== nextActive && !retainedSlots.includes(channel)),
    ].slice(0, 2);

    setChannels(unique);
    setInputs(padViewerInputs(unique, viewerStreamLimit));
    setActiveChannel(nextActive);
    setSlotChannels(nextSlots);
    setDesktopPage(0);
    setDesktopLeadChannel(unique[0]);
    saveLastChannels(unique);

    // Four desktop streams edited down to three should not leave a dead tile.
    // Reuse that fourth quadrant for the focused stream's chat.
    if (isDesktopGrid && previousCount >= 4 && unique.length === 3 && viewMode === 'dual') {
      setChatLayout('grid');
      setViewMode('chat');
    }

    // If the user adds a fourth stream back to the automatic three plus chat
    // arrangement, restore the full grid automatically.
    if (
      isDesktopGrid &&
      previousCount === 3 &&
      unique.length >= 4 &&
      viewMode === 'chat' &&
      chatLayout === 'grid'
    ) {
      setViewMode('dual');
      setChatLayout('single');
    }
  }

  function removeChannelFromGroup(channelToRemove) {
    const cleaned = cleanChannel(channelToRemove);
    const remaining = channels.filter((channel) => channel !== cleaned);

    try {
      playersRef.current.get(cleaned)?.setMuted?.(true);
      playersRef.current.get(cleaned)?.setVolume?.(0);
    } catch {
      // The player may already be unmounting.
    }

    commitViewerChannels(remaining, {
      preferredActive: cleaned === activeChannel ? remaining[0] : activeChannel,
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

  async function shareView() {
    if (!channels.length) return;

    const url = new URL('/watch', window.location.origin);
    url.searchParams.set('channels', channels.join(','));
    if (activeChannel && channels.includes(activeChannel)) {
      url.searchParams.set('active', activeChannel);
    }

    const payload = {
      title: 'SquadView',
      text: `Watch ${channels.length} Twitch ${channels.length === 1 ? 'stream' : 'streams'} together on SquadView`,
      url: url.toString(),
    };

    trackEvent('shared_view_created', {
      stream_count_bucket: getStreamCountBucket(channels.length),
    });

    try {
      if (navigator.share) await navigator.share(payload);
      else await navigator.clipboard.writeText(url.toString());
    } catch {
      // User dismissed the share sheet.
    }
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

    // Desktop page order is anchored separately from activeChannel. Focusing a
    // stream only changes audio/highlighting. When the user changes pages, the
    // currently focused stream becomes the first tile on the destination page.
    const desktopGridChat = viewMode === 'chat' && isDesktopGrid && chatLayout === 'grid';
    const desktopSingleChat = viewMode === 'chat' && isDesktopGrid && !desktopGridChat;
    // Keep the Companion mounted across viewer modes. Desktop Grid + Chat
    // shows it as a pinned tile. On mobile, Dual becomes a deliberate two-panel
    // workspace: focused Twitch on top and YouTube Companion below. Entering
    // Chat temporarily hides/pauses YouTube and gives that lower panel to chat.
    const mobileYoutubeDual = Boolean(youtubeCompanion) && !isDesktopGrid && viewMode === 'dual';
    const youtubeVisible = Boolean(youtubeCompanion) && (viewMode === 'dual' || desktopGridChat);
    const desktopVisibleTwitchLimit = desktopGridChat
      ? (youtubeVisible ? 2 : 3)
      : (youtubeVisible ? 3 : 4);
    const desktopOtherPerPage = Math.max(1, desktopVisibleTwitchLimit - 1);
    const desktopOtherCount = Math.max(0, channels.length - 1);
    const desktopPageCount = Math.max(1, Math.ceil(desktopOtherCount / desktopOtherPerPage));
    const desktopPageForRender = Math.min(desktopPage, desktopPageCount - 1);
    const desktopChannels = getDesktopPageChannels(
      channels,
      desktopLeadChannel,
      desktopPageForRender,
      desktopVisibleTwitchLimit,
    );
    const desktopChatChannels = desktopGridChat ? desktopChannels : [activeChannel];
    const visibleChannels = viewMode === 'dual'
      ? (isDesktopGrid
          ? desktopChannels
          : mobileYoutubeDual
            ? [activeChannel]
            : dualChannels)
      : viewMode === 'chat'
        ? (isDesktopGrid ? desktopChatChannels : [activeChannel])
        : [activeChannel];

    // Only instantiate Twitch embeds as the user actually visits channels.
    // Previously visited channels remain mounted but receive visible={false},
    // which pauses them in TwitchPlayer until their page becomes active again.
    visibleChannels.forEach((channel) => {
      mountedPlayerChannelsRef.current.add(channel);
    });

    const mountedChannels = channels.filter((channel) =>
      mountedPlayerChannelsRef.current.has(channel),
    );

    const desktopTileCount = desktopGridChat
      ? visibleChannels.length + 1 + (youtubeVisible ? 1 : 0)
      : desktopSingleChat
        ? 2
        : visibleChannels.length + (youtubeVisible ? 1 : 0);

    // In the YouTube Companion desktop grid, slot 1 is always the pinned Twitch
    // lead/focused stream, slot 2 is always YouTube, and only slots 3-4 rotate
    // as the user pages through the remaining Twitch roster. Hidden mounted
    // players keep their lifecycle but do not influence visible tile order.
    const twitchTileOrder = (channel) => {
      if (!isDesktopGrid || !visibleChannels.includes(channel)) return undefined;
      if (viewMode !== 'dual' && !desktopGridChat) return undefined;
      const visibleIndex = visibleChannels.indexOf(channel);
      if (youtubeVisible) return visibleIndex === 0 ? 1 : visibleIndex + 2;
      return visibleIndex + 1;
    };

    const rotatingChannel = dualChannels.find((channel) => channel !== activeChannel) || dualChannels[1] || '';
    const desktopPagedMode = viewMode === 'dual' || desktopGridChat;
    const cycleForward = desktopPagedMode ? null : () => cycleFocused(1);
    const moveDesktopPage = (direction) => {
      if (desktopPageCount <= 1) return;
      setDesktopLeadChannel(activeChannel);
      setDesktopPage((current) => (current + direction + desktopPageCount) % desktopPageCount);
    };
    const previousDesktopPage = () => moveDesktopPage(-1);
    const nextDesktopPage = () => moveDesktopPage(1);

    return (
      <div className={`viewer-shell mode-${viewMode} chat-layout-${chatLayout} ${mobileYoutubeDual ? 'mobile-youtube-dual' : ''}`}>
        <header className="viewer-header">
          <button className="icon-button" onClick={() => exitViewer('back_button')} aria-label="Back"><ArrowLeft /></button>
          <div>
            <strong>SquadView</strong>
            <span>{viewMode === 'dual' ? (isDesktopGrid && channels.length > 2 ? 'Desktop grid' : 'Dual view') : viewMode === 'chat' ? (desktopGridChat ? 'Grid + chat' : 'Stream + chat') : 'Solo focus'}</span>
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
            <button className="icon-button" onClick={shareView} aria-label="Share"><Share2 /></button>
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
            <section className={`stream-stage mode-${viewMode} desktop-count-${desktopTileCount}`}>
              <div className="stream-stage-players">
                {mountedChannels.map((channel) => (
                  <TwitchPlayer
                    key={channel}
                    channel={channel}
                    visible={visibleChannels.includes(channel)}
                    visibleCount={visibleChannels.length}
                    active={activeChannel === channel}
                    audioSelected={listeningChannels.has(channel)}
                    audioEnabled={audioEnabled}
                    onListen={() => listenToChannel(channel)}
                    onFocus={() => focusChannel(channel)}
                    isTwitchFollowed={
                      followedLiveLogins.has(channel) ||
                      followedChannelLogins.has(channel)
                    }
                    isFavorite={favoriteStreamers.includes(channel)}
                    onToggleFavorite={() => toggleFavoriteStreamer(channel)}
                    onRemove={() => removeChannelFromGroup(channel)}
                    registerPlayer={registerPlayer}
                    tileOrder={twitchTileOrder(channel)}
                  />
                ))}

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
                      {accountSession?.user?.id && followedLiveStreams.length
                        ? `${followedLiveStreams.length} people you follow are live`
                        : accountSession?.user?.id
                          ? 'Choose from Twitch follows or favorites'
                          : 'Choose from favorites or enter a channel'}
                    </small>
                  </button>
                )}

                {viewMode === 'chat' && isDesktopGrid && (
                  <section className="desktop-grid-chat-tile">
                    <ChatPanel channel={activeChannel} />
                  </section>
                )}

                {!isDesktopGrid && activeChannel && (
                  <section
                    className={`mobile-chat-tile persistent-mobile-chat ${viewMode === 'chat' ? 'is-active' : 'is-parked'}`}
                    aria-hidden={viewMode !== 'chat'}
                  >
                    <ChatPanel channel={activeChannel} />
                  </section>
                )}
              </div>
            </section>

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

            {!isDesktopGrid && channels.length > 2 && !mobileYoutubeDual && (
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

            {!isDesktopGrid && channels.length === 2 && viewMode !== 'dual' && (
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
            <button className={viewMode === 'chat' ? 'is-current' : ''} onClick={enterChatMode}>☰ Chat</button>

            {isDesktopGrid && desktopPageCount > 1 && desktopPagedMode && (
              <div className="toolbar-page-controls" aria-label="Change visible stream page">
                <button type="button" onClick={previousDesktopPage} aria-label="Previous stream page">←</button>
                <span>Page {desktopPageForRender + 1} of {desktopPageCount}</span>
                <button type="button" onClick={nextDesktopPage} aria-label="Next stream page">→</button>
              </div>
            )}

            <button className={viewMode === 'solo' ? 'is-current' : ''} onClick={() => enterSolo()}>⛶ Solo</button>
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
          <div className="stream-manager-backdrop" onClick={() => setShowEdit(false)}>
            <aside className="stream-manager-drawer" onClick={(event) => event.stopPropagation()}>
              <header className="stream-manager-header">
                <div>
                  <span>Current SquadView</span>
                  <h2>Manage streams</h2>
                  <p>Add, remove, replace, or reorder without leaving what you are watching.</p>
                </div>
                <button className="stream-manager-close" onClick={() => setShowEdit(false)} aria-label="Close stream manager"><X /></button>
              </header>

              <section className="stream-manager-current">
                <div className="stream-manager-section-heading">
                  <div>
                    <strong>In this view</strong>
                    <small>Drag on desktop or use the arrows to reorder.</small>
                  </div>
                  <b>{channels.length}/{viewerStreamLimit}</b>
                </div>

                <div className="stream-manager-current-list">
                  {channels.map((channel, index) => (
                    <article
                      key={channel}
                      className={`stream-manager-current-row ${draggedManagerChannel === channel ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={() => setDraggedManagerChannel(channel)}
                      onDragEnd={() => setDraggedManagerChannel('')}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropViewerChannel(channel)}
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
                          {followedLiveLogins.has(channel) && <><i className="live-dot" aria-hidden="true" /> Live now</>}
                          {!followedLiveLogins.has(channel) && favoriteStreamers.includes(channel) && 'Favorite'}
                          {!followedLiveLogins.has(channel) && !favoriteStreamers.includes(channel) && (channel === activeChannel ? 'Audio focus' : 'In current view')}
                        </small>
                      </div>
                      <div className="stream-manager-order-buttons">
                        <button type="button" onClick={() => moveViewerChannel(channel, -1)} disabled={index === 0} aria-label={`Move ${channel} earlier`}>↑</button>
                        <button type="button" onClick={() => moveViewerChannel(channel, 1)} disabled={index === channels.length - 1} aria-label={`Move ${channel} later`}>↓</button>
                      </div>
                      <button
                        type="button"
                        className="stream-manager-remove"
                        onClick={() => removeChannelFromGroup(channel)}
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
                    <small>{channels.length < viewerStreamLimit ? `${viewerStreamLimit - channels.length} open spot${viewerStreamLimit - channels.length === 1 ? '' : 's'}` : 'View full. Choose someone to replace.'}</small>
                  </div>
                </div>

                <div className="stream-manager-tabs" role="tablist" aria-label="Choose a stream source">
                  <button type="button" className={managerSource === 'live' ? 'is-current' : ''} onClick={() => setManagerSource('live')}>
                    Following Live
                    {followedLiveStreams.length > 0 && <span>{followedLiveStreams.length}</span>}
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
                    ) : followedLiveStreams.length ? (
                      <div className="stream-manager-source-list">
                        {followedLiveStreams.map((stream) => {
                          const channel = cleanChannel(stream.user_login);
                          const alreadyAdded = channels.includes(channel);
                          return (
                            <article key={stream.id || channel} className="stream-manager-source-row is-live">
                              <div>
                                <strong>{stream.user_name || channel}</strong>
                                <small><i className="live-dot" aria-hidden="true" /> @{channel} · {stream.game_name || 'Twitch'}</small>
                              </div>
                              {favoriteStreamers.includes(channel) && <span className="stream-manager-favorite-pill"><FilledHeart /> Favorite</span>}
                              <button type="button" onClick={() => addChannelToViewer(channel)} disabled={alreadyAdded}>
                                {alreadyAdded ? 'Added ✓' : channels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="stream-manager-empty compact">
                        <strong>No followed channels are live right now</strong>
                        <p>Try Favorites, Following, or enter any Twitch channel.</p>
                      </div>
                    )
                  )}

                  {managerSource === 'favorites' && (
                    sortedFavoriteStreamers.length ? (
                      <div className="stream-manager-source-list">
                        {sortedFavoriteStreamers.map((channel) => {
                          const alreadyAdded = channels.includes(channel);
                          const isLive = liveFavoriteStreamers.has(channel) || followedLiveLogins.has(channel);
                          return (
                            <article key={channel} className={`stream-manager-source-row ${isLive ? 'is-live' : ''}`}>
                              <div>
                                <strong>{channel}</strong>
                                <small>{isLive ? <><i className="live-dot" aria-hidden="true" /> Live now</> : 'SquadView favorite'}</small>
                              </div>
                              <span className="stream-manager-favorite-pill"><FilledHeart /> Favorite</span>
                              <button type="button" onClick={() => addChannelToViewer(channel)} disabled={alreadyAdded}>
                                {alreadyAdded ? 'Added ✓' : channels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                              </button>
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
                            const alreadyAdded = channels.includes(channel);
                            const isLive = followedLiveLogins.has(channel);
                            return (
                              <article key={item.broadcaster_id || channel} className={`stream-manager-source-row ${isLive ? 'is-live' : ''}`}>
                                <div>
                                  <strong>{item.broadcaster_name || channel}</strong>
                                  <small>{isLive ? <><i className="live-dot" aria-hidden="true" /> @{channel} · Live now</> : `@${channel}`}</small>
                                </div>
                                {favoriteStreamers.includes(channel) && <span className="stream-manager-favorite-pill"><FilledHeart /> Favorite</span>}
                                <button type="button" onClick={() => addChannelToViewer(channel)} disabled={alreadyAdded}>
                                  {alreadyAdded ? 'Added ✓' : channels.length >= viewerStreamLimit ? 'Replace…' : '+ Add'}
                                </button>
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
                          {channels.length >= viewerStreamLimit ? 'Choose replacement' : '+ Add stream'}
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
                    {channels.map((channel) => (
                      <button type="button" key={channel} onClick={() => replaceChannelInViewer(channel)}>
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
                  <span>{channels.length}/{viewerStreamLimit} streams</span>
                  <small>Changes apply immediately.</small>
                </div>
                <button className="primary-button" onClick={() => setShowEdit(false)}>Done</button>
              </footer>
            </aside>
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
            {followedLiveStreams.length > 0 && (
              <span className="nav-live-count">{followedLiveStreams.length} live</span>
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
            className={landingTab === 'favorites' ? 'is-current' : ''}
            onClick={() => openLandingTab('favorites')}
          >
            Favorites
            {liveFavoriteList.length > 0 && (
              <span className="nav-live-count">{liveFavoriteList.length} live</span>
            )}
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

              <div className="builder-source-toggle" role="radiogroup" aria-label="Choose how to add streams">
                <label className={builderMode === 'manual' ? 'is-current' : ''}>
                  <input
                    type="radio"
                    name="builder-source"
                    value="manual"
                    checked={builderMode === 'manual'}
                    onChange={() => setBuilderMode('manual')}
                  />
                  <span>Enter streamers</span>
                </label>
                <label className={builderMode === 'favorites' ? 'is-current' : ''}>
                  <input
                    type="radio"
                    name="builder-source"
                    value="favorites"
                    checked={builderMode === 'favorites'}
                    onChange={() => setBuilderMode('favorites')}
                  />
                  <span>Favorites</span>
                </label>
              </div>

              {validInputs.length > 0 && (
                <div className="builder-quick-watch-dock">
                  <button
                    type="button"
                    className="primary-button builder-quick-watch-button"
                    onClick={() => beginWatching()}
                  >
                    Start watching {validInputs.length} <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}

              {builderMode === 'manual' ? (
                <div className="channel-list">
                  {inputs.map((value, index) => (
                    <label key={index}>
                      <span>{index + 1}</span>
                      <input
                        value={value}
                        onChange={(event) => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                        placeholder={index === 0 ? 'Twitch username' : 'Add another stream'}
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                      {value && (
                        <button
                          type="button"
                          onClick={() => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item))}
                          aria-label="Clear"
                        >
                          <X />
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="builder-favorites-panel">
                  <div className="builder-favorites-heading">
                    <div>
                      <strong>Favorite streamers</strong>
                      <small>
                        {liveFavoriteList.length
                          ? `${liveFavoriteList.length} live now. Live streamers are shown first.`
                          : 'Your saved streamers are ready when you are.'}
                      </small>
                    </div>
                    <button type="button" onClick={() => openLandingTab('favorites')}>
                      Manage favorites →
                    </button>
                  </div>

                  {sortedFavoriteStreamers.length ? (
                    <div className="builder-favorite-list">
                      {sortedFavoriteStreamers.map((streamer) => {
                        const alreadyAdded = validInputs.includes(streamer);
                        const groupIsFull = validInputs.length >= viewerStreamLimit;
                        const isLive = liveFavoriteStreamers.has(streamer);

                        return (
                          <article key={streamer} className={isLive ? 'is-live' : ''}>
                            <div className="favorite-streamer-name">
                              <FilledHeart />
                              <span>
                                <strong>{streamer}</strong>
                                <small>
                                  {isLive && <i className="live-dot" aria-hidden="true" />}
                                  {isLive ? 'Live now' : 'Offline'}
                                </small>
                              </span>
                            </div>
                            <button
                              type="button"
                              className="favorite-add-button"
                              onClick={() => addFavoriteToGroup(streamer)}
                              disabled={alreadyAdded || groupIsFull}
                            >
                              {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-favorites compact">
                      <Heart />
                      <strong>No favorite streamers yet</strong>
                      <p>Favorite someone while watching and they will appear here.</p>
                    </div>
                  )}
                </div>
              )}

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


            {favoriteStreamers.length > 0 && (
              <section className="live-favorites-section">
                <div className="section-title">
                  <div>
                    <span>Your shortcuts</span>
                    <h2>
                      {liveFavoriteList.length
                        ? `${liveFavoriteList.length} favorite${liveFavoriteList.length === 1 ? '' : 's'} live now`
                        : 'Favorite streamers'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="favorites-link-button"
                    onClick={() => openLandingTab('favorites')}
                  >
                    View favorites →
                  </button>
                </div>

                {liveFavoriteList.length ? (
                  <div className="live-favorites-preview">
                    {liveFavoriteList.slice(0, 3).map((streamer) => {
                      const alreadyAdded = validInputs.includes(streamer);
                      const groupIsFull = validInputs.length >= viewerStreamLimit;
                      return (
                        <article key={streamer}>
                          <div>
                            <strong>{streamer}</strong>
                            <small><i className="live-dot" aria-hidden="true" /> Live now</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => addFavoriteToGroup(streamer)}
                            disabled={alreadyAdded || groupIsFull}
                          >
                            {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add to view'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="live-favorites-empty">
                    <Heart />
                    <div>
                      <strong>No favorites are live right now</strong>
                      <small>You can still build a view from your saved streamers.</small>
                    </div>
                    <button type="button" onClick={() => openLandingTab('favorites')}>Open favorites</button>
                  </div>
                )}
              </section>
            )}

            <section className="how-it-works">
              <span>Simple by design</span>
              <h2>Tap. Listen. Focus.</h2>
              <div className="steps">
                <article><b>01</b><strong>Focus</strong><p>Choose which stream is linked to chat.</p></article>
                <article><b>02</b><strong>Listen</strong><p>Choose which visible Twitch stream you want to hear.</p></article>
                <article><b>03</b><strong>Save</strong><p>Favorite individual streamers and build future views in one tap.</p></article>
              </div>
            </section>

            <section className="about-squadview" aria-labelledby="about-squadview-heading">
              <span>Built for multi stream viewing</span>
              <h2 id="about-squadview-heading">Follow more of the action without living in browser tabs.</h2>
              <p>SquadView is an independent viewing interface for Twitch streams. Add the creators you want to follow, keep multiple perspectives visible, and choose which stream you want to hear without rebuilding your setup every time the action moves.</p>
              <p>The experience is designed for tournaments, creator collaborations, friend groups, watch parties, and any moment where one Twitch stream does not tell the whole story. SquadView provides the layout, audio focus, favorites, and viewing controls while Twitch continues to provide the video and chat.</p>
              <div className="about-squadview-links">
                <a href="/about">Learn more about SquadView →</a>
                <a href="/support">Help and FAQ →</a>
              </div>
            </section>

          </>
        ) : landingTab === 'following' ? (
          <section className="following-page">
            <div className="following-page-heading">
              <div>
                <span>From your Twitch account</span>
                <h1>Following Live</h1>
                <p>See channels you follow on Twitch that are live right now. Adding one to a view does not make it a SquadView favorite.</p>
              </div>
              {accountSession && (
                <div className="following-heading-actions">
                  <div className="following-live-summary">
                    <strong>{followedLiveStreams.length}</strong>
                    <span>live now</span>
                  </div>
                  <button
                    type="button"
                    className="following-refresh-button"
                    onClick={() => void refreshFollowedLiveStreams()}
                    disabled={followingStatus === 'loading'}
                  >
                    {followingStatus === 'loading' ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              )}
            </div>

            {!accountSession ? (
              <div className="following-state-card">
                <div className="twitch-account-mark">T</div>
                <strong>Sign in with Twitch to see who is live</strong>
                <p>SquadView requests the Twitch permissions needed for Following Live and connected chat. It never changes who you follow, and Twitch follows stay separate from SquadView Favorites.</p>
                <button type="button" className="twitch-login-button" onClick={() => setShowAccount(true)}>
                  Sign in with Twitch
                </button>
              </div>
            ) : followingStatus === 'reconnect' ? (
              <div className="following-state-card">
                <div className="twitch-account-mark">T</div>
                <strong>Connect your Twitch follows</strong>
                <p>{followingError || 'Authorize the follow-list permission once and SquadView can show your live followed channels here.'}</p>
                <button
                  type="button"
                  className="twitch-login-button"
                  onClick={handleReconnectTwitchFollows}
                  disabled={authBusy}
                >
                  {authBusy ? 'Opening Twitch…' : 'Reconnect Twitch'}
                </button>
              </div>
            ) : followingStatus === 'loading' ? (
              <div className="following-state-card compact">
                <strong>Checking your Twitch follows…</strong>
                <p>This normally takes only a moment.</p>
              </div>
            ) : followingStatus === 'error' ? (
              <div className="following-state-card">
                <strong>Following Live is temporarily unavailable</strong>
                <p>{followingError}</p>
                <button type="button" className="secondary-button" onClick={() => void refreshFollowedLiveStreams()}>
                  Try again
                </button>
              </div>
            ) : followedLiveStreams.length ? (
              <>
                <div className="following-live-grid">
                  {followedLiveStreams.map((stream) => {
                    const channel = cleanChannel(stream.user_login);
                    const alreadyAdded = validInputs.includes(channel);
                    const groupIsFull = validInputs.length >= viewerStreamLimit;
                    const isFavorite = favoriteStreamers.includes(channel);
                    return (
                      <article key={stream.id || channel} className="following-live-card">
                        <div className="following-live-thumbnail">
                          {stream.thumbnail_url ? (
                            <img src={stream.thumbnail_url} alt="" loading="lazy" />
                          ) : (
                            <div className="following-thumbnail-fallback">T</div>
                          )}
                          <span className="following-live-badge">LIVE</span>
                        </div>
                        <div className="following-live-copy">
                          <div className="following-streamer-line">
                            <div>
                              <strong>{stream.user_name || channel}</strong>
                              <small>@{channel}</small>
                            </div>
                            {isFavorite && <span className="following-favorite-badge"><FilledHeart /> Favorite</span>}
                          </div>
                          <p>{stream.title || 'Live on Twitch'}</p>
                          <small className="following-stream-meta">
                            {stream.game_name || 'Twitch'} · {stream.viewer_count.toLocaleString()} viewers
                          </small>
                          <button
                            type="button"
                            className="favorite-add-button following-add-button"
                            onClick={() => alreadyAdded ? removeFromBuildList(channel) : addFollowedToGroup(channel)}
                            disabled={!alreadyAdded && groupIsFull}
                            data-action={alreadyAdded ? 'remove' : 'add'}
                          >
                            {alreadyAdded ? '− Remove from view' : groupIsFull ? 'View full' : '+ Add to view'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="favorites-build-dock following-build-dock">
                  <div>
                    <span>Current view</span>
                    <strong>
                      {validInputs.length
                        ? `${validInputs.length} streamer${validInputs.length === 1 ? '' : 's'} selected`
                        : 'Choose live channels to build your view'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setBuilderMode('manual');
                      openLandingTab('home');
                    }}
                  >
                    View list
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!validInputs.length}
                    onClick={() => beginWatching()}
                  >
                    {validInputs.length ? `Start watching ${validInputs.length} →` : 'Start watching →'}
                  </button>
                </div>
              </>
            ) : followingStatus === 'ready' ? (
              <div className="following-state-card compact">
                <strong>No followed channels are live right now</strong>
                <p>When someone you follow goes live, they will appear here automatically.</p>
              </div>
            ) : null}
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
          <section className="favorites-page">
            <div className="favorites-page-heading">
              <div>
                <span>Your shortcuts</span>
                <h1>Favorites</h1>
                <p>See who is live, add streamers directly to your current view, and keep your saved list organized.</p>
              </div>
              <div className="favorites-live-summary">
                <strong>{liveFavoriteList.length}</strong>
                <span>live now</span>
              </div>
            </div>

            {sortedFavoriteStreamers.length ? (
              <div className="favorites-page-list">
                {sortedFavoriteStreamers.map((streamer) => {
                  const alreadyAdded = validInputs.includes(streamer);
                  const groupIsFull = validInputs.length >= viewerStreamLimit;
                  const isLive = liveFavoriteStreamers.has(streamer);

                  return (
                    <article key={streamer} className={isLive ? 'is-live' : ''}>
                      <div className="favorite-streamer-name">
                        <FilledHeart />
                        <span>
                          <strong>{streamer}</strong>
                          <small>
                            {isLive && <i className="live-dot" aria-hidden="true" />}
                            {isLive ? 'Live now' : 'Offline'}
                          </small>
                        </span>
                      </div>

                      <button
                        type="button"
                        className="favorite-add-button"
                        onClick={() => addFavoriteToGroup(streamer)}
                        disabled={alreadyAdded || groupIsFull}
                      >
                        {alreadyAdded ? 'Added ✓' : groupIsFull ? 'View full' : '+ Add'}
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => removeFavoriteStreamer(streamer)}
                        aria-label={`Remove ${streamer} from favorites`}
                      >
                        <Trash2 />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-favorites favorites-page-empty">
                <Heart />
                <strong>No favorite streamers yet</strong>
                <p>While watching, tap the heart beside a streamer. They will appear here for quick group building.</p>
              </div>
            )}

            <div className="favorites-build-dock">
              <div>
                <span>Current view</span>
                <strong>
                  {validInputs.length
                    ? `${validInputs.length} streamer${validInputs.length === 1 ? '' : 's'} selected`
                    : 'No streamers selected yet'}
                </strong>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setBuilderMode('manual');
                  openLandingTab('home');
                }}
              >
                View list
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!validInputs.length}
                onClick={() => beginWatching()}
              >
                {validInputs.length ? `Start watching ${validInputs.length} →` : 'Start watching →'}
              </button>
            </div>
          </section>
        )}
      </main>

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
                    <strong>{entitlements.isPremium ? 'Premium' : 'Free'}</strong>
                  </div>
                  <span>
                    {entitlements.isPremium
                      ? 'Premium entitlements are synced to this account.'
                      : 'Free includes the full Twitch viewer. Premium adds power user tools without changing the automatic layouts.'}
                  </span>
                </div>
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

  if (route === '/') return <HomePage />;
  if (route === '/watch') return <SquadViewApp />;
  if (route === '/about') return <AboutPage />;
  if (route === '/privacy') return <PrivacyPage />;
  if (route === '/terms') return <TermsPage />;
  if (route === '/support' || route === '/contact') return <SupportPage />;

  return <HomePage />;
}
