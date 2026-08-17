import { useEffect } from 'react';
import SiteFooter from '../components/legal/SiteFooter';

export default function LegalLayout({
  eyebrow,
  title,
  updated = 'August 6, 2026',
  description = '',
  children,
}) {
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
    if (description) descriptionTag?.setAttribute('content', description);
    canonical?.setAttribute('href', pageUrl);
    ogUrl?.setAttribute('content', pageUrl);

    return () => {
      document.title = previousTitle;
      if (description) descriptionTag?.setAttribute('content', previousDescription);
      canonical?.setAttribute('href', previousCanonical);
      ogUrl?.setAttribute('content', previousOgUrl);
    };
  }, [title, description]);

  return (
    <div className="legal-shell">
      <header className="legal-topbar">
        <a className="brand" href="/"><span aria-hidden="true">◉</span>SquadView</a>
        <div className="legal-header-links"><a className="legal-home-link" href="/">SquadView home</a><a className="legal-home-link is-primary" href="/watch">Open viewer</a></div>
      </header>
      <main className="legal-main">
        <section className="legal-heading">
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>Last updated: {updated}</p>
        </section>
        <article className="legal-card">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}
