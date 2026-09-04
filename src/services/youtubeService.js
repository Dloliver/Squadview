const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';

export const YOUTUBE_DATA_API_KEY = String(import.meta.env.VITE_YOUTUBE_DATA_API_KEY || '').trim();

export function isYouTubeSearchConfigured() {
  return Boolean(YOUTUBE_DATA_API_KEY);
}

export function extractYouTubeVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      return String(url.pathname.split('/').filter(Boolean)[0] || '').slice(0, 11);
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') return String(url.searchParams.get('v') || '').slice(0, 11);

      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return String(parts[1] || '').slice(0, 11);
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeVideoResource(video) {
  const id = String(video?.id || '').trim();
  const snippet = video?.snippet || {};
  const status = video?.status || {};
  const contentDetails = video?.contentDetails || {};

  if (!id) return null;

  return {
    videoId: id,
    title: String(snippet.title || 'YouTube video'),
    channelTitle: String(snippet.channelTitle || 'YouTube'),
    thumbnail:
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.default?.url ||
      '',
    embeddable: status.embeddable !== false,
    madeForKids: status.madeForKids === true,
    ageRestricted: contentDetails?.contentRating?.ytRating === 'ytAgeRestricted',
  };
}

async function requestYouTube(path, params, apiKey = YOUTUBE_DATA_API_KEY) {
  if (!apiKey) {
    const error = new Error('youtube_api_key_missing');
    error.code = 'youtube_api_key_missing';
    throw error;
  }

  const url = new URL(`${YOUTUBE_API_ROOT}/${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-goog-api-key': apiKey,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `YouTube request failed (${response.status}).`;
    const error = new Error(message);
    error.code = payload?.error?.errors?.[0]?.reason || `youtube_http_${response.status}`;
    throw error;
  }

  return payload;
}

async function loadVideoDetails(videoIds, apiKey = YOUTUBE_DATA_API_KEY) {
  const ids = [...new Set((videoIds || []).filter(Boolean))].slice(0, 50);
  if (!ids.length) return [];

  const payload = await requestYouTube('videos', {
    part: 'snippet,status,contentDetails',
    id: ids.join(','),
    maxResults: ids.length,
  }, apiKey);

  return (payload?.items || [])
    .map(normalizeVideoResource)
    .filter(Boolean);
}

export async function lookupYouTubeVideo(value, apiKey = YOUTUBE_DATA_API_KEY) {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) {
    const error = new Error('youtube_video_id_invalid');
    error.code = 'youtube_video_id_invalid';
    throw error;
  }

  const [video] = await loadVideoDetails([videoId], apiKey);
  if (!video) {
    const error = new Error('youtube_video_not_found');
    error.code = 'youtube_video_not_found';
    throw error;
  }

  if (!video.embeddable) {
    const error = new Error('youtube_video_not_embeddable');
    error.code = 'youtube_video_not_embeddable';
    throw error;
  }

  if (video.ageRestricted) {
    const error = new Error('youtube_video_age_restricted');
    error.code = 'youtube_video_age_restricted';
    throw error;
  }

  // First release intentionally excludes Made for Kids embeds. YouTube requires
  // additional tracking controls for those players; filtering them keeps the
  // Companion implementation conservative until that handling is added.
  if (video.madeForKids) {
    const error = new Error('youtube_video_made_for_kids');
    error.code = 'youtube_video_made_for_kids';
    throw error;
  }

  return video;
}

export async function searchYouTubeVideos(query, apiKey = YOUTUBE_DATA_API_KEY) {
  const cleanedQuery = String(query || '').trim();
  if (!cleanedQuery) return [];

  const searchPayload = await requestYouTube('search', {
    part: 'snippet',
    q: cleanedQuery,
    type: 'video',
    maxResults: 8,
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
  }, apiKey);

  const ids = (searchPayload?.items || [])
    .map((item) => String(item?.id?.videoId || '').trim())
    .filter(Boolean);

  if (!ids.length) return [];

  const details = await loadVideoDetails(ids, apiKey);
  const byId = new Map(details.map((video) => [video.videoId, video]));

  return ids
    .map((id) => byId.get(id))
    .filter((video) => video?.embeddable && !video?.madeForKids && !video?.ageRestricted);
}
