import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout eyebrow="Your privacy" title="SquadView Privacy Policy"
      description="Read how SquadView handles local preferences, Twitch embeds, analytics, advertising, cookies, and privacy choices."
    >
      <p>SquadView is operated by Do More Business LLC. This policy describes information used when you visit squadview.app and use the SquadView multistream viewer.</p>

      <h2>Information stored on your device</h2>
      <p>SquadView stores saved channel groups, favorites, recently entered channels, interface preferences, and limited sponsor-screen timing information in browser storage. This information remains on your device unless you clear your browser data. SquadView does not currently provide cloud accounts or cloud synchronization.</p>

      <h2>Twitch video and chat</h2>
      <p>SquadView embeds Twitch video players and Twitch chat. When these embeds load, Twitch may receive information such as your IP address, browser and device information, requested channel, cookies, identifiers, and usage data. Twitch controls its own data practices, authentication, chat features, and content availability.</p>

      <h2>Advertising</h2>
      <p>SquadView may display advertisements on the home screen and during the transition into the viewer. Advertising providers may process IP address, browser, device, approximate location, cookie or advertising identifiers, ad impressions, and interactions. Where required, SquadView will request consent or provide privacy choices before personalized advertising or nonessential storage is enabled.</p>

      <h2>Analytics</h2>
      <p>SquadView may use analytics to understand broad product usage, performance, and errors. We do not intend to send Twitch chat messages, saved group names, or the contents of your local favorites to analytics providers. This policy will be updated when a production analytics provider is enabled.</p>

      <h2>Cookies and similar technologies</h2>
      <p>SquadView itself primarily uses localStorage and sessionStorage for product preferences and sponsor timing. Twitch, advertising providers, analytics providers, and hosting services may use cookies or similar technologies according to their own policies.</p>

      <h2>Children</h2>
      <p>SquadView is not directed to children under 13 and is not intended to collect personal information from children. Twitch content and account features remain subject to Twitch’s own age requirements and policies.</p>

      <h2>Your choices</h2>
      <p>You can remove locally stored SquadView information by clearing site data in your browser. Browser controls, device settings, and any available privacy-choice interface may also be used to limit cookies, personalized advertising, or analytics where applicable.</p>

      <h2>Contact</h2>
      <p>Privacy questions or requests may be submitted to Do More Business LLC through the contact options at <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
