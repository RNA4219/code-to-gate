#!/bin/bash
#
# Real Repository Test Script for code-to-gate Phase 1
# Tests code-to-gate against public repositories to validate:
# - scan/analyze/readiness execution
# - exit code correctness (0 or 1)
# - schema validation for generated artifacts
#
# Usage:
#   ./scripts/real-repo-test.sh [--clean] [--repo <name>]
#
# Options:
#   --clean    Remove cloned repos after testing
#   --repo     Test specific repo only (express, nextjs, typescript)
#
# Requirements from docs/product-acceptance-v1.md:
#   - 3+ public repos (100-500 files)
#   - scan/analyze/readiness execution
#   - exit code 0 or 1
#   - schema validation pass
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEMP_DIR="${PROJECT_ROOT}/.real-repo-temp"
RESULTS_DIR="${PROJECT_ROOT}/.real-repo-results"
CTG_CLI="${PROJECT_ROOT}/dist/cli.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test repositories configuration.
# Keep this Bash 3.2 compatible for macOS runners; associative arrays are not
# available in the system bash shipped with macOS.
ALL_REPOS=("express" "nextjs" "typescript")

get_repo_config() {
    case "$1" in
        express) echo "https://github.com/expressjs/express.git|backend|expressjs/express" ;;
        nextjs) echo "https://github.com/vercel/next.js.git|frontend|vercel/next.js (examples only)" ;;
        typescript) echo "https://github.com/microsoft/TypeScript.git|library|microsoft/TypeScript" ;;
        *) return 1 ;;
    esac
}

get_expected_exit() {
    case "$1" in
        express|nextjs) echo "0_or_1" ;;
        typescript) echo "0" ;;
        *) return 1 ;;
    esac
}

iso_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Parse arguments
CLEAN_AFTER=false
SPECIFIC_REPO=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_AFTER=true
            shift
            ;;
        --repo)
            SPECIFIC_REPO="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

check_cli() {
    if [[ ! -f "$CTG_CLI" ]]; then
        log_fail "CLI not found at $CTG_CLI"
        log_info "Run 'npm run build' first"
        exit 1
    fi
}

count_files() {
    local dir="$1"
    local count=$(find "$dir" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) 2>/dev/null | wc -l)
    echo "$count"
}

validate_exit_code() {
    local actual="$1"
    local expected="$2"
    local repo="$3"

    if [[ "$expected" == "0_or_1" ]]; then
        if [[ "$actual" == "0" || "$actual" == "1" ]]; then
            log_success "Exit code $actual matches expected (0 or 1)"
            return 0
        else
            log_fail "Exit code $actual does not match expected (0 or 1)"
            return 1
        fi
    else
        if [[ "$actual" == "$expected" ]]; then
            log_success "Exit code $actual matches expected $expected"
            return 0
        else
            log_fail "Exit code $actual does not match expected $expected"
            return 1
        fi
    fi
}

run_schema_validation() {
    local output_dir="$1"
    local repo="$2"
    local failures=0

    log_info "Running schema validation for $repo..."

    # Core artifacts
    for artifact in "repo-graph.json" "findings.json" "risk-register.yaml" "test-seeds.json" "release-readiness.json" "audit.json"; do
        local artifact_path="${output_dir}/${artifact}"
        if [[ -f "$artifact_path" ]]; then
            node "$CTG_CLI" schema validate "$artifact_path" 2>/dev/null
            local exit_code=$?
            if [[ $exit_code -eq 0 ]]; then
                log_success "Schema validation: $artifact"
            else
                log_fail "Schema validation: $artifact (exit code $exit_code)"
                failures=$((failures + 1))
            fi
        else
            log_warn "Artifact not found: $artifact"
        fi
    done

    return $failures
}

clone_repo() {
    local repo_name="$1"
    local repo_url="$2"
    local target_dir="$3"

    log_info "Cloning $repo_name..."

    if [[ -d "$target_dir" ]]; then
        log_info "Repository already cloned at $target_dir"
        return 0
    fi

    # Clone with depth 1 for faster download
    git clone --depth 1 "$repo_url" "$target_dir" 2>/dev/null

    if [[ $? -eq 0 ]]; then
        log_success "Cloned $repo_name successfully"
        return 0
    else
        log_fail "Failed to clone $repo_name"
        return 1
    fi
}

test_repo() {
    local repo_name="$1"
    local repo_config="$2"
    local expected_exit
    expected_exit="$(get_expected_exit "$repo_name")"

    IFS='|' read -r repo_url repo_type repo_desc <<< "$repo_config"

    local repo_dir="${TEMP_DIR}/${repo_name}"
    local output_dir="${RESULTS_DIR}/${repo_name}"

    log_info "========================================"
    log_info "Testing repository: $repo_desc"
    log_info "Type: $repo_type"
    log_info "========================================"

    # Clone repository
    clone_repo "$repo_name" "$repo_url" "$repo_dir" || return 1

    # Prepare test directory (handle special cases)
    local test_dir="$repo_dir"
    if [[ "$repo_name" == "nextjs" ]]; then
        test_dir="${repo_dir}/examples"
        if [[ ! -d "$test_dir" ]]; then
            log_warn "Examples directory not found, using full repo"
            test_dir="$repo_dir"
        fi
    fi

    # Count files
    local file_count=$(count_files "$test_dir")
    log_info "File count: $file_count TS/JS files"

    # Check file count is in reasonable range
    if [[ $file_count -lt 10 ]]; then
        log_warn "Very few files ($file_count). Repository may be too small for meaningful test."
    elif [[ $file_count -gt 5000 ]]; then
        log_warn "Many files ($file_count). Test may take longer."
    fi

    # Create output directory
    mkdir -p "$output_dir"

    # Test 1: Scan
    log_info "--- Test: scan ---"
    local scan_output="${output_dir}/scan"
    mkdir -p "$scan_output"

    local start_time=$(date +%s)
    node "$CTG_CLI" scan "$test_dir" --out "$scan_output" 2>&1
    local scan_exit=$?
    local end_time=$(date +%s)
    local scan_duration=$((end_time - start_time))

    log_info "Scan duration: ${scan_duration}s"

    if [[ $scan_exit -eq 0 ]]; then
        log_success "scan: exit code 0"
    else
        log_fail "scan: exit code $scan_exit (expected 0)"
    fi

    # Verify repo-graph.json was created
    if [[ -f "${scan_output}/repo-graph.json" ]]; then
        log_success "repo-graph.json created"
    else
        log_fail "repo-graph.json not created"
    fi

    # Test 2: Analyze
    log_info "--- Test: analyze ---"
    local analyze_output="${output_dir}/analyze"
    mkdir -p "$analyze_output"

    start_time=$(date +%s)
    node "$CTG_CLI" analyze "$test_dir" --emit all --out "$analyze_output" --llm-mode none 2>&1
    local analyze_exit=$?
    end_time=$(date +%s)
    local analyze_duration=$((end_time - start_time))

    log_info "Analyze duration: ${analyze_duration}s"

    validate_exit_code "$analyze_exit" "$expected_exit" "$repo_name"
    local analyze_valid=$?

    # Test 3: Readiness
    log_info "--- Test: readiness ---"
    local readiness_output="${output_dir}/readiness"
    mkdir -p "$readiness_output"

    start_time=$(date +%s)
    node "$CTG_CLI" readiness "$test_dir" --out "$readiness_output" --llm-mode none 2>&1
    local readiness_exit=$?
    end_time=$(date +%s)
    local readiness_duration=$((end_time - start_time))

    log_info "Readiness duration: ${readiness_duration}s"

    validate_exit_code "$readiness_exit" "$expected_exit" "$repo_name"
    local readiness_valid=$?

    # Test 4: Schema Validation
    log_info "--- Test: schema validation ---"
    run_schema_validation "$analyze_output" "$repo_name"
    local schema_valid=$?

    if [[ $schema_valid -eq 0 ]]; then
        log_success "All schema validations passed"
    else
        log_fail "$schema_valid schema validation failures"
    fi

    # Generate test summary
    log_info "--- Summary for $repo_name ---"

    local total_tests=4
    local passed=0

    [[ $scan_exit -eq 0 ]] && passed=$((passed + 1))
    [[ $analyze_valid -eq 0 ]] && passed=$((passed + 1))
    [[ $readiness_valid -eq 0 ]] && passed=$((passed + 1))
    [[ $schema_valid -eq 0 ]] && passed=$((passed + 1))

    echo "Tests passed: $passed / $total_tests"
    echo "File count: $file_count"
    echo "Scan duration: ${scan_duration}s (target: <= 30s)"
    echo "Analyze duration: ${analyze_duration}s (target: <= 60s)"

    # Performance check
    if [[ $scan_duration -gt 30 ]]; then
        log_warn "Scan duration exceeds 30s target"
    fi
    if [[ $analyze_duration -gt 60 ]]; then
        log_warn "Analyze duration exceeds 60s target"
    fi

    # Write results to YAML file
    local results_file="${RESULTS_DIR}/${repo_name}-results.yaml"
    cat > "$results_file" << EOF
# Real repo test results for $repo_name
repo: $repo_desc
type: $repo_type
date: $(iso_timestamp)
file_count: $file_count

tests:
  scan:
    exit_code: $scan_exit
    expected: 0
    result: $([[ $scan_exit -eq 0 ]] && echo "pass" || echo "fail")
    duration_seconds: $scan_duration
    target_seconds: 30
    performance_result: $([[ $scan_duration -le 30 ]] && echo "pass" || echo "fail")

  analyze:
    exit_code: $analyze_exit
    expected: $expected_exit
    result: $([[ $analyze_valid -eq 0 ]] && echo "pass" || echo "fail")
    duration_seconds: $analyze_duration
    target_seconds: 60
    performance_result: $([[ $analyze_duration -le 60 ]] && echo "pass" || echo "fail")

  readiness:
    exit_code: $readiness_exit
    expected: $expected_exit
    result: $([[ $readiness_valid -eq 0 ]] && echo "pass" || echo "fail")
    duration_seconds: $readiness_duration

  schema_validation:
    failures: $schema_valid
    result: $([[ $schema_valid -eq 0 ]] && echo "pass" || echo "fail")

summary:
  tests_passed: $passed
  tests_total: $total_tests
  overall_result: $([[ $passed -eq $total_tests ]] && echo "pass" || echo "fail")
EOF

    log_info "Results written to: $results_file"

    return $([[ $passed -eq $total_tests ]] && echo 0 || echo 1)
}

# Main execution
main() {
    log_info "=========================================="
    log_info "code-to-gate Real Repository Test - Phase 1"
    log_info "=========================================="

    check_cli

    # Create directories
    mkdir -p "$TEMP_DIR"
    mkdir -p "$RESULTS_DIR"

    # Determine which repos to test
    local repos_to_test=()

    if [[ -n "$SPECIFIC_REPO" ]]; then
        if get_repo_config "$SPECIFIC_REPO" >/dev/null; then
            repos_to_test+=("$SPECIFIC_REPO")
        else
            log_fail "Unknown repo: $SPECIFIC_REPO"
            log_info "Available repos: ${ALL_REPOS[*]}"
            exit 1
        fi
    else
        repos_to_test=("${ALL_REPOS[@]}")
    fi

    log_info "Repositories to test: ${repos_to_test[@]}"

    local total_passed=0
    local total_failed=0

    for repo_name in "${repos_to_test[@]}"; do
        local repo_config
        repo_config="$(get_repo_config "$repo_name")"
        test_repo "$repo_name" "$repo_config"
        if [[ $? -eq 0 ]]; then
            total_passed=$((total_passed + 1))
        else
            total_failed=$((total_failed + 1))
        fi
    done

    # Final summary
    log_info "=========================================="
    log_info "FINAL RESULTS"
    log_info "=========================================="
    echo "Repositories tested: ${repos_to_test[@]}"
    echo "Passed: $total_passed"
    echo "Failed: $total_failed"

    # Generate overall summary file
    local summary_file="${RESULTS_DIR}/overall-summary.yaml"
    cat > "$summary_file" << EOF
# Real repo test overall summary - Phase 1
date: $(iso_timestamp)
repos_tested:
EOF

    for repo_name in "${repos_to_test[@]}"; do
        local repo_config
        repo_config="$(get_repo_config "$repo_name")"
        local repo_desc=$(echo "$repo_config" | cut -d'|' -f3)
        local repo_results="${RESULTS_DIR}/${repo_name}-results.yaml"
        if [[ -f "$repo_results" ]]; then
            local repo_result=$(grep "overall_result:" "$repo_results" | cut -d':' -f2 | tr -d ' ')
            echo "  - name: $repo_name" >> "$summary_file"
            echo "    description: $repo_desc" >> "$summary_file"
            echo "    result: $repo_result" >> "$summary_file"
        fi
    done

    cat >> "$summary_file" << EOF

summary:
  repos_passed: $total_passed
  repos_failed: $total_failed
  repos_total: ${#repos_to_test[@]}
  phase1_criteria:
    real_repo_count: ${#repos_to_test[@]}
    real_repo_target: 3
    meets_criteria: $([[ ${#repos_to_test[@]} -ge 3 ]] && echo "true" || echo "false")

  overall_result: $([[ $total_failed -eq 0 ]] && echo "pass" || echo "fail")
EOF

    log_info "Overall summary written to: $summary_file"

    # Cleanup if requested
    if [[ "$CLEAN_AFTER" == "true" ]]; then
        log_info "Cleaning up cloned repositories..."
        rm -rf "$TEMP_DIR"
        log_success "Cleanup complete"
    fi

    # Exit with appropriate code
    if [[ $total_failed -eq 0 ]]; then
        log_success "All real repo tests PASSED!"
        exit 0
    else
        log_fail "Some tests FAILED"
        exit 1
    fi
}

main
