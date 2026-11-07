#!/usr/bin/env bash
# Final acceptance queue for the tester.
#
# Runs every final gate in a fixed order and keeps each exit code, so one
# failure cannot hide the rest:
#   1. vendor solver acceptance (including reference dimensions)
#   2. full app test:bible
#   3. Chromium non-VR, Firefox/WebKit smoke, then VR as a separate suite
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

log="${1:-/tmp/cadjs-final-gates.log}"
summary="${log%.log}.status"
: >"$log"
: >"$summary"

run_step() {
  local name="$1"
  shift
  echo "" | tee -a "$log"
  echo "===== $name =====" | tee -a "$log"
  "$@" >>"$log" 2>&1
  local code=$?
  echo "$name=$code" | tee -a "$summary"
  return "$code"
}

vendor=0
app=0
browser=0

(
  cd vendor/cadjs || exit 2
  npx vitest run tests/services/SketchSolverService.test.ts --reporter=verbose
) >>"$log" 2>&1
vendor=$?
echo "vendor-solver=$vendor" | tee -a "$summary"

run_step "test-bible" npm run test:bible || app=$?

CADJS_SKIP_VR=1 run_step "browser-non-vr" bash scripts/browser-gates.sh "${log%.log}.browser.log" || browser=$?

echo "" | tee -a "$log"
echo "===== final summary =====" | tee -a "$log"
cat "$summary" | tee -a "$log"
final=$((vendor || app || browser))
echo "final_exit=$final" | tee -a "$log"
exit "$final"
