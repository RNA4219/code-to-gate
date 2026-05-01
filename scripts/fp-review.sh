#!/bin/bash
#
# fp-review.sh - Human FP Review Script for code-to-gate
#
# This script facilitates human review of findings to determine
# False Positive (FP) rate.
#
# Usage:
#   ./scripts/fp-review.sh <repo> [--phase phase1|phase2|phase3] [--out <dir>]
#
# Based on docs/product-acceptance-v1.md FP evaluation requirements:
# - Phase 1: FP rate <= 15%
# - Phase 2: FP rate <= 10%
# - Phase 3: FP rate <= 5%

set -e

# === Configuration ===

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_PHASE="phase1"
DEFAULT_OUT=".qh/fp-review"

# === Colors for output ===

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === Helper Functions ===

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_usage() {
    cat << EOF
Usage: $0 <repo> [options]

Arguments:
  repo                Repository path to analyze

Options:
  --phase <phase>     Target phase (phase1, phase2, phase3) [default: phase1]
  --out <dir>         Output directory [default: .qh/fp-review]
  --evaluator <name>  Evaluator name for documentation
  --skip-analyze      Skip analysis (use existing findings.json)
  --interactive       Interactive review mode (prompt for each finding)
  --help              Show this help message

FP Rate Targets:
  Phase 1: <= 15%
  Phase 2: <= 10%
  Phase 3: <= 5%

Examples:
  $0 fixtures/demo-shop-ts --phase phase1
  $0 ./repos/express-example --evaluator tech-lead --interactive
  $0 fixtures/demo-auth-js --skip-analyze --out .qh/fp-review-auth

Process:
  1. Run analysis on repo (unless --skip-analyze)
  2. Generate FP evaluation template
  3. [Interactive] Prompt for each finding classification
  4. Calculate FP rate
  5. Generate suppression recommendations if needed
  6. Output evaluation results
EOF
}

# === Parse Arguments ===

REPO=""
PHASE="$DEFAULT_PHASE"
OUT_DIR="$DEFAULT_OUT"
EVALUATOR="${USER:-unknown}"
SKIP_ANALYZE=false
INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --phase)
            PHASE="$2"
            shift 2
            ;;
        --out)
            OUT_DIR="$2"
            shift 2
            ;;
        --evaluator)
            EVALUATOR="$2"
            shift 2
            ;;
        --skip-analyze)
            SKIP_ANALYZE=true
            shift
            ;;
        --interactive)
            INTERACTIVE=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            print_usage
            exit 2
            ;;
        *)
            if [[ -z "$REPO" ]]; then
                REPO="$1"
            else
                log_error "Multiple repos specified"
                print_usage
                exit 2
            fi
            shift
            ;;
    esac
done

# === Validate Inputs ===

if [[ -z "$REPO" ]]; then
    log_error "Repository path is required"
    print_usage
    exit 2
fi

if [[ ! "$PHASE" =~ ^phase[123]$ ]]; then
    log_error "Invalid phase: $PHASE (must be phase1, phase2, or phase3)"
    exit 2
fi

REPO_PATH="$REPO"
if [[ ! -d "$REPO_PATH" ]]; then
    REPO_PATH="$PROJECT_ROOT/$REPO"
fi

if [[ ! -d "$REPO_PATH" ]]; then
    log_error "Repository not found: $REPO"
    exit 2
fi

# === FP Rate Targets ===
# Bash 3.2 compatible: use case statement instead of associative array

get_fp_target() {
    case "$1" in
        phase1) echo 15 ;;
        phase2) echo 10 ;;
        phase3) echo 5 ;;
        *) echo 15 ;;
    esac
}

TARGET=$(get_fp_target "$PHASE")
log_info "Target FP rate for $PHASE: <= ${TARGET}%"

# === Create Output Directory ===

ABS_OUT_DIR="$PROJECT_ROOT/$OUT_DIR"
mkdir -p "$ABS_OUT_DIR"

log_info "Output directory: $ABS_OUT_DIR"

# === Run Analysis (if needed) ===

FINDINGS_PATH="$ABS_OUT_DIR/findings.json"

if [[ "$SKIP_ANALYZE" == false ]]; then
    log_info "Running code-to-gate analyze on $REPO..."

    # Check if code-to-gate CLI is available
    if command -v code-to-gate &> /dev/null; then
        code-to-gate analyze "$REPO_PATH" --emit all --out "$ABS_OUT_DIR" --llm-mode none || true
    elif [[ -f "$PROJECT_ROOT/src/cli.js" ]]; then
        node "$PROJECT_ROOT/src/cli.js" analyze "$REPO_PATH" --out "$ABS_OUT_DIR" || true
    else
        log_error "code-to-gate CLI not found"
        exit 3
    fi

    log_success "Analysis complete"
else
    # Use existing findings.json from repo output directory
    EXISTING_FINDINGS="$REPO_PATH/.qh/findings.json"
    if [[ -f "$EXISTING_FINDINGS" ]]; then
        FINDINGS_PATH="$EXISTING_FINDINGS"
        log_info "Using existing findings: $FINDINGS_PATH"
    else
        log_error "No existing findings.json found at $EXISTING_FINDINGS"
        exit 3
    fi
fi

# === Check Findings ===

if [[ ! -f "$FINDINGS_PATH" ]]; then
    log_error "findings.json not found at $FINDINGS_PATH"
    exit 3
fi

FINDINGS_COUNT=$(jq '.findings | length' "$FINDINGS_PATH")
log_info "Total findings: $FINDINGS_COUNT"

if [[ "$FINDINGS_COUNT" -eq 0 ]]; then
    log_warning "No findings to evaluate"
    echo "FP rate: 0% (no findings)"
    exit 0
fi

# === Generate Evaluation Template ===

EVAL_ID="fp-eval-${PHASE}-$(date +%Y%m%d%H%M%S)"
EVAL_DATE=$(date +%Y-%m-%d)
TEMPLATE_PATH="$ABS_OUT_DIR/fp-evaluation-template.yaml"

log_info "Generating FP evaluation template..."

cat > "$TEMPLATE_PATH" << EOF
# FP Evaluation Template
# Fill in classification (TP/FP/Uncertain) for each finding
# TP = True Positive (correct finding)
# FP = False Positive (incorrect finding)
# Uncertain = Needs further investigation

evaluation_id: $EVAL_ID
repo: $REPO
evaluator: $EVALUATOR
date: $EVAL_DATE
phase: $PHASE

findings:
EOF

# Add each finding to template
jq -r '.findings[] | "  - finding_id: \(.id)\n    rule_id: \(.ruleId)\n    severity: \(.severity)\n    category: \(.category)\n    classification: \"\"  # TP, FP, or Uncertain\n    comment: \"\"  # Optional explanation"' "$FINDINGS_PATH" >> "$TEMPLATE_PATH"

log_success "Template generated: $TEMPLATE_PATH"

# === Interactive Review ===

REVIEW_PATH="$ABS_OUT_DIR/fp-evaluation.yaml"

if [[ "$INTERACTIVE" == true ]]; then
    log_info "Starting interactive review..."

    # Copy template as starting point
    cp "$TEMPLATE_PATH" "$REVIEW_PATH"

    # Interactive prompts for each finding
    FINDING_IDS=$(jq -r '.findings[].id' "$FINDINGS_PATH")
    FINDING_INDEX=0

    echo ""
    echo "========================================="
    echo "  Interactive FP Review"
    echo "========================================="
    echo ""
    echo "For each finding, enter classification:"
    echo "  T = TP (True Positive - correct finding)"
    echo "  F = FP (False Positive - incorrect finding)"
    echo "  U = Uncertain (needs investigation)"
    echo "  S = Skip (mark as uncertain)"
    echo ""

    TP_COUNT=0
    FP_COUNT=0
    UNCERTAIN_COUNT=0

    while IFS= read -r FINDING_ID; do
        FINDING_INDEX=$((FINDING_INDEX + 1))

        # Get finding details
        RULE_ID=$(jq -r '.findings[] | select(.id == "'$FINDING_ID'") | .ruleId' "$FINDINGS_PATH")
        SEVERITY=$(jq -r '.findings[] | select(.id == "'$FINDING_ID'") | .severity' "$FINDINGS_PATH")
        TITLE=$(jq -r '.findings[] | select(.id == "'$FINDING_ID'") | .title' "$FINDINGS_PATH")
        SUMMARY=$(jq -r '.findings[] | select(.id == "'$FINDING_ID'") | .summary' "$FINDINGS_PATH")

        echo -e "${YELLOW}[$FINDING_INDEX/$FINDINGS_COUNT]${NC} Finding: $FINDING_ID"
        echo "  Rule: $RULE_ID"
        echo "  Severity: $SEVERITY"
        echo "  Title: $TITLE"
        echo "  Summary: $SUMMARY"
        echo ""

        read -p "Classification (T/F/U/S): " -n 1 -r CLASSIFICATION
        echo ""

        case $CLASSIFICATION in
            T|t)
                CLASS="TP"
                TP_COUNT=$((TP_COUNT + 1))
                ;;
            F|f)
                CLASS="FP"
                FP_COUNT=$((FP_COUNT + 1))
                ;;
            U|u|S|s)
                CLASS="Uncertain"
                UNCERTAIN_COUNT=$((UNCERTAIN_COUNT + 1))
                ;;
            *)
                CLASS="Uncertain"
                UNCERTAIN_COUNT=$((UNCERTAIN_COUNT + 1))
                log_warning "Unknown input, marked as Uncertain"
                ;;
        esac

        # Update YAML file with classification
        # Using sed to replace the classification line for this finding
        sed -i "s/finding_id: $FINDING_ID\n    rule_id: $RULE_ID\n    severity: $SEVERITY\n    category: [^\n]*\n    classification: \"\"/finding_id: $FINDING_ID\n    rule_id: $RULE_ID\n    severity: $SEVERITY\n    category: [^\n]*\n    classification: $CLASS/" "$REVIEW_PATH"

        echo -e "  Classified as: ${GREEN}$CLASS${NC}"
        echo ""

        read -p "Comment (optional, press Enter to skip): " COMMENT
        if [[ -n "$COMMENT" ]]; then
            echo "  Comment: $COMMENT"
        fi
        echo ""
        echo "----------------------------------------"
    done <<< "$FINDING_IDS"

    # Calculate FP rate
    TOTAL=$((TP_COUNT + FP_COUNT + UNCERTAIN_COUNT))
    if [[ "$TOTAL" -gt 0 ]]; then
        FP_RATE=$(awk "BEGIN {printf \"%.2f\", ($FP_COUNT / $TOTAL) * 100}")
    else
        FP_RATE=0
    fi

    echo ""
    echo "========================================="
    echo "  Review Complete"
    echo "========================================="
    echo ""
    echo "Summary:"
    echo "  Total findings: $TOTAL"
    echo "  TP: $TP_COUNT"
    echo "  FP: $FP_COUNT"
    echo "  Uncertain: $UNCERTAIN_COUNT"
    echo "  FP Rate: ${FP_RATE}%"
    echo "  Target: <= ${TARGET}%"
    echo ""

    if (( FP_RATE <= TARGET )); then
        log_success "PASS - FP rate within target"
    elif (( FP_RATE <= TARGET + 5 )); then
        log_warning "CONDITIONAL PASS - FP rate slightly exceeds target"
    else
        log_error "FAIL - FP rate exceeds target by more than 5%"
    fi

    # Write summary to YAML
    cat >> "$REVIEW_PATH" << EOF

summary:
  total: $TOTAL
  tp: $TP_COUNT
  fp: $FP_COUNT
  uncertain: $UNCERTAIN_COUNT
  fp_rate: ${FP_RATE}
  target: $TARGET
EOF

    log_success "Review saved: $REVIEW_PATH"

else
    log_info "Non-interactive mode - template generated for manual review"
    log_info "Edit $TEMPLATE_PATH and run: $0 --skip-analyze --evaluator $EVALUATOR"
    echo ""
    echo "Next steps:"
    echo "1. Open $TEMPLATE_PATH"
    echo "2. Fill in classification (TP/FP/Uncertain) for each finding"
    echo "3. Save as $REVIEW_PATH"
    echo "4. Run evaluation: node $PROJECT_ROOT/src/cli.js fp-evaluate $REVIEW_PATH"
fi

# === Exit ===

log_info "FP review process complete"
exit 0