import LegalLayout from './LegalLayout';

export default function SupportPage() {
  return (
    <LegalLayout eyebrow="Help and contact" title="SquadView Support">
      <h2>Streams are not loading</h2>
      <p>Confirm the Twitch channel name is correct and that the channel is available. Ad blockers, strict tracking protection, VPN settings, or browser privacy extensions can sometimes block Twitch embeds. Refresh the page after changing those settings.</p>

      <h2>No audio</h2>
      <p>Twitch streams begin muted. Tap or click the stream you want to hear. SquadView keeps all non-focused streams muted by design.</p>

      <h2>Favorites disappeared</h2>
      <p>Favorites are stored only on the current device and browser. Clearing site data, private browsing, reinstalling the PWA, or switching browsers can remove them.</p>

      <h2>Install SquadView</h2>
      <p>On iPhone, open SquadView in Safari, use the Share menu, and choose Add to Home Screen. On supported Android and desktop browsers, use the browser menu and choose Install app.</p>

      <h2>Report a problem</h2>
      <p>Include your device, browser, the number of streams in your group, and what happened. Contact Do More Business LLC through <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
