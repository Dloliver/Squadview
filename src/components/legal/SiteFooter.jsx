export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <strong>SquadView</strong>
        <span>Watch together, wherever.</span>
      </div>
      <nav aria-label="SquadView information and support links">
        <a href="/about">About</a>
        <a href="/support">Help &amp; FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="https://domoreatl.com" target="_blank" rel="noreferrer">A Do More ATL product</a>
      </nav>
    </footer>
  );
}
