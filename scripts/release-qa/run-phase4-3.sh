#!/usr/bin/env bash
set -uo pipefail
cd "${1:-/Users/dennisoliver/Dev/SquadView/Squadview}" || exit 1
if [ "$(git rev-parse HEAD 2>/dev/null)" != "63360b79ccc2b92a1eba5ed1acf9b6b3af1cdc2c" ]; then echo 'STOP: unexpected baseline'; exit 1; fi
if [ ! -f scripts/verify-premium-identity-phase4-3-1.mjs ]; then echo 'STOP: QA verifier not installed'; exit 1; fi
RUN_DIR="$(mktemp -d)" || exit 1
BASELINE="$RUN_DIR/baseline"
mkdir -p "$BASELINE"
echo "Full QA logs: $RUN_DIR"
echo '===== PHASE 4.3 + SUPPORTED LEGACY SUITES ====='
FAILED=0
for script in \
 scripts/verify-premium-identity-phase4-3-1.mjs \
 scripts/verify-individual-stream-refresh-phase4-3-2.mjs \
 scripts/verify-viewer-reorder-phase4-3-3.mjs \
 scripts/verify-phase4-3-4.mjs \
 scripts/verify-paid-premium-phase4.mjs \
 scripts/verify-premium-account-modal-phase4-0-3.mjs \
 scripts/verify-premium-billing-phase4-1.mjs \
 scripts/verify-premium-billing-runtime-phase4-1-1.mjs \
 scripts/verify-premium-billing-runtime-phase4-1-2.mjs \
 scripts/verify-premium-billing-lifecycle-phase4-2.mjs \
 scripts/verify-premium-billing-flexible-phase4-2-1.mjs \
 scripts/verify-premium-stripe-environment-phase4-2-2.mjs \
 scripts/verify-mobile-playback-phase3-1.mjs \
 scripts/verify-mobile-listen-gesture-phase3-1-4.mjs \
 scripts/verify-mobile-manager-chat-audio-phase3.mjs \
 scripts/verify-viewer-transition-audio-sync.mjs
 do
 echo "--- $script"
 if [ ! -f "$script" ]; then echo 'FAIL missing script'; FAILED=$((FAILED+1)); continue; fi
 if node "$script" > "$RUN_DIR/$(basename "$script").log" 2>&1; then echo 'PASS'; else echo 'FAIL'; tail -20 "$RUN_DIR/$(basename "$script").log"; FAILED=$((FAILED+1)); fi
 done
 echo '===== BASELINE LEGACY COMPARISON ====='
 if ! git archive 63360b7 | tar -xf - -C "$BASELINE"; then echo 'STOP unable to export baseline'; exit 1; fi
 LEGACY_DIFF=0
 for script in \
 scripts/verify-viewer-audio-controller.mjs \
 scripts/verify-desktop-audio-independence.mjs \
 scripts/verify-chat-pinned-stream.mjs \
 scripts/verify-chat-pin-audio-remove.mjs \
 scripts/verify-viewer-focus-chat-audio.mjs \
 scripts/verify-viewer-modes-cleanup.mjs
 do
   name="$(basename "$script")"
   (cd "$BASELINE" && node "$script") > "$RUN_DIR/baseline-$name.log" 2>&1; baseline_status=$?
   node "$script" > "$RUN_DIR/current-$name.log" 2>&1; current_status=$?
   # Compare the meaningful test failures, not absolute paths or formatting.
   grep -E '^([[:space:]]*FAIL|[[:space:]]*missing:)' "$RUN_DIR/baseline-$name.log" | sed 's/[[:space:]]\+/ /g' > "$RUN_DIR/baseline-$name.fail" || true
   grep -E '^([[:space:]]*FAIL|[[:space:]]*missing:)' "$RUN_DIR/current-$name.log" | sed 's/[[:space:]]\+/ /g' > "$RUN_DIR/current-$name.fail" || true
   if [ "$baseline_status" = "$current_status" ] && cmp -s "$RUN_DIR/baseline-$name.fail" "$RUN_DIR/current-$name.fail"; then
     echo "UNCHANGED LEGACY: $name (exit=$current_status)"
   else
     echo "CHANGED LEGACY: $name (baseline=$baseline_status current=$current_status)"
     diff -u "$RUN_DIR/baseline-$name.fail" "$RUN_DIR/current-$name.fail" || true
     LEGACY_DIFF=$((LEGACY_DIFF+1))
   fi
 done
 echo '===== BUILD + DIFF ====='
 git diff --check || FAILED=$((FAILED+1))
 npm run build || FAILED=$((FAILED+1))
 echo '===== SUMMARY ====='
 echo "New/current failures: $FAILED; changed legacy suites: $LEGACY_DIFF"
 echo "Logs: $RUN_DIR"
 echo 'No commit, push, DB actions or deployment performed.'
 if [ "$FAILED" -ne 0 ] || [ "$LEGACY_DIFF" -ne 0 ]; then exit 1; fi
 echo 'PASS: Phase 4.3 release verification passed with six documented baseline legacy exceptions.'
