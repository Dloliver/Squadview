# SquadView PWA Install Phase 1.5

This patch keeps the current viewer intact and upgrades SquadView's installable-web-app experience.

## Adds

- Visible Install SquadView CTA on the public homepage.
- Existing viewer Install app control now uses the same install flow.
- Native browser PWA install prompt when available.
- Device-aware fallback instructions for iPhone/iPad, Android, Mac, Windows, and other desktops.
- Install controls hide when SquadView is already running as an installed standalone app.
- Analytics events:
  - `pwa_install_clicked`
  - `pwa_install_prompt_result`
  - `pwa_installed`
- Stable manifest app id and viewer shortcut.
- Service worker cache version bumped to v5.

## No database changes

No Supabase migration is required.
