#!/usr/bin/env bash
# Thin POSIX wrapper for precision-review@v1.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PHASE="phase1"; OUT_DIR=".qh/fp-review"; EVALUATOR=""; SKIP_ANALYZE=false; INTERACTIVE=false; REPO=""
usage() { echo "Usage: $0 <repo> [--phase phase1|phase2|phase3] [--out dir] [--evaluator id] [--skip-analyze] [--interactive]"; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="${2:?missing phase}"; shift 2;;
    --out) OUT_DIR="${2:?missing out}"; shift 2;;
    --evaluator) EVALUATOR="${2:?missing evaluator}"; shift 2;;
    --skip-analyze) SKIP_ANALYZE=true; shift;;
    --interactive) INTERACTIVE=true; shift;;
    --help|-h) usage; exit 0;;
    -*) echo "Unknown option: $1" >&2; usage; exit 2;;
    *) [[ -z "$REPO" ]] || { echo "Multiple repos specified" >&2; exit 2; }; REPO="$1"; shift;;
  esac
done
[[ -n "$REPO" ]] || { echo "Repository path is required" >&2; usage; exit 2; }
[[ "$PHASE" =~ ^phase[123]$ ]] || { echo "Invalid phase: $PHASE" >&2; exit 2; }
if "$INTERACTIVE" && [[ -z "$EVALUATOR" ]]; then echo "--evaluator is required for a human interactive review" >&2; exit 2; fi
[[ -n "$EVALUATOR" ]] || EVALUATOR="local-ai"
echo "Legacy phase context: $PHASE (precision reportability comes from review classifications)"
REPO_PATH="$REPO"; [[ -d "$REPO_PATH" ]] || REPO_PATH="$PROJECT_ROOT/$REPO"
[[ -d "$REPO_PATH" ]] || { echo "Repository not found: $REPO" >&2; exit 2; }
if [[ "$OUT_DIR" = /* || "$OUT_DIR" =~ ^[A-Za-z]:[\\/].* ]]; then ABS_OUT_DIR="$OUT_DIR"; else ABS_OUT_DIR="$PROJECT_ROOT/$OUT_DIR"; fi
FINDINGS_PATH="$ABS_OUT_DIR/findings.json"; REVIEW_PATH="$ABS_OUT_DIR/review.json"; SUMMARY_PATH="$ABS_OUT_DIR/summary.json"
[[ ! -e "$REVIEW_PATH" && ! -e "$SUMMARY_PATH" ]] || { echo "Review output already exists; choose a new --out" >&2; exit 2; }
mkdir -p "$ABS_OUT_DIR"
if "$SKIP_ANALYZE"; then
  [[ -f "$REPO_PATH/.qh/findings.json" ]] || { echo "No existing findings.json found" >&2; exit 3; }
  cp "$REPO_PATH/.qh/findings.json" "$FINDINGS_PATH"
else
  node "$PROJECT_ROOT/dist/cli.js" analyze "$REPO_PATH" --emit all --out "$ABS_OUT_DIR" --llm-provider deterministic --llm-mode local-only
fi
REVIEWER_KIND="ai"; "$INTERACTIVE" && REVIEWER_KIND="human"
node "$PROJECT_ROOT/scripts/precision-review.mjs" create --from "$FINDINGS_PATH" --out "$REVIEW_PATH" --reviewer "$EVALUATOR" --reviewer-kind "$REVIEWER_KIND" --repo "$REPO_PATH"
if "$INTERACTIVE"; then
  exec 3<&0
  while IFS= read -r finding; do
    id=$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$finding")
    rule=$(node -e 'console.log(JSON.parse(process.argv[1]).ruleId)' "$finding")
    printf 'Finding %s [%s]\n' "$id" "$rule"
    read -r -u 3 -p 'Classification (T/F/U/A): ' answer
    case "$answer" in T|t) class="TP";; F|f) class="FP";; A|a) class="AcceptedDesign";; *) class="Uncertain";; esac
    read -r -u 3 -p 'Comment (optional): ' comment
    update_args=(--from "$REVIEW_PATH" --findings "$FINDINGS_PATH" --out "$REVIEW_PATH" --force --finding-id "$id" --classification "$class")
    update_args+=(--comment "$comment")
    node "$PROJECT_ROOT/scripts/precision-review.mjs" update "${update_args[@]}"
  done < <(node -e 'for (const x of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).findings) console.log(JSON.stringify(x))' "$FINDINGS_PATH")
fi
node "$PROJECT_ROOT/scripts/precision-review.mjs" summarize --from "$FINDINGS_PATH" --review "$REVIEW_PATH" --out "$SUMMARY_PATH"
echo "Precision review: $REVIEW_PATH"
echo "Summary: $SUMMARY_PATH"
