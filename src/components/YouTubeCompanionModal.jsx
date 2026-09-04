import { useState } from 'react';
import {
  isYouTubeSearchConfigured,
  lookupYouTubeVideo,
  searchYouTubeVideos,
} from '../services/youtubeService';

function friendlyError(error) {
  const code = String(error?.code || error?.message || '');
  if (code.includes('youtube_api_key_missing')) return 'YouTube search is not configured yet. Add the restricted YouTube Data API key to SquadView first.';
  if (code.includes('youtube_video_id_invalid')) return 'Enter a valid YouTube video link or video ID.';
  if (code.includes('youtube_video_not_found')) return 'That YouTube video could not be found.';
  if (code.includes('youtube_video_not_embeddable')) return 'That video does not allow playback on other websites.';
  if (code.includes('youtube_video_age_restricted')) return 'That video is age-restricted and YouTube only allows it to play on YouTube. Choose another Companion video.';
  if (code.includes('youtube_video_made_for_kids')) return 'Made for Kids videos are not supported in YouTube Companion yet.';
  if (code.includes('quotaExceeded') || code.includes('dailyLimitExceeded')) return 'YouTube search quota has been reached. Try again later.';
  if (code.includes('keyExpired')) return 'Google rejected the configured YouTube API key as expired. Verify the active key in Google Cloud, then restart SquadView.';
  if (code.includes('keyInvalid')) return 'Google rejected the configured YouTube API key. Verify the key and its YouTube Data API restriction, then restart SquadView.';
  return error?.message || 'YouTube Companion could not complete that request.';
}

export default function YouTubeCompanionModal({ existingVideo, isPremium, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleSearch(event) {
    event?.preventDefault?.();
    const cleaned = query.trim();
    if (!cleaned) return;

    setStatus('searching');
    setError('');
    try {
      const next = await searchYouTubeVideos(cleaned);
      setResults(next);
      setStatus('ready');
      if (!next.length) setError('No supported YouTube videos were found for that search. Age-restricted, Made for Kids, and non-embeddable videos are excluded.');
    } catch (requestError) {
      setResults([]);
      setStatus('error');
      setError(friendlyError(requestError));
    }
  }

  async function handleUrl(event) {
    event?.preventDefault?.();
    if (!videoUrl.trim()) return;

    setStatus('loading-url');
    setError('');
    try {
      const video = await lookupYouTubeVideo(videoUrl);
      onSelect(video);
    } catch (requestError) {
      setStatus('error');
      setError(friendlyError(requestError));
    }
  }

  const configured = isYouTubeSearchConfigured();

  return (
    <div className="modal-backdrop youtube-companion-backdrop" onClick={onClose}>
      <section className="modal youtube-companion-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close YouTube Companion">×</button>
        <div className="youtube-modal-heading">
          <span className="youtube-play-mark large" aria-hidden="true">▶</span>
          <div>
            <span className="modal-eyebrow">One companion video</span>
            <h2>{existingVideo ? 'Replace YouTube Companion' : 'Add YouTube Companion'}</h2>
          </div>
        </div>
        <p>Search YouTube or paste a video link, then keep one video beside your Twitch streams. No Google sign in is required.</p>

        {isPremium && (
          <div className="youtube-premium-note">
            <strong>Premium workspace</strong>
            <span>Your Premium account is ready for upcoming Second Screen and Multi Window Companion controls.</span>
          </div>
        )}

        {!configured && (
          <div className="youtube-config-note">
            YouTube Data API setup is required before search and playback validation can run.
          </div>
        )}

        <form className="youtube-search-form" onSubmit={handleSearch}>
          <label htmlFor="youtube-companion-search">Search YouTube</label>
          <div>
            <input
              id="youtube-companion-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search videos"
              autoComplete="off"
            />
            <button type="submit" className="primary-button" disabled={!configured || status === 'searching'}>
              {status === 'searching' ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        <div className="youtube-or"><span>or</span></div>

        <form className="youtube-url-form" onSubmit={handleUrl}>
          <label htmlFor="youtube-companion-url">YouTube link</label>
          <div>
            <input
              id="youtube-companion-url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              autoComplete="off"
            />
            <button type="submit" className="secondary-button" disabled={!configured || status === 'loading-url'}>
              {status === 'loading-url' ? 'Checking…' : 'Add'}
            </button>
          </div>
        </form>

        {error && <div className="account-error youtube-companion-error">{error}</div>}

        {results.length > 0 && (
          <div className="youtube-search-results" aria-label="YouTube search results">
            {results.map((video) => (
              <button
                type="button"
                className="youtube-search-result"
                key={video.videoId}
                onClick={() => onSelect(video)}
              >
                <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <span>
                  <small>YouTube</small>
                  <strong>{video.title}</strong>
                  <em>{video.channelTitle}</em>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="youtube-policy-links">
          <span>Powered by YouTube</span>
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a>
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy</a>
        </div>
      </section>
    </div>
  );
}
