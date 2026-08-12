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

    document.title = `${title} | SquadView`;
    if (description) descriptionTag?.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      if (description) descriptionTag?.setAttribute('content', previousDescription);
    };
  }, [title, description]);

  return (
    <div className="legal-shell">
      <header className="legal-topbar">
        <a className="brand" href="/"><span aria-hidden="true">◉</span>SquadView</a>
        <a className="legal-home-link" href="/">Back to SquadView</a>
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
