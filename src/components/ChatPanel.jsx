export default function ChatPanel({ channel, compact = false }) {
  const parent = window.location.hostname;
  const src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(parent)}&darkpopout`;

  return (
    <section className={`chat-panel ${compact ? 'is-compact' : ''}`}>
      <iframe title={`${channel} chat`} src={src} allow="clipboard-write" />
    </section>
  );
}
