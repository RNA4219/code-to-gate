#!/bin/bash
# acceptance-phase1-mvp.sh
# MVP / release smoke acceptance commands
# Run from code-to-gate repo root

# Use relative paths - Windows bash has issues with /c/Users style paths
OUT_DIR=".qh/acceptance/mvp-smoke"
mkdir -p "$OUT_DIR"

# Initialize results file
echo "# MVP Acceptance Results" > "$OUT_DIR/results.yaml"
echo "date: $(date -Iseconds)" >> "$OUT_DIR/results.yaml"

echo "=== MVP / Release Smoke Acceptance ==="
echo "Date: $(date -Iseconds)"
echo "Output: $OUT_DIR"

# 1. npm run build
echo ">>> npm run build"
npm run build > "$OUT_DIR/build.log" 2>&1
BUILD_EXIT=$?
echo "build exit: $BUILD_EXIT" >> "$OUT_DIR/results.yaml"

# 2. readiness tests
echo ">>> readiness tests"
npx vitest run src/cli/__tests__/readiness.test.ts --reporter=dot > "$OUT_DIR/readiness.log" 2>&1
READINESS_EXIT=$?
echo "readiness exit: $READINESS_EXIT" >> "$OUT_DIR/results.yaml"

# 3. smoke tests
echo ">>> smoke tests"
npm run test:smoke -- --reporter=dot > "$OUT_DIR/smoke.log" 2>&1
SMOKE_EXIT=$?
echo "smoke exit: $SMOKE_EXIT" >> "$OUT_DIR/results.yaml"

# 4. release validate
echo ">>> release validate"
npm run release:validate > "$OUT_DIR/release-validate.log" 2>&1
RELEASE_EXIT=$?
echo "release-validate exit: $RELEASE_EXIT" >> "$OUT_DIR/results.yaml"

# 5. readiness demo-shop-ts
echo ">>> readiness demo-shop-ts"
node ./dist/cli.js readiness fixtures/demo-shop-ts --policy fixtures/policies/strict.yaml --out "$OUT_DIR/readiness-demo" > "$OUT_DIR/readiness-demo.log" 2>&1
READINESS_DEMO_EXIT=$?
echo "readiness-demo exit: $READINESS_DEMO_EXIT" >> "$OUT_DIR/results.yaml"

# Summary
echo ""
echo "=== Summary ==="
cat "$OUT_DIR/results.yaml"

echo ""
echo "=== MVP Acceptance Complete ==="
echo "All tests passed if all exits are 0 (except readiness-demo which expects 1 for blocked_input)"