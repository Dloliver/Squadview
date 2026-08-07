import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout eyebrow="Using SquadView" title="SquadView Terms of Use">
      <p>These terms apply when you access or use SquadView, a product operated by Do More Business LLC.</p>

      <h2>Independent service</h2>
      <p>SquadView is an independent viewing interface and is not endorsed by or affiliated with Twitch unless explicitly stated. Twitch, channel names, streams, chat, and related content remain subject to Twitch’s terms, policies, availability, and creator rights.</p>

      <h2>Acceptable use</h2>
      <p>You may use SquadView only for lawful purposes. Do not attempt to disrupt the service, bypass provider restrictions, interfere with embeds, misuse chat, scrape protected information, or use SquadView in a way that violates Twitch rules or applicable law.</p>

      <h2>Saved groups and local data</h2>
      <p>Favorites and channel groups are currently stored locally in your browser. They may be lost when you clear site data, change devices, use private browsing, or remove the installed web app. Do More Business LLC does not guarantee recovery of locally stored information.</p>

      <h2>Availability</h2>
      <p>Streams, chat, advertisements, and product features may be unavailable, delayed, changed, or discontinued. We may update SquadView to improve performance, safety, compliance, or the viewing experience.</p>

      <h2>Intellectual property</h2>
      <p>SquadView’s interface, branding, original code, and design are owned by Do More Business LLC or its licensors. Embedded Twitch content belongs to its respective owners.</p>

      <h2>Disclaimer</h2>
      <p>SquadView is provided on an “as available” basis without guarantees that every stream, browser, device, embed, or feature will work without interruption. To the fullest extent permitted by law, Do More Business LLC is not responsible for third-party content, Twitch availability, lost local preferences, or indirect losses arising from use of the service.</p>

      <h2>Changes and contact</h2>
      <p>We may revise these terms by posting an updated version on this page. Questions may be submitted through <a href="https://domoreatl.com" target="_blank" rel="noreferrer">domoreatl.com</a>.</p>
    </LegalLayout>
  );
}
