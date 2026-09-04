import { useEffect, useMemo, useRef } from 'react';

function buildEmbedUrl(videoId) {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
}

function sendPlayerCommand(iframe, func) {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args: [],
    }), 'https://www.youtube-nocookie.com');
  } catch {
    // Native YouTube controls remain available even if JS control is unavailable.
  }
}

export default function YouTubeCompanion({ video, visible, onReplace, onRemove, isPremium, tileOrder }) {
  const iframeRef = useRef(null);
  const embedUrl = useMemo(() => buildEmbedUrl(video.videoId), [video.videoId]);

  useEffect(() => {
    if (!visible) sendPlayerCommand(iframeRef.current, 'pauseVideo');
  }, [visible]);

  return (
    <article
      className={`youtube-companion-card ${visible ? 'is-visible' : 'is-hidden'}`}
      aria-label={`YouTube Companion: ${video.title}`}
      style={Number.isFinite(tileOrder) ? { order: tileOrder } : undefined}
    >
      <header className="youtube-companion-header">
        <div className="youtube-companion-brand">
          <span className="youtube-play-mark" aria-hidden="true">▶</span>
          <div>
            <strong>YouTube Companion</strong>
            <small>{isPremium ? 'Premium workspace' : 'Companion video'}</small>
          </div>
        </div>
        <div className="youtube-companion-actions">
          <button type="button" onClick={onReplace}>Replace</button>
          <button type="button" className="youtube-companion-remove" onClick={onRemove} aria-label="Remove YouTube Companion">×</button>
        </div>
      </header>

      <div className="youtube-companion-meta">
        <strong title={video.title}>{video.title}</strong>
        <span>{video.channelTitle}</span>
      </div>

      <div className="youtube-companion-player">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={`${video.title} — YouTube`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </article>
  );
}
