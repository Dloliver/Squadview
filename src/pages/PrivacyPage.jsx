import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout eyebrow="Your privacy" title="SquadView Privacy Policy"
      description="Read how SquadView handles account sync, local preferences, Twitch embeds, analytics, advertising, cookies, and privacy choices."
    >
      <p>SquadView is operated by Do More Business LLC. This policy describes information used when you visit squadview.app and use the SquadView multistream viewer.</p>

      <h2>Information stored on your device</h2>
      <p>SquadView uses browser storage for recent channel choices, interface state, favorites, viewer session continuity, and limited sponsor timing information. Clearing site data can remove information that is stored only on that device.</p>

      <h2>Optional Twitch sign in and account sync</h2>
      <p>You can use the core viewer without creating a SquadView account. If you choose to sign in with Twitch, SquadView uses Twitch authentication through its account provider and may store limited account information such as your Twitch user ID, Twitch login, display name, and avatar so the signed in experience can work across devices.</p>
      <p>Signed in users may sync SquadView product data such as favorites, recent channel groups, viewing preferences, and Saved Squads. Subscription status and Premium feature entitlements may also be associated with the signed in SquadView account. SquadView does not need your Twitch password.</p>

      <h2>Twitch video, follows, and chat</h2>
      <p>SquadView embeds Twitch video players and Twitch chat. When these embeds load, Twitch may receive information such as your IP address, browser and device information, requested channel, cookies, identifiers, and usage data. If you authorize Following Live, SquadView can read the channels you follow so it can show which of those channels are currently live. SquadView does not change your Twitch follows. Twitch controls its own data practices, authentication, chat features, and content availability.</p>

      <h2>YouTube Companion</h2>
      <p>SquadView may use YouTube API Services to let you search for and play one YouTube Companion video beside Twitch streams. Public search terms and video identifiers are sent to YouTube or Google so the requested results and playback eligibility can be returned. SquadView does not require Google sign in for this feature and does not request access to your YouTube account, subscriptions, watch history, or private YouTube data.</p>
      <p>When a YouTube player loads or you start playback, YouTube or Google may receive device, browser, IP address, referrer, cookie, identifier, playback, and interaction information according to their own policies. SquadView does not store YouTube search history in the SquadView account in this release. Use of YouTube features is also subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a> and the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>

      <h2>Advertising</h2>
      <p>SquadView may display advertising or sponsorship placements outside active stream content. Advertising providers may process information required to deliver and measure an ad, such as IP address, browser or device information, approximate location, cookie or advertising identifiers, impressions, and interactions, subject to applicable consent requirements. SquadView does not intend to provide advertising services with your Twitch follow list, Favorites, Saved Squad membership, Twitch chat messages, or Twitch profile information for ad targeting.</p>

      <h2>Analytics</h2>
      <p>SquadView uses analytics to understand broad product usage, performance, and feature adoption. Product events may include information such as device category, feature usage, or grouped stream counts. SquadView does not intend to send Twitch chat messages, Saved Squad names, Favorites, or Twitch channel names to analytics providers.</p>

      <h2>Cookies and similar technologies</h2>
      <p>SquadView uses localStorage and sessionStorage for product preferences and session continuity. Twitch, account infrastructure, advertising providers, analytics providers, and hosting services may use cookies or similar technologies according to their own policies and the permissions available in your browser.</p>

      <h2>Children</h2>
      <p>SquadView is not directed to children under 13 and is not intended to collect personal information from children. Twitch content and account features remain subject to Twitch’s own age requirements and policies.</p>

      <h2>Your choices</h2>
      <p>You can clear locally stored information through your browser. Signed in users can sign out of SquadView at any time. Browser controls, device settings, and available privacy choice interfaces may also be used to limit cookies, personalized advertising, or analytics where applicable.</p>

      <h2>Contact</h2>
      <p>Privacy questions or requests may be submitted to Do More Business LLC through the contact options at <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
