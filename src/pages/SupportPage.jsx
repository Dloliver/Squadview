import LegalLayout from './LegalLayout';

export default function SupportPage() {
  return (
    <LegalLayout
      eyebrow="Help and contact"
      title="SquadView Help & FAQ"
      updated="August 12, 2026"
      description="Get help using SquadView, including Twitch stream loading, audio focus, favorites, installing the web app, privacy, and troubleshooting."
    >
      <p>SquadView is built to make multi stream Twitch viewing easier. These answers cover the most common questions about setting up a view, audio, favorites, installation, and troubleshooting.</p>

      <h2>How many streams can I add?</h2>
      <p>You can add up to eight Twitch channels to a viewing group. SquadView only loads the streams needed for the current layout, which helps keep the interface more manageable across different screen sizes.</p>

      <h2>How does audio work?</h2>
      <p>Twitch streams begin muted. Tap or click the stream you want to hear and SquadView gives that stream audio focus while the other visible streams remain muted. You can change the active stream whenever you want.</p>

      <h2>How does chat work?</h2>
      <p>SquadView displays Twitch chat for the currently focused stream. Chat itself is provided by Twitch, so Twitch account features, moderation, availability, and chat rules continue to apply.</p>

      <h2>Streams are not loading</h2>
      <p>Confirm the Twitch channel name is correct and that the channel is available. Ad blockers, strict tracking protection, VPN settings, or browser privacy extensions can sometimes block Twitch embeds. Refresh the page after changing those settings.</p>

      <h2>Favorites disappeared</h2>
      <p>Favorites are stored only on the current device and browser. Clearing site data, private browsing, reinstalling the PWA, or switching browsers can remove them.</p>

      <h2>Does SquadView host Twitch content?</h2>
      <p>No. SquadView provides the viewing interface and uses Twitch's embedded video and chat services. The streams, channel content, and chat remain hosted and controlled by Twitch and the individual creators.</p>

      <h2>Install SquadView</h2>
      <p>On iPhone, open SquadView in Safari, use the Share menu, and choose Add to Home Screen. On supported Android and desktop browsers, use the browser menu and choose Install app.</p>

      <h2>Report a problem</h2>
      <p>Include your device, browser, the number of streams in your group, and what happened. Contact Do More Business LLC through <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
