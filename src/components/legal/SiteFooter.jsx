export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <strong>SquadView</strong>
        <span>Watch together, wherever.</span>
      </div>
      <nav aria-label="Legal and support links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/support">Support</a>
        <a href="https://domoreatl.com" target="_blank" rel="noreferrer">A Do More ATL product</a>
      </nav>
    </footer>
  );
}
