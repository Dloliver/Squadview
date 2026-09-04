# SquadView Install Experience Phase 1.8

This patch changes every Install SquadView entry point into a benefit-first install flow.

## Behavior

1. Clicking Install SquadView always opens the SquadView branded benefits modal first.
2. Chrome / Edge / supported Android browsers: if the native PWA prompt is available, the modal's Install SquadView button opens it.
3. iPhone / iPad: the modal explains that Apple uses Add to Home Screen and provides the Safari steps.
4. Browsers without an available one-tap install path show a clear availability message instead of misleading install instructions.
5. Already-installed PWA sessions continue to hide the install CTA.

## Analytics

Adds / preserves:
- pwa_install_modal_opened
- pwa_install_clicked
- pwa_install_prompt_result
- pwa_install_ios_steps_viewed
- pwa_install_unavailable
- pwa_installed

## Files

- src/components/InstallSquadView.jsx
- src/styles.css

No Supabase migration is required.
