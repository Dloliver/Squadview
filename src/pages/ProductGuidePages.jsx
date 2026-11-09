import { useEffect, useMemo, useState } from 'react';
import SiteFooter from '../components/legal/SiteFooter';
import {
  FEATURE_SECTIONS,
  LATEST_RELEASE_ID,
  RELEASE_NOTES,
  ROADMAP,
  UPDATES_SEEN_KEY,
} from '../content/squadViewGuide';
import './productGuidePages.css';

function isUnreadRelease() {
  try { return Boolean(LATEST_RELEASE_ID && window.localStorage.getItem(UPDATES_SEEN_KEY) !== LATEST_RELEASE_ID); }
  catch { return false; }
}

export function UpdatesNavLink({ className = '' }) {
  const [newRelease] = useState(isUnreadRelease);
  return (
    <a className={`${className} sv-guide-updates-link`} href="/updates">
      What's New {newRelease && <span className="sv-guide-new" aria-label="New updates available">New</span>}
    </a>
  );
}

function useProductPageMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute('content') || '';
    const canonical = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute('href') || '';
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const previousOgUrl = ogUrl?.getAttribute('content') || '';
    const pageUrl = `https://squadview.app${window.location.pathname}`;
    document.title = `${title} | SquadView`;
    descriptionTag?.setAttribute('content', description);
    canonical?.setAttribute('href', pageUrl);
    ogUrl?.setAttribute('content', pageUrl);
    return () => {
      document.title = previousTitle;
      descriptionTag?.setAttribute('content', previousDescription);
      canonical?.setAttribute('href', previousCanonical);
      ogUrl?.setAttribute('content', previousOgUrl);
    };
  }, [title, description]);
}

function GuideShell({ active, kicker, title, subtitle, children }) {
  return (
    <div className="sv-guide-shell">
      <header className="sv-guide-header">
        <div className="sv-guide-header-inner">
          <a href="/" className="sv-guide-brand" aria-label="SquadView home"><span className="sv-guide-brand-mark">◉</span> SquadView</a>
          <nav className="sv-guide-header-nav" aria-label="Explore SquadView">
            <a className={active === 'features' ? 'is-active' : ''} aria-current={active === 'features' ? 'page' : undefined} href="/features">Features</a>
            <a className={active === 'updates' ? 'is-active' : ''} aria-current={active === 'updates' ? 'page' : undefined} href="/updates">What's New</a>
            <a href="/dashboard">Streamer Setup</a>
            <a className="sv-guide-open" href="/watch">Open Viewer <span aria-hidden="true">↗</span></a>
          </nav>
        </div>
      </header>
      <main className="sv-guide-main">
        <section className="sv-guide-hero">
          <span className="sv-guide-kicker"><i aria-hidden="true" /> {kicker}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="sv-guide-hero-actions">
            <a href="/features" className={active === 'features' ? 'sv-guide-pill is-selected' : 'sv-guide-pill'}>Explore features</a>
            <a href="/updates" className={active === 'updates' ? 'sv-guide-pill is-selected' : 'sv-guide-pill'}>Read release notes</a>
          </div>
        </section>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function AccessLabel({ access }) {
  const className = access === 'Premium' ? 'is-premium' : access === 'Tournament beta' ? 'is-beta' : access === 'Everyone' ? 'is-everyone' : '';
  return <span className={`sv-guide-access ${className}`}>{access}</span>;
}

export function FeaturesPage() {
  useProductPageMeta('All Features', 'Explore SquadView viewing, Twitch, chat, Creator Studio, Tournament Studio, and Premium features.');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const normalizedSearch = search.trim().toLowerCase();
  const groups = useMemo(() => FEATURE_SECTIONS
    .filter(section => category === 'all' || section.id === category)
    .map(section => ({
      ...section,
      features: section.features.filter(feature => !normalizedSearch || [section.title, section.description, feature.title, feature.description, feature.how, feature.access].join(' ').toLowerCase().includes(normalizedSearch)),
    }))
    .filter(section => section.features.length > 0), [category, normalizedSearch]);
  const displayedCount = groups.reduce((sum, group) => sum + group.features.length, 0);
  const fullCount = FEATURE_SECTIONS.reduce((sum, group) => sum + group.features.length, 0);

  return (
    <GuideShell active="features" kicker="The SquadView field guide" title="Everything you can do in SquadView." subtitle="New here? Or have you been using the app for a while? Find the features, access requirements, and quick instructions in one place.">
      <section className="sv-guide-stats" aria-label="SquadView at a glance">
        <div><strong>8</strong><span>Twitch channels on Free</span></div>
        <div><strong>16</strong><span>Channels on Premium</span></div>
        <div><strong>{fullCount}</strong><span>Features to explore</span></div>
        <div><strong>1</strong><span>Supported YouTube Companion</span></div>
      </section>

      <div className="sv-guide-content-heading">
        <div><span className="sv-guide-eyebrow">Find your tools</span><h2>Browse the feature library</h2></div>
        <span className="sv-guide-count">{displayedCount} of {fullCount} features</span>
      </div>
      <div className="sv-guide-searchbar">
        <label htmlFor="sv-feature-search">Search features</label>
        <div className="sv-guide-search-wrap"><span aria-hidden="true">⌕</span><input id="sv-feature-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try audio, YouTube, chat, locks, tournaments..." /></div>
      </div>
      <nav className="sv-guide-filters" aria-label="Feature categories">
        <button type="button" className={category === 'all' ? 'is-active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All features</button>
        {FEATURE_SECTIONS.map(section => <button key={section.id} type="button" className={category === section.id ? 'is-active' : ''} aria-pressed={category === section.id} onClick={() => setCategory(section.id)}>{section.title}</button>)}
      </nav>

      {groups.length ? groups.map(group => (
        <section className="sv-guide-feature-section" key={group.id} id={`section-${group.id}`} aria-labelledby={`sv-section-${group.id}`}>
          <div className="sv-guide-feature-group-heading">
            <div><span className="sv-guide-eyebrow">{group.eyebrow}</span><h2 id={`sv-section-${group.id}`}>{group.title}</h2><p>{group.description}</p></div>
            <span>{group.features.length} {group.features.length === 1 ? 'feature' : 'features'}</span>
          </div>
          <div className="sv-guide-feature-grid">
            {group.features.map(feature => (
              <article className="sv-guide-feature-card" key={feature.id} id={`feature-${feature.id}`}>
                <div className="sv-guide-feature-card-top"><span className="sv-guide-feature-dot" aria-hidden="true" /><AccessLabel access={feature.access} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <div className="sv-guide-how"><strong>How to use it</strong><span>{feature.how}</span></div>
              </article>
            ))}
          </div>
        </section>
      )) : <div className="sv-guide-empty" role="status"><h2>No matching features</h2><p>Try a different search or show all categories.</p><button type="button" onClick={() => { setSearch(''); setCategory('all'); }}>Show all features</button></div>}

      <section className="sv-guide-roadmap" aria-labelledby="sv-roadmap-title">
        <div className="sv-guide-content-heading"><div><span className="sv-guide-eyebrow">Coming later</span><h2 id="sv-roadmap-title">Features we're exploring</h2></div></div>
        <p>These are roadmap ideas, not tools we are claiming are already released.</p>
        <div className="sv-guide-roadmap-grid">{ROADMAP.map(item => <article key={item.title}><span>Planned</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
      </section>
      <div className="sv-guide-bottom-cta"><div><strong>Ready to get the Squad together?</strong><p>Start watching or browse the latest improvements.</p></div><div><a href="/watch">Open SquadView</a><a href="/updates">What's New</a></div></div>
    </GuideShell>
  );
}

function formatReleaseDate(dateString) {
  const d = new Date(`${dateString}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dateString : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function releaseSummaryText(release) {
  return [`SquadView ${release.version}: ${release.title}`, release.summary, ...release.highlights.map(item => `• ${item.title}: ${item.text}`), '', 'See all updates: https://squadview.app/updates'].join('\n');
}

export function UpdatesPage() {
  useProductPageMeta("What's New", 'SquadView product updates, release notes, stream viewer improvements, and feature changes.');
  const [copyState, setCopyState] = useState('');
  useEffect(() => { try { window.localStorage.setItem(UPDATES_SEEN_KEY, LATEST_RELEASE_ID); } catch { /* Public update history works without storage. */ } }, []);
  async function copyRelease(release) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access unavailable');
      await navigator.clipboard.writeText(releaseSummaryText(release));
      setCopyState(release.id);
    } catch { setCopyState('unavailable'); }
  }
  return (
    <GuideShell active="updates" kicker="Release history" title="What's new with SquadView." subtitle="The improvements we're shipping, why they matter, and how to use them. Every release note describes a change to the product, not a future promise.">
      <div className="sv-guide-updates-intro"><div><span className="sv-guide-eyebrow">Latest release</span><h2>Built with viewers in mind.</h2><p>Our release history starts with recent confirmed updates. Older feature development is documented in the Features library.</p></div><a href="/features">Explore all features <span aria-hidden="true">→</span></a></div>
      <div className="sv-guide-release-list">
        {RELEASE_NOTES.map((release, index) => (
          <article className={`sv-guide-release-card ${index === 0 ? 'is-latest' : ''}`} key={release.id} id={release.id}>
            <div className="sv-guide-release-meta"><span className="sv-guide-release-version">{release.version}</span><span>{release.label}</span><time dateTime={release.date}>{formatReleaseDate(release.date)}</time>{index === 0 && <span className="sv-guide-release-latest">Latest</span>}</div>
            <h2>{release.title}</h2>
            <p className="sv-guide-release-summary">{release.summary}</p>
            <div className="sv-guide-release-changes">{release.highlights.map(item => <div key={item.title}><span className="sv-guide-release-check" aria-hidden="true">✓</span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}</div>
            {release.notes && <p className="sv-guide-release-note"><strong>Good to know:</strong> {release.notes}</p>}
            <div className="sv-guide-release-footer"><button type="button" onClick={() => copyRelease(release)}>{copyState === release.id ? 'Copied to clipboard' : 'Copy shareable summary'}</button>{copyState === 'unavailable' && <span role="status">Clipboard unavailable. You can select and copy the notes above.</span>}</div>
          </article>
        ))}
      </div>
      <div className="sv-guide-bottom-cta"><div><strong>Want to see what SquadView can do today?</strong><p>Browse each feature and where to find it.</p></div><div><a href="/features">Explore all features</a><a href="/watch">Open viewer</a></div></div>
    </GuideShell>
  );
}
