import { useEffect, useState } from 'react';
import HomeAdSlot from '../components/ads/HomeAdSlot';
import FooterAdSlot from '../components/ads/FooterAdSlot';
import SiteFooter from '../components/legal/SiteFooter';
import InstallSquadView from '../components/InstallSquadView';

const features = [
  {
    title: 'Eight streams free, sixteen with Premium',
    text: 'Start with up to eight Twitch streams in one viewing session. Premium accounts can expand the same viewer to sixteen streams for larger crews and events.',
  },
  {
    title: 'Following Live from Twitch',
    text: 'Sign in with Twitch and SquadView can show the creators you already follow who are live now, so you can build a view without retyping every channel name.',
  },
  {
    title: 'Native Twitch chat',
    text: 'Signed in viewers can read and send Twitch chat inside SquadView with the same Twitch account. You can also switch back to the Twitch embedded chat whenever you prefer it.',
  },
  {
    title: 'Saved Squads',
    text: 'Save reusable creator groups and bring them back when members are live again. Free accounts can keep up to three Saved Squads, while Premium removes that limit.',
  },
  {
    title: 'Share the exact view',
    text: 'Share Squad creates a link for the Twitch lineup you are watching so someone else can open the same group without rebuilding it channel by channel.',
  },
  {
    title: 'YouTube Companion',
    text: 'Add one supported YouTube video beside your Twitch streams for events, reactions, music, guides, or anything else that belongs in the same viewing session.',
  },
  {
    title: 'Grid, Chat, Solo, and audio control',
    text: 'Move between the full grid, a stream with chat, or Solo focus. On desktop, Listen can keep the sound you want without forcing the layout to reshuffle.',
  },
  {
    title: 'Install SquadView',
    text: 'Install the web app on supported phones and computers for faster return access while keeping the same SquadView viewer you already use in the browser.',
  },
];

const twitchTools = [
  {
    title: 'Following Live',
    text: 'Connect Twitch once and use the creators you already follow as a faster way to build the next SquadView.',
  },
  {
    title: 'Your Twitch identity in chat',
    text: 'Use SquadView native chat to read and send messages from the Twitch account you connected to SquadView.',
  },
  {
    title: 'Saved Squads',
    text: 'Keep recurring creator groups attached to your SquadView account instead of rebuilding the same lineup each time.',
  },
  {
    title: 'Favorites and viewer preferences',
    text: 'Keep the channels and viewing choices you return to most often close at hand while you move through SquadView.',
  },
];

const faqs = [
  {
    question: 'How many Twitch channels can I add?',
    answer: 'The Free plan supports up to eight Twitch streams in one viewing session. Premium expands the viewer to as many as sixteen streams.',
  },
  {
    question: 'Do I need a SquadView account?',
    answer: 'No. You can build a Twitch view without signing in. Connecting Twitch adds Following Live, Saved Squads, SquadView native chat, and account based preferences.',
  },
  {
    question: 'Can I use my Twitch account in chat?',
    answer: 'Yes. Signed in users can use SquadView native Twitch chat to read and send messages from their connected Twitch account. The Twitch embedded chat remains available as another option.',
  },
  {
    question: 'Can I share the SquadView I am watching?',
    answer: 'Yes. Share Squad creates a link containing the current Twitch lineup and active stream so another viewer can open the same group.',
  },
  {
    question: 'What is YouTube Companion?',
    answer: 'YouTube Companion lets you place one supported YouTube video beside your Twitch streams inside the same SquadView viewing session.',
  },
  {
    question: 'Can I install SquadView?',
    answer: 'Yes on supported browsers and devices. SquadView includes a web app install flow and also explains the Add to Home Screen steps used on iPhone and iPad.',
  },
  {
    question: 'Does SquadView host the streams?',
    answer: 'No. Twitch provides the video and chat content. YouTube provides Companion video content. SquadView provides the layout, controls, navigation, saving, sharing, and viewing experience around them.',
  },
  {
    question: 'Is SquadView affiliated with Twitch?',
    answer: 'SquadView is an independent product. Twitch remains the provider of Twitch stream and chat content, and SquadView is not endorsed by or affiliated with Twitch unless explicitly stated.',
  },
];

const modalLabels = {
  how: 'How SquadView works',
  features: 'SquadView viewing tools',
  twitch: 'Twitch connected tools',
  faq: 'SquadView FAQ',
};

function setMeta(name, content) {
  const tag = document.querySelector(`meta[name="${name}"]`);
  if (tag) tag.setAttribute('content', content);
}

function DetailModal({ modal, onClose }) {
  if (!modal) return null;

  return (
    <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="marketing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-modal-title"
      >
        <header className="marketing-modal-header">
          <div>
            <span className="marketing-section-label">Learn more</span>
            <h2 id="marketing-modal-title">{modalLabels[modal]}</h2>
          </div>
          <button className="marketing-modal-close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </header>

        <div className="marketing-modal-body">
          {modal === 'how' && (
            <>
              <p className="marketing-modal-intro">SquadView is built around one simple idea: keep the group visible, then move your attention without rebuilding the whole setup.</p>
              <div className="marketing-modal-steps">
                <article><span>01</span><div><h3>Build the lineup</h3><p>Type Twitch channel names directly, use favorites, or sign in with Twitch and build from creators you already follow.</p></div></article>
                <article><span>02</span><div><h3>Choose how you want to watch</h3><p>Use Grid for the full picture, Chat when the conversation matters, or Solo when one stream deserves the screen.</p></div></article>
                <article><span>03</span><div><h3>Control the sound and focus</h3><p>Choose the stream you want to hear, move focus when the moment changes, and keep the rest of the group ready around it.</p></div></article>
                <article><span>04</span><div><h3>Save it or send it</h3><p>Signed in users can save recurring Squads, and any viewer can share the current Twitch lineup with someone else.</p></div></article>
              </div>
            </>
          )}

          {modal === 'features' && (
            <div className="marketing-modal-grid">
              {features.map((feature, index) => (
                <article key={feature.title}>
                  <span className="feature-number">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          )}

          {modal === 'twitch' && (
            <div className="marketing-modal-grid uses">
              {twitchTools.map((item) => (
                <article key={item.title}>
                  <span className="marketing-modal-icon" aria-hidden="true">✦</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          )}

          {modal === 'faq' && (
            <div className="marketing-modal-faq">
              {faqs.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}<span aria-hidden="true">+</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
              <div className="marketing-help-link">Need more help? <a href="/support">Visit Help and FAQ</a>.</div>
            </div>
          )}
        </div>

        <footer className="marketing-modal-footer">
          <button type="button" onClick={onClose}>Close</button>
          <a href="/">Open SquadView <span aria-hidden="true">→</span></a>
        </footer>
      </section>
    </div>
  );
}

export default function HomePage() {
  const [modal, setModal] = useState(null);

  useEffect(() => {
    document.title = 'SquadView — Watch Your Twitch Squad in One View';
    setMeta('description', 'Watch up to eight Twitch streams free in one SquadView. Connect Twitch for Following Live, Saved Squads, native chat, sharing, and more. Premium supports up to sixteen streams.');

    const canonical = document.querySelector('link[rel="canonical"]');
    canonical?.setAttribute('href', 'https://squadview.app/learn');
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', 'https://squadview.app/learn');
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', 'SquadView — Watch Your Twitch Squad in One View');
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', 'Watch several Twitch streams together, connect your Twitch account, save Squads, chat, share the view, and add a YouTube Companion.');
  }, []);

  useEffect(() => {
    if (!modal) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setModal(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [modal]);

  return (
    <div className="marketing-shell">
      <header className="marketing-topbar">
        <a className="marketing-brand" href="/" aria-label="SquadView home">
          <span aria-hidden="true">◉</span>
          <strong>SquadView</strong>
        </a>
        <nav className="marketing-nav" aria-label="SquadView navigation">
          <button type="button" onClick={() => setModal('how')}>How it works</button>
          <button type="button" onClick={() => setModal('twitch')}>Twitch connected</button>
          <button type="button" onClick={() => setModal('features')}>Features</button>
          <button type="button" onClick={() => setModal('faq')}>FAQ</button>
        </nav>
        <a className="marketing-open-button" href="/">Open SquadView <span aria-hidden="true">→</span></a>
      </header>

      <main>
        <section className="marketing-hero" aria-labelledby="marketing-hero-title">
          <div className="marketing-hero-copy">
            <span className="marketing-kicker"><i aria-hidden="true" /> Your Twitch crew in one workspace</span>
            <h1 id="marketing-hero-title">Watch the whole squad without chasing tabs.</h1>
            <p>Start free with up to eight Twitch streams in one responsive view. Connect Twitch to see Following Live, save your regular Squads, and chat from your Twitch account. When the lineup is right, share the exact view with everyone else.</p>
            <div className="marketing-hero-actions">
              <a className="marketing-primary-cta" href="/">Open SquadView <span aria-hidden="true">→</span></a>
              <InstallSquadView className="marketing-secondary-cta marketing-install-cta" label="Install SquadView" source="homepage_hero" />
              <button className="marketing-secondary-cta" type="button" onClick={() => setModal('how')}>See how it works</button>
            </div>
            <ul className="marketing-hero-facts" aria-label="SquadView highlights">
              <li><strong>8 free</strong><span>Twitch streams</span></li>
              <li><strong>16 Premium</strong><span>For larger Squads</span></li>
              <li><strong>Twitch sign in</strong><span>Following, saves, chat</span></li>
            </ul>
          </div>

          <figure className="marketing-product-preview marketing-product-preview-real">
            <img
              src="/squadview-grid-chat-preview.webp"
              alt="SquadView desktop Grid and Chat view with three Twitch streams and a Twitch chat panel."
              loading="eager"
              fetchPriority="high"
            />
            <figcaption>Keep several live perspectives visible, move your sound and focus when the moment changes, and bring chat into the same workspace.</figcaption>
          </figure>
        </section>

        <section className="marketing-intro marketing-intro-compact" aria-labelledby="why-squadview-heading">
          <div>
            <span className="marketing-section-label">Why SquadView</span>
            <h2 id="why-squadview-heading">The viewer has grown beyond a multi stream grid.</h2>
          </div>
          <div className="marketing-intro-copy">
            <p>SquadView now connects the parts of group viewing that normally live in different places. Build from Twitch creators you follow, keep reusable Squads, control the sound, use Twitch chat, add one YouTube Companion, and share the lineup without sending everyone a list of tabs.</p>
            <p>You can still jump in without an account. Connecting Twitch simply turns SquadView into a more personal workspace that is easier to return to.</p>
          </div>
        </section>

        <HomeAdSlot />

        <section className="marketing-explore" aria-labelledby="explore-heading">
          <div className="marketing-explore-heading">
            <span className="marketing-section-label">Explore SquadView</span>
            <h2 id="explore-heading">Start simple. Use more when you need it.</h2>
            <p>The homepage stays compact, while the details behind the current SquadView experience are one click away.</p>
          </div>
          <div className="marketing-explore-grid">
            <button type="button" onClick={() => setModal('how')}>
              <span>01</span><strong>How it works</strong><small>Build a lineup, choose the right view, control the sound, then save or share it.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('twitch')}>
              <span>02</span><strong>Twitch connected</strong><small>Following Live, native Twitch chat, Saved Squads, favorites, and account based preferences.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('features')}>
              <span>03</span><strong>Viewing tools</strong><small>Eight streams free, sixteen with Premium, YouTube Companion, sharing, install support, and more.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('faq')}>
              <span>04</span><strong>Questions</strong><small>Plans, Twitch sign in, chat, sharing, YouTube Companion, installation, and device support.</small><b>Open details →</b>
            </button>
          </div>
        </section>

        <section className="marketing-trust-strip" aria-label="SquadView product details">
          <article>
            <span className="marketing-section-label">Free to start</span>
            <h3>Build a view with up to eight Twitch streams.</h3>
            <p>No SquadView account is required to open the viewer and start building a lineup.</p>
            <a href="/">Open the viewer →</a>
          </article>
          <article>
            <span className="marketing-section-label">Connect Twitch</span>
            <h3>Your follows, Saved Squads, and Twitch chat can come with you.</h3>
            <p>Sign in when you want a faster and more personal way to move through the creators you already watch.</p>
            <button type="button" onClick={() => setModal('twitch')} className="marketing-trust-action">See connected tools →</button>
          </article>
          <article>
            <span className="marketing-section-label">Share and return</span>
            <h3>Send the lineup or install SquadView for later.</h3>
            <p>Share the exact Twitch group you are watching, or install the web app on supported devices for quicker return access.</p>
            <InstallSquadView className="marketing-trust-action" label="Install SquadView →" source="homepage_trust" />
          </article>
          <article>
            <span className="marketing-section-label">Premium headroom</span>
            <h3>Expand to sixteen streams and unlimited Saved Squads.</h3>
            <p>Premium also removes SquadView supplied advertising while Twitch and YouTube keep control of their own players.</p>
            <button type="button" onClick={() => setModal('features')} className="marketing-trust-action">See Premium features →</button>
          </article>
        </section>

        <FooterAdSlot />

        <section className="marketing-final-cta marketing-final-cta-compact" aria-labelledby="final-cta-heading">
          <span className="marketing-section-label">Ready when the Squad goes live</span>
          <h2 id="final-cta-heading">Put the streams, chat, and moments you care about in one view.</h2>
          <p>Open SquadView, build the Twitch lineup you want, and let the viewer handle the rest of the workspace.</p>
          <a href="/">Open SquadView <span aria-hidden="true">→</span></a>
        </section>
      </main>

      <SiteFooter />
      <DetailModal modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}
