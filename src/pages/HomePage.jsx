import { useEffect, useState } from 'react';
import HomeAdSlot from '../components/ads/HomeAdSlot';
import FooterAdSlot from '../components/ads/FooterAdSlot';
import SiteFooter from '../components/legal/SiteFooter';

const features = [
  {
    title: 'One view for several channels',
    text: 'Build a viewing group with up to eight Twitch channels. SquadView organizes the channels into a responsive layout so you can follow several perspectives without keeping a row of browser tabs open.',
  },
  {
    title: 'Audio focus without reshuffling',
    text: 'Choose the stream you want to hear while the rest of your layout stays in place. Changing audio focus does not force you to rebuild the grid or lose track of where each creator is positioned.',
  },
  {
    title: 'Grid, chat, and solo views',
    text: 'Use Grid when you want the broad picture, Chat when you want the focused Twitch conversation beside the action, and Solo when one channel deserves the full screen.',
  },
  {
    title: 'Favorites that stay simple',
    text: 'Save favorite streamers in the browser you are already using. SquadView does not require an account just to remember the channels you return to most often.',
  },
];

const useCases = [
  {
    title: 'Tournaments and competitive play',
    text: 'Follow different players, teams, commentators, or event feeds while a match is happening. Keep the wider event visible and move your audio attention when the story changes.',
  },
  {
    title: 'Creator collaborations',
    text: 'When several creators are live together, one point of view rarely tells the whole story. SquadView keeps the participating channels close so you can move between perspectives without leaving the page.',
  },
  {
    title: 'Communities and friend groups',
    text: 'Keep several familiar creators or friends in one view during a shared gaming session, community event, or casual night of streaming.',
  },
  {
    title: 'Live events with several angles',
    text: 'Use a single workspace when an event has multiple hosts, stages, interviews, or reactions happening at the same time.',
  },
];

const faqs = [
  {
    question: 'How many Twitch channels can I add?',
    answer: 'SquadView supports up to eight Twitch channels in one viewing group. The interface shows the streams that fit the current layout and lets you move through the rest when needed.',
  },
  {
    question: 'Does SquadView host the streams?',
    answer: 'No. Twitch provides the video and chat through its embedded services. SquadView provides the surrounding layout, audio focus, navigation, favorites, and responsive viewing controls.',
  },
  {
    question: 'Do I need a SquadView account?',
    answer: 'No account is required to build a view. Favorite streamers and recent channel choices are stored locally in your browser so you can return to them on that device.',
  },
  {
    question: 'Can I choose which stream has sound?',
    answer: 'Yes. Select the stream you want to hear and SquadView gives that channel audio focus while the other visible streams remain muted.',
  },
  {
    question: 'Does it work on phones and computers?',
    answer: 'Yes. SquadView is designed for phones, tablets, laptops, and desktop displays. The controls and layouts adapt to the available screen size.',
  },
  {
    question: 'Is SquadView affiliated with Twitch?',
    answer: 'SquadView is an independent product. Twitch remains the provider of embedded stream and chat content, and SquadView is not endorsed by or affiliated with Twitch unless explicitly stated.',
  },
];

const modalLabels = {
  how: 'How SquadView works',
  features: 'Viewing controls',
  uses: 'When SquadView helps',
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
              <p className="marketing-modal-intro">SquadView separates the layout from your attention. Your grid can stay stable while you decide which stream gets sound, chat, or a full screen view.</p>
              <div className="marketing-modal-steps">
                <article><span>01</span><div><h3>Add your channels</h3><p>Enter the Twitch channel names you want to follow or use streamers you have already saved as favorites in your browser.</p></div></article>
                <article><span>02</span><div><h3>Choose the right view</h3><p>Use Grid for several perspectives, Chat when the conversation matters, or Solo when you want to concentrate on one creator.</p></div></article>
                <article><span>03</span><div><h3>Control the sound</h3><p>Select the channel you want to hear. Other visible streams remain muted and stay in position until you intentionally change the page or layout.</p></div></article>
              </div>
            </>
          )}

          {modal === 'features' && (
            <div className="marketing-modal-grid">
              {features.map((feature, index) => (
                <article key={feature.title}>
                  <span className="feature-number">0{index + 1}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          )}

          {modal === 'uses' && (
            <div className="marketing-modal-grid uses">
              {useCases.map((item) => (
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
          <a href="/watch">Open SquadView <span aria-hidden="true">→</span></a>
        </footer>
      </section>
    </div>
  );
}

export default function HomePage() {
  const [modal, setModal] = useState(null);

  useEffect(() => {
    document.title = 'SquadView — Watch Multiple Twitch Streams in One View';
    setMeta('description', 'SquadView helps you organize multiple Twitch streams in one responsive view with grid, chat, solo viewing, audio focus, and browser based favorites.');

    const canonical = document.querySelector('link[rel="canonical"]');
    canonical?.setAttribute('href', 'https://squadview.app/');
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', 'https://squadview.app/');
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', 'SquadView — Watch Multiple Twitch Streams in One View');
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', 'Organize several Twitch channels in one responsive workspace and choose the stream you want to hear.');
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
          <button type="button" onClick={() => setModal('features')}>Features</button>
          <button type="button" onClick={() => setModal('uses')}>Use cases</button>
          <button type="button" onClick={() => setModal('faq')}>FAQ</button>
        </nav>
        <a className="marketing-open-button" href="/watch">Open SquadView <span aria-hidden="true">→</span></a>
      </header>

      <main>
        <section className="marketing-hero" aria-labelledby="marketing-hero-title">
          <div className="marketing-hero-copy">
            <span className="marketing-kicker"><i aria-hidden="true" /> One workspace for the streams you follow</span>
            <h1 id="marketing-hero-title">Watch more of the moment without switching tabs.</h1>
            <p>SquadView organizes multiple Twitch channels into one responsive viewing workspace. Keep several perspectives visible, choose the stream you want to hear, and bring the relevant Twitch chat into focus when you need it.</p>
            <div className="marketing-hero-actions">
              <a className="marketing-primary-cta" href="/watch">Open SquadView <span aria-hidden="true">→</span></a>
              <button className="marketing-secondary-cta" type="button" onClick={() => setModal('how')}>See how it works</button>
            </div>
            <ul className="marketing-hero-facts" aria-label="SquadView highlights">
              <li><strong>Up to 8</strong><span>Twitch channels</span></li>
              <li><strong>3 views</strong><span>Grid, Chat, Solo</span></li>
              <li><strong>No account</strong><span>Required to start</span></li>
            </ul>
          </div>

          <figure className="marketing-product-preview marketing-product-preview-real">
            <img
              src="/squadview-grid-chat-preview.webp"
              alt="SquadView desktop Grid and Chat view with three Twitch streams and one Twitch chat panel."
              loading="eager"
              fetchPriority="high"
            />
            <figcaption>Grid + Chat keeps several live perspectives visible while the selected Twitch chat stays in the fourth panel.</figcaption>
          </figure>
        </section>

        <section className="marketing-intro marketing-intro-compact" aria-labelledby="why-squadview-heading">
          <div>
            <span className="marketing-section-label">Why SquadView</span>
            <h2 id="why-squadview-heading">One live moment can have several perspectives.</h2>
          </div>
          <div className="marketing-intro-copy">
            <p>Watching several creators at once usually means opening more tabs, deciding which player should have sound, and repeatedly moving between video and chat. SquadView gives those streams a shared workspace while Twitch continues to provide the stream and chat content.</p>
            <p>Keep the layout stable, move your attention when the moment changes, and open the details below only when you want to learn more.</p>
          </div>
        </section>

        <HomeAdSlot />

        <section className="marketing-explore" aria-labelledby="explore-heading">
          <div className="marketing-explore-heading">
            <span className="marketing-section-label">Explore SquadView</span>
            <h2 id="explore-heading">The details are here when you want them.</h2>
            <p>Choose a topic to learn more without turning the homepage into a long read.</p>
          </div>
          <div className="marketing-explore-grid">
            <button type="button" onClick={() => setModal('how')}>
              <span>01</span><strong>How it works</strong><small>Add channels, choose a view, then control which stream gets your attention.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('features')}>
              <span>02</span><strong>Viewing controls</strong><small>Grid, Chat, Solo, favorites, and audio focus designed for multi stream viewing.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('uses')}>
              <span>03</span><strong>When it helps</strong><small>Tournaments, collaborations, community streams, and live events with several angles.</small><b>Open details →</b>
            </button>
            <button type="button" onClick={() => setModal('faq')}>
              <span>04</span><strong>Questions</strong><small>Channel limits, devices, accounts, Twitch embeds, sound control, and more.</small><b>Open details →</b>
            </button>
          </div>
        </section>

        <section className="marketing-trust-strip" aria-label="SquadView product details">
          <article>
            <span className="marketing-section-label">Simple by design</span>
            <h3>No SquadView account is required to start.</h3>
            <p>Favorites and recent channel choices stay in your browser on that device.</p>
            <a href="/privacy">Privacy policy →</a>
          </article>
          <article>
            <span className="marketing-section-label">Independent product</span>
            <h3>Twitch provides the embedded video and chat.</h3>
            <p>SquadView provides the layout, focus controls, navigation, and viewing experience around them.</p>
            <a href="/about">About SquadView →</a>
          </article>
        </section>

        <FooterAdSlot />

        <section className="marketing-final-cta marketing-final-cta-compact" aria-labelledby="final-cta-heading">
          <span className="marketing-section-label">Ready when the streams are</span>
          <h2 id="final-cta-heading">Put the channels you want to follow in one view.</h2>
          <p>Open the viewer, add your Twitch channels, and choose the layout that fits what is happening now.</p>
          <a href="/watch">Open SquadView <span aria-hidden="true">→</span></a>
        </section>
      </main>

      <SiteFooter />
      <DetailModal modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}
