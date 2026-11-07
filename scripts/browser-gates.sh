#!/usr/bin/env bash
# Browser acceptance runner for the tester.
#
# VR is deliberately a separate step: the non-VR Chromium suite must never
# include e2e/vr-*.spec.ts. Each step writes its own exit code so one failure
# does not hide the others.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

log="${1:-/tmp/cadjs-browser-gates.log}"
: >"$log"
summary="${log%.log}.status"
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

non_vr_files=$(find e2e -maxdepth 1 -name '*.spec.ts' ! -name 'vr-*' | sort)
read -r -a non_vr_specs <<<"$(echo "$non_vr_files" | tr '\n' ' ')"

echo "non-VR specs:" | tee -a "$log"
printf '  %s\n' "${non_vr_specs[@]}" | tee -a "$log"

nonvr=0
vr=0

run_step "chromium-non-vr" npx playwright test "${non_vr_specs[@]}" --project=chromium --reporter=line || nonvr=$?
run_step "firefox-smoke" npx playwright test --project=firefox --reporter=line || nonvr=$?
run_step "webkit-smoke" npx playwright test --project=webkit --reporter=line || nonvr=$?
run_step "vr-all" npx playwright test e2e/vr-*.spec.ts --reporter=line || vr=$?

echo "" | tee -a "$log"
echo "===== summary =====" | tee -a "$log"
cat "$summary" | tee -a "$log"
echo "tester_exit=$((nonvr || vr))" | tee -a "$log"
exit $((nonvr || vr))
