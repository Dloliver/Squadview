import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout eyebrow="Using SquadView" title="SquadView Terms of Use"
      description="Read the terms that apply when using SquadView, including Twitch and YouTube embeds, account features, saved data, availability, and intellectual property."
    >
      <p>These terms apply when you access or use SquadView, a product operated by Do More Business LLC.</p>

      <h2>Independent service</h2>
      <p>SquadView is an independent viewing interface and is not endorsed by or affiliated with Twitch unless explicitly stated. Twitch, channel names, streams, chat, and related content remain subject to Twitch’s terms, policies, availability, and creator rights.</p>

      <h2>Acceptable use</h2>
      <p>You may use SquadView only for lawful purposes. Do not attempt to disrupt the service, bypass provider restrictions, interfere with embeds, misuse chat, scrape protected information, or use SquadView in a way that violates Twitch rules or applicable law.</p>

      <h2>YouTube API Services</h2>
      <p>SquadView may offer a YouTube Companion using YouTube API Services and YouTube's embedded player. By using YouTube features in SquadView, you also agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>. YouTube content, playback, availability, advertising, and related functionality remain controlled by YouTube and the applicable content owners. See the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> for information about Google's data practices.</p>

      <h2>Accounts, Saved Squads, and local data</h2>
      <p>Some SquadView preferences remain in your browser. If you sign in with Twitch, eligible product data such as favorites, recent channel groups, viewing preferences, and Saved Squads may also be associated with your SquadView account for synchronization across devices. Local information can still be lost when browser data is cleared, and synchronized features may be unavailable if account services are interrupted.</p>

      <h2>Availability</h2>
      <p>Streams, chat, advertisements, and product features may be unavailable, delayed, changed, or discontinued. We may update SquadView to improve performance, safety, compliance, or the viewing experience.</p>

      <h2>Intellectual property</h2>
      <p>SquadView’s interface, branding, original code, and design are owned by Do More Business LLC or its licensors. Embedded Twitch and YouTube content belongs to its respective owners.</p>

      <h2>Disclaimer</h2>
      <p>SquadView is provided on an “as available” basis without guarantees that every stream, browser, device, embed, or feature will work without interruption. To the fullest extent permitted by law, Do More Business LLC is not responsible for third-party content, Twitch availability, lost local preferences, or indirect losses arising from use of the service.</p>

      <h2>Changes and contact</h2>
      <p>We may revise these terms by posting an updated version on this page. Questions may be submitted through <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
