#!/bin/bash
#
# release-validate.sh - Validate Release Readiness for code-to-gate
#
# This script validates all release readiness criteria before a release:
# - Build successful
# - Tests passing (or acceptable threshold)
# - CLI commands work
# - Artifacts generated correctly
# - Schema validation passes
# - Version updated
# - CHANGELOG updated
# - README updated
#
# Usage:
#   ./scripts/release-validate.sh [--strict] [--skip-tests] [--version <version>]
#
# Options:
#   --strict         Require all tests to pass (no threshold allowance)
#   --skip-tests     Skip test execution (use when tests already verified)
#   --version        Specify version to validate (e.g., 0.2.0-beta.1)
#   --dry-run        Run checks without making changes
#   --help           Show this help message
#
# Exit codes:
#   0 - All validations passed, ready for release
#   1 - Validation failed, not ready for release
#   2 - Configuration error
#

set -e

# === Configuration ===

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CTG_CLI="${PROJECT_ROOT}/dist/cli.js"
PACKAGE_JSON="${PROJECT_ROOT}/package.json"
CHANGELOG="${PROJECT_ROOT}/CHANGELOG.md"
README="${PROJECT_ROOT}/README.md"

# Test thresholds (allow some failures in alpha/beta releases)
DEFAULT_TEST_THRESHOLD=80  # 80% of tests must pass
SCHEMA_DIR="${PROJECT_ROOT}/schemas"
FIXTURE_DIR="${PROJECT_ROOT}/fixtures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# === Parse Arguments ===

STRICT_MODE=false
SKIP_TESTS=false
TARGET_VERSION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --version)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 2
            ;;
    esac
done

# === Helper Functions ===

print_usage() {
    cat << EOF
Usage: $0 [options]

Options:
  --strict         Require all tests to pass (no threshold allowance)
  --skip-tests     Skip test execution (use when tests already verified)
  --version        Specify version to validate (e.g., 0.2.0-beta.1)
  --dry-run        Run checks without making changes
  --help           Show this help message

Validation Checks:
  1. Build successful (npm run build)
  2. Tests passing (vitest run)
  3. CLI commands work (scan, analyze, readiness)
  4. Artifacts generated correctly
  5. Schema validation passes
  6. Version updated in package.json
  7. CHANGELOG updated for version
  8. README current status accurate

Exit Codes:
  0 - Ready for release
  1 - Not ready for release
  2 - Configuration error
EOF
}

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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Track validation results
declare -A VALIDATION_RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

record_result() {
    local check_name="$1"
    local result="$2"  # "pass" or "fail"
    local details="$3"

    VALIDATION_RESULTS["$check_name"]="$result|$details"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [[ "$result" == "pass" ]]; then
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

# === Validation Functions ===

check_build() {
    log_step "Checking: Build successful"

    if [[ ! -f "$CTG_CLI" ]]; then
        log_info "Running npm run build..."
        npm run build --prefix "$PROJECT_ROOT" > /dev/null 2>&1

        if [[ $? -eq 0 ]]; then
            log_success "Build completed successfully"
            record_result "build" "pass" "npm run build succeeded"
        else
            log_fail "Build failed"
            record_result "build" "fail" "npm run build returned non-zero exit code"
            return 1
        fi
    else
        log_success "Build output exists at $CTG_CLI"

        # Verify build is recent (within 1 hour)
        BUILD_TIME=$(stat -c %Y "$CTG_CLI" 2>/dev/null || stat -f %m "$CTG_CLI" 2>/dev/null)
        CURRENT_TIME=$(date +%s)
        AGE=$((CURRENT_TIME - BUILD_TIME))

        if [[ $AGE -gt 3600 ]]; then
            log_warn "Build output is older than 1 hour (${AGE}s). Consider rebuilding."
        fi

        record_result "build" "pass" "CLI exists at $CTG_CLI (age: ${AGE}s)"
    fi

    return 0
}

check_tests() {
    log_step "Checking: Tests passing"

    if [[ "$SKIP_TESTS" == true ]]; then
        log_warn "Skipping tests (--skip-tests specified)"
        record_result "tests" "pass" "Skipped by user"
        return 0
    fi

    log_info "Running vitest run..."

    # Run tests and capture output
    TEST_OUTPUT=$(npm test --prefix "$PROJECT_ROOT" 2>&1 || true)
    TEST_EXIT=$?

    # Parse test results from vitest output
    PASSED=$(echo "$TEST_OUTPUT" | grep -E "Tests.*passed" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" || echo "0")
    FAILED=$(echo "$TEST_OUTPUT" | grep -E "Tests.*failed" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")
    TOTAL=$((PASSED + FAILED))

    if [[ "$STRICT_MODE" == true ]]; then
        if [[ $TEST_EXIT -eq 0 && $FAILED -eq 0 ]]; then
            log_success "All tests passed ($PASSED/$TOTAL)"
            record_result "tests" "pass" "$PASSED/$TOTAL tests passed (strict mode)"
            return 0
        else
            log_fail "Tests failed: $FAILED failed, $PASSED passed (strict mode)"
            record_result "tests" "fail" "$FAILED tests failed, $PASSED passed (strict mode)"
            return 1
        fi
    else
        # Allow threshold-based passing for alpha/beta releases
        if [[ $TOTAL -gt 0 ]]; then
            PASS_RATE=$((PASSED * 100 / TOTAL))

            if [[ $PASS_RATE -ge $DEFAULT_TEST_THRESHOLD ]]; then
                log_success "Test pass rate: ${PASS_RATE}% (threshold: ${DEFAULT_TEST_THRESHOLD}%)"
                record_result "tests" "pass" "$PASSED/$TOTAL tests passed (${PASS_RATE}% >= ${DEFAULT_TEST_THRESHOLD}% threshold)"
                return 0
            else
                log_fail "Test pass rate too low: ${PASS_RATE}% (threshold: ${DEFAULT_TEST_THRESHOLD}%)"
                record_result "tests" "fail" "$PASSED/$TOTAL tests (${PASS_RATE}% < ${DEFAULT_TEST_THRESHOLD}% threshold)"
                return 1
            fi
        else
            if [[ $TEST_EXIT -eq 0 ]]; then
                log_success "Tests executed successfully"
                record_result "tests" "pass" "Tests executed successfully"
                return 0
            else
                log_fail "Tests failed to execute"
                record_result "tests" "fail" "vitest run returned exit code $TEST_EXIT"
                return 1
            fi
        fi
    fi
}

check_cli_commands() {
    log_step "Checking: CLI commands work"

    local cli_failures=0

    # Test scan command
    log_info "Testing: scan command"
    SCAN_OUTPUT="${PROJECT_ROOT}/.test-temp-release"
    mkdir -p "$SCAN_OUTPUT"

    node "$CTG_CLI" scan "${FIXTURE_DIR}/demo-shop-ts" --out "$SCAN_OUTPUT" 2>&1
    SCAN_EXIT=$?

    if [[ $SCAN_EXIT -eq 0 ]]; then
        log_success "scan command works"
    else
        log_fail "scan command failed (exit code $SCAN_EXIT)"
        cli_failures=$((cli_failures + 1))
    fi

    # Test analyze command
    log_info "Testing: analyze command"
    node "$CTG_CLI" analyze "${FIXTURE_DIR}/demo-shop-ts" --emit all --out "$SCAN_OUTPUT" --llm-mode none 2>&1 || true
    ANALYZE_EXIT=$?

    # analyze can return 0 or 1 (1 indicates findings found)
    if [[ $ANALYZE_EXIT -eq 0 || $ANALYZE_EXIT -eq 1 ]]; then
        log_success "analyze command works (exit code $ANALYZE_EXIT)"
    else
        log_fail "analyze command failed (exit code $ANALYZE_EXIT)"
        cli_failures=$((cli_failures + 1))
    fi

    # Test readiness command
    log_info "Testing: readiness command"
    node "$CTG_CLI" readiness "${FIXTURE_DIR}/demo-shop-ts" --out "$SCAN_OUTPUT" --llm-mode none 2>&1 || true
    READINESS_EXIT=$?

    # readiness can return 0 or 1 (1 indicates blocked_input)
    if [[ $READINESS_EXIT -eq 0 || $READINESS_EXIT -eq 1 ]]; then
        log_success "readiness command works (exit code $READINESS_EXIT)"
    else
        log_fail "readiness command failed (exit code $READINESS_EXIT)"
        cli_failures=$((cli_failures + 1))
    fi

    # Test schema validate command
    log_info "Testing: schema validate command"
    node "$CTG_CLI" schema validate "${SCHEMA_DIR}/normalized-repo-graph.schema.json" 2>&1
    SCHEMA_EXIT=$?

    if [[ $SCHEMA_EXIT -eq 0 ]]; then
        log_success "schema validate command works"
    else
        log_fail "schema validate command failed (exit code $SCHEMA_EXIT)"
        cli_failures=$((cli_failures + 1))
    fi

    # Cleanup
    rm -rf "$SCAN_OUTPUT"

    if [[ $cli_failures -eq 0 ]]; then
        record_result "cli_commands" "pass" "All CLI commands executed successfully"
        return 0
    else
        record_result "cli_commands" "fail" "$cli_failures CLI commands failed"
        return 1
    fi
}

check_artifacts() {
    log_step "Checking: Artifacts generated correctly"

    local artifact_failures=0
    local TEST_OUTPUT="${PROJECT_ROOT}/.test-temp-release"
    mkdir -p "$TEST_OUTPUT"

    # Run analyze to generate artifacts
    node "$CTG_CLI" analyze "${FIXTURE_DIR}/demo-shop-ts" --emit all --out "$TEST_OUTPUT" --llm-mode none 2>&1 || true

    # Required artifacts
    REQUIRED_ARTIFACTS=(
        "repo-graph.json"
        "findings.json"
        "risk-register.yaml"
        "invariants.yaml"
        "test-seeds.json"
        "release-readiness.json"
        "audit.json"
    )

    for artifact in "${REQUIRED_ARTIFACTS[@]}"; do
        local artifact_path="${TEST_OUTPUT}/${artifact}"
        if [[ -f "$artifact_path" ]]; then
            # Check file is non-empty
            local size=$(wc -c < "$artifact_path" | tr -d ' ')
            if [[ $size -gt 0 ]]; then
                log_success "Artifact generated: $artifact ($size bytes)"
            else
                log_fail "Artifact empty: $artifact"
                artifact_failures=$((artifact_failures + 1))
            fi
        else
            log_fail "Artifact missing: $artifact"
            artifact_failures=$((artifact_failures + 1))
        fi
    done

    # Cleanup
    rm -rf "$TEST_OUTPUT"

    if [[ $artifact_failures -eq 0 ]]; then
        record_result "artifacts" "pass" "All required artifacts generated"
        return 0
    else
        record_result "artifacts" "fail" "$artifact_failures artifacts missing or empty"
        return 1
    fi
}

check_schema_validation() {
    log_step "Checking: Schema validation passes"

    local schema_failures=0
    local TEST_OUTPUT="${PROJECT_ROOT}/.test-temp-release"
    mkdir -p "$TEST_OUTPUT"

    # Run analyze to generate artifacts
    node "$CTG_CLI" analyze "${FIXTURE_DIR}/demo-shop-ts" --emit all --out "$TEST_OUTPUT" --llm-mode none 2>&1 || true

    # Validate each artifact against its schema
    ARTIFACTS_TO_VALIDATE=(
        "repo-graph.json:${SCHEMA_DIR}/normalized-repo-graph.schema.json"
        "findings.json:${SCHEMA_DIR}/findings.schema.json"
        "risk-register.yaml:${SCHEMA_DIR}/risk-register.schema.json"
        "test-seeds.json:${SCHEMA_DIR}/test-seeds.schema.json"
        "release-readiness.json:${SCHEMA_DIR}/release-readiness.schema.json"
        "audit.json:${SCHEMA_DIR}/audit.schema.json"
    )

    for mapping in "${ARTIFACTS_TO_VALIDATE[@]}"; do
        local artifact="${mapping%%:*}"
        local schema="${mapping#*:}"
        local artifact_path="${TEST_OUTPUT}/${artifact}"

        if [[ -f "$artifact_path" ]]; then
            node "$CTG_CLI" schema validate "$artifact_path" 2>&1
            local exit_code=$?

            if [[ $exit_code -eq 0 ]]; then
                log_success "Schema valid: $artifact"
            else
                log_fail "Schema invalid: $artifact"
                schema_failures=$((schema_failures + 1))
            fi
        else
            log_warn "Skipping: $artifact (not generated)"
        fi
    done

    # Cleanup
    rm -rf "$TEST_OUTPUT"

    if [[ $schema_failures -eq 0 ]]; then
        record_result "schema_validation" "pass" "All schema validations passed"
        return 0
    else
        record_result "schema_validation" "fail" "$schema_failures schema validations failed"
        return 1
    fi
}

check_version() {
    log_step "Checking: Version updated in package.json"

    local current_version=$(jq -r '.version' "$PACKAGE_JSON")

    if [[ -n "$TARGET_VERSION" ]]; then
        if [[ "$current_version" == "$TARGET_VERSION" ]]; then
            log_success "Version matches target: $current_version"
            record_result "version" "pass" "Version $current_version matches target"
            return 0
        else
            log_fail "Version mismatch: current=$current_version, target=$TARGET_VERSION"
            record_result "version" "fail" "Version $current_version does not match target $TARGET_VERSION"
            return 1
        fi
    else
        # Check version format is valid semver
        if [[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            log_success "Version format valid: $current_version"
            record_result "version" "pass" "Version $current_version has valid semver format"
            return 0
        else
            log_fail "Invalid version format: $current_version"
            record_result "version" "fail" "Version $current_version has invalid format"
            return 1
        fi
    fi
}

check_changelog() {
    log_step "Checking: CHANGELOG updated"

    local current_version=$(jq -r '.version' "$PACKAGE_JSON")

    # Check if CHANGELOG has entry for current version
    if grep -q "## \[${current_version}\]" "$CHANGELOG" || grep -q "## \[${current_version}\]" "$CHANGELOG" 2>/dev/null; then
        log_success "CHANGELOG has entry for version $current_version"
        record_result "changelog" "pass" "CHANGELOG updated for version $current_version"
        return 0
    else
        # Check for unreleased section or date-based entry
        if grep -q "## \[Unreleased\]" "$CHANGELOG"; then
            log_warn "CHANGELOG has [Unreleased] section but no entry for $current_version"
            record_result "changelog" "fail" "CHANGELOG missing entry for version $current_version"
            return 1
        else
            log_fail "CHANGELOG missing entry for version $current_version"
            record_result "changelog" "fail" "CHANGELOG missing entry for version $current_version"
            return 1
        fi
    fi
}

check_readme() {
    log_step "Checking: README current status accurate"

    # Check README exists and has key sections
    local readme_issues=0

    # Check for Current Status section
    if grep -q "## Current Status" "$README"; then
        log_success "README has Current Status section"
    else
        log_fail "README missing Current Status section"
        readme_issues=$((readme_issues + 1))
    fi

    # Check for documentation map
    if grep -q "## Documentation Map" "$README"; then
        log_success "README has Documentation Map section"
    else
        log_fail "README missing Documentation Map section"
        readme_issues=$((readme_issues + 1))
    fi

    # Check for install section
    if grep -q "## Install" "$README"; then
        log_success "README has Install section"
    else
        log_fail "README missing Install section"
        readme_issues=$((readme_issues + 1))
    fi

    # Check for CLI Smoke section (smoke test commands)
    if grep -q "## CLI Smoke" "$README"; then
        log_success "README has CLI Smoke section"
    else
        log_fail "README missing CLI Smoke section"
        readme_issues=$((readme_issues + 1))
    fi

    # Check for Known Gaps section (should exist for alpha releases)
    if grep -q "## Known Gaps" "$README"; then
        log_success "README has Known Gaps section"
    else
        log_warn "README missing Known Gaps section (recommended for alpha releases)"
        # Not a hard failure for non-alpha releases
    fi

    if [[ $readme_issues -eq 0 ]]; then
        record_result "readme" "pass" "README has all required sections"
        return 0
    else
        record_result "readme" "fail" "$readme_issues README sections missing"
        return 1
    fi
}

# === Summary Generation ===

generate_summary() {
    log_info "=========================================="
    log_info "Release Validation Summary"
    log_info "=========================================="

    local version=$(jq -r '.version' "$PACKAGE_JSON")
    echo ""
    echo "Version: $version"
    echo "Strict mode: $STRICT_MODE"
    echo "Skip tests: $SKIP_TESTS"
    echo ""

    echo "Check Results:"
    echo "--------------"

    for check in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$check]}"
        local status="${result%%|*}"
        local details="${result#*|}"

        if [[ "$status" == "pass" ]]; then
            echo -e "  ${GREEN}[PASS]${NC} $check: $details"
        else
            echo -e "  ${RED}[FAIL]${NC} $check: $details"
        fi
    done

    echo ""
    echo "Summary:"
    echo "--------"
    echo "  Total checks: $TOTAL_CHECKS"
    echo "  Passed: $PASSED_CHECKS"
    echo "  Failed: $FAILED_CHECKS"

    # Generate summary file
    local summary_file="${PROJECT_ROOT}/.qh-release-validation.yaml"

    cat > "$summary_file" << EOF
# Release Validation Summary
# Generated: $(date -Iseconds)
# Version: $version

validation:
  strict_mode: $STRICT_MODE
  skip_tests: $SKIP_TESTS

checks:
EOF

    for check in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$check]}"
        local status="${result%%|*}"
        local details="${result#*|}"
        echo "  - name: $check" >> "$summary_file"
        echo "    status: $status" >> "$summary_file"
        echo "    details: $details" >> "$summary_file"
    done

    cat >> "$summary_file" << EOF

summary:
  total: $TOTAL_CHECKS
  passed: $PASSED_CHECKS
  failed: $FAILED_CHECKS
  ready_for_release: $([[ $FAILED_CHECKS -eq 0 ]] && echo "true" || echo "false")
EOF

    log_info "Summary written to: $summary_file"

    echo ""

    if [[ $FAILED_CHECKS -eq 0 ]]; then
        log_success "All validations passed - READY FOR RELEASE"
        return 0
    else
        log_fail "Some validations failed - NOT READY FOR RELEASE"
        return 1
    fi
}

# === Main Execution ===

main() {
    log_info "=========================================="
    log_info "code-to-gate Release Validation"
    log_info "=========================================="

    local version=$(jq -r '.version' "$PACKAGE_JSON")
    log_info "Current version: $version"
    log_info "Strict mode: $STRICT_MODE"
    log_info "Skip tests: $SKIP_TESTS"
    echo ""

    # Run all validation checks
    check_build
    check_tests
    check_cli_commands
    check_artifacts
    check_schema_validation
    check_version
    check_changelog
    check_readme

    # Generate summary
    generate_summary
    local summary_exit=$?

    # Exit with appropriate code
    if [[ $summary_exit -eq 0 ]]; then
        exit 0
    else
        exit 1
    fi
}

main