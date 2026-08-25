#!/bin/bash

# Deterministic contract test for real-repo-test.sh. It replaces git and the
# CLI with local fakes so expected analyze/readiness exit code 1 values can be
# verified without network access.

set -e

normalize_directory() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -u "$1"
    else
        (cd "$1" && pwd -P)
    fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_BASE="$(normalize_directory "${TMPDIR:-/tmp}")"
TEST_ROOT_RAW="$(mktemp -d "$TEST_BASE/ctg-real-repo-contract.XXXXXX")"
TEST_ROOT="$(normalize_directory "$TEST_ROOT_RAW")"

cleanup() {
    case "$TEST_ROOT" in
        "$TEST_BASE"/ctg-real-repo-contract.*)
            rm -rf "$TEST_ROOT"
            ;;
        *)
            echo "Refusing to remove unexpected test directory: $TEST_ROOT" >&2
            ;;
    esac
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/scripts" "$TEST_ROOT/dist" "$TEST_ROOT/fixtures/policies" "$TEST_ROOT/fake-bin"
cp "$PROJECT_ROOT/scripts/real-repo-test.sh" "$TEST_ROOT/scripts/real-repo-test.sh"
cp "$PROJECT_ROOT/fixtures/policies/strict.yaml" "$TEST_ROOT/fixtures/policies/strict.yaml"
touch "$TEST_ROOT/dist/cli.js"

cat > "$TEST_ROOT/fake-bin/git" <<'EOF'
#!/bin/bash
set -e

if [[ "$1" != "clone" ]]; then
    echo "Unexpected git command: $*" >&2
    exit 2
fi

target=""
for argument in "$@"; do
    target="$argument"
done

mkdir -p "$target"
index=1
while [[ $index -le 10 ]]; do
    printf 'module.exports = {};\n' > "$target/file-$index.js"
    index=$((index + 1))
done
EOF

cat > "$TEST_ROOT/fake-bin/node" <<'EOF'
#!/bin/bash
set -e

find_option() {
    local option="$1"
    shift

    while [[ $# -gt 0 ]]; do
        if [[ "$1" == "$option" ]]; then
            [[ $# -ge 2 ]] || return 1
            echo "$2"
            return 0
        fi
        shift
    done

    return 1
}

[[ $# -ge 2 ]] || exit 2
command_name="$2"
shift 2

case "$command_name" in
    scan)
        output_dir="$(find_option --out "$@")"
        mkdir -p "$output_dir"
        printf '{}\n' > "$output_dir/repo-graph.json"
        exit 0
        ;;
    analyze)
        output_dir="$(find_option --out "$@")"
        llm_mode="$(find_option --llm-mode "$@")"
        llm_provider="$(find_option --llm-provider "$@")"
        if [[ "$llm_mode" != "local-only" || "$llm_provider" != "deterministic" ]]; then
            echo "Analyze did not use the deterministic local LLM contract" >&2
            exit 2
        fi
        mkdir -p "$output_dir"
        for artifact in repo-graph.json findings.json risk-register.yaml test-seeds.json release-readiness.json audit.json; do
            printf '{}\n' > "$output_dir/$artifact"
        done
        exit 1
        ;;
    readiness)
        output_dir="$(find_option --out "$@")"
        policy_file="$(find_option --policy "$@")"
        from_dir="$(find_option --from "$@")"
        if [[ ! -f "$policy_file" || ! -d "$from_dir" ]]; then
            echo "Readiness did not receive valid --policy and --from inputs" >&2
            exit 2
        fi
        mkdir -p "$output_dir"
        printf '{}\n' > "$output_dir/release-readiness.json"
        exit 1
        ;;
    schema)
        [[ "${1:-}" == "validate" ]] || exit 2
        exit 0
        ;;
    *)
        echo "Unexpected code-to-gate command: $command_name" >&2
        exit 2
        ;;
esac
EOF

chmod +x "$TEST_ROOT/scripts/real-repo-test.sh" "$TEST_ROOT/fake-bin/git" "$TEST_ROOT/fake-bin/node"

PATH="$TEST_ROOT/fake-bin:$PATH" "$TEST_ROOT/scripts/real-repo-test.sh" --repo express --clean

summary_file="$TEST_ROOT/.real-repo-results/overall-summary.yaml"
repo_result_file="$TEST_ROOT/.real-repo-results/express-results.yaml"

grep -q '^  overall_result: pass$' "$summary_file"
grep -q '^    exit_code: 1$' "$repo_result_file"

if [[ -d "$TEST_ROOT/.real-repo-temp" ]]; then
    echo "Expected --clean to remove the cloned repository directory" >&2
    exit 1
fi

echo "real-repo-test.sh contract passed"
