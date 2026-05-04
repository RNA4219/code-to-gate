#!/bin/bash
# Spec Validation Script
# Validates all specification documents for structure, links, and consistency

SPECS_DIR="docs/specs"
REQUIRED_SECTIONS=("Purpose" "Scope" "Current State" "Proposed Implementation" "Technical Design" "Dependencies" "Acceptance Criteria" "Test Plan" "Risks" "References")

echo "=== code-to-gate Spec Validation ==="
echo ""

# 1. Structure Check
echo "## 1. Structure Check"
echo "Checking all specs have required 10 sections..."

structure_errors=0
for spec in "$SPECS_DIR"/SPEC-*.md; do
  if [ -f "$spec" ]; then
    spec_name=$(basename "$spec")
    missing_sections=""

    for section in "${REQUIRED_SECTIONS[@]}"; do
      if ! grep -q "## [0-9]*\. $section" "$spec"; then
        missing_sections="$missing_sections $section"
      fi
    done

    if [ -n "$missing_sections" ]; then
      echo "FAIL: $spec_name missing sections:$missing_sections"
      structure_errors=$((structure_errors + 1))
    else
      echo "PASS: $spec_name"
    fi
  fi
done

echo "Structure errors: $structure_errors"
echo ""

# 2. File Count Check
echo "## 2. File Count Check"
spec_count=$(ls "$SPECS_DIR"/SPEC-*.md 2>/dev/null | wc -l)
echo "Expected: 28 spec documents"
echo "Found: $spec_count spec documents"

if [ "$spec_count" -eq 28 ]; then
  echo "PASS: All 28 specs present"
else
  echo "FAIL: Missing specs (expected 28, found $spec_count)"
fi
echo ""

# 3. Link Check (internal references)
echo "## 3. Link Check"
echo "Checking internal cross-references..."

link_errors=0
for spec in "$SPECS_DIR"/SPEC-*.md; do
  if [ -f "$spec" ]; then
    spec_name=$(basename "$spec")

    # Check for references to other specs
    references=$(grep -oE "SPEC-[0-9]+" "$spec" | sort -u)

    for ref in $references; do
      ref_file="$SPECS_DIR/${ref}.md"
      if [ ! -f "$ref_file" ] && [ "$ref" != "$(echo $spec_name | sed 's/.md$//')" ]; then
        echo "FAIL: $spec_name references $ref but file not found"
        link_errors=$((link_errors + 1))
      fi
    done
  fi
done

echo "Link errors: $link_errors"
echo ""

# 4. Priority Distribution Check
echo "## 4. Priority Distribution Check"
p1_count=$(grep -l "Priority: P1" "$SPECS_DIR"/SPEC-*.md | wc -l)
p2_count=$(grep -l "Priority: P2" "$SPECS_DIR"/SPEC-*.md | wc -l)
p3_count=$(grep -l "Priority: P3" "$SPECS_DIR"/SPEC-*.md | wc -l)

echo "P1 (High Priority): $p1_count"
echo "P2 (Medium Priority): $p2_count"
echo "P3 (Low Priority): $p3_count"

if [ "$p1_count" -ge 5 ] && [ "$p2_count" -ge 10 ] && [ "$p3_count" -ge 5 ]; then
  echo "PASS: Priority distribution reasonable"
else
  echo "WARN: Priority distribution may need review"
fi
echo ""

# 5. Estimate Validation
echo "## 5. Estimate Validation"
echo "Checking time estimates format..."

estimate_errors=0
for spec in "$SPECS_DIR"/SPEC-*.md; do
  if [ -f "$spec" ]; then
    spec_name=$(basename "$spec")

    # Check if Estimated Time field exists
    if ! grep -q "Estimated Time:" "$spec"; then
      echo "FAIL: $spec_name missing Estimated Time"
      estimate_errors=$((estimate_errors + 1))
    fi
  fi
done

echo "Estimate errors: $estimate_errors"
echo ""

# 6. Version/Status Check
echo "## 6. Version/Status Check"
draft_count=$(grep -l "Status: draft" "$SPECS_DIR"/SPEC-*.md | wc -l)
approved_count=$(grep -l "Status: approved" "$SPECS_DIR"/SPEC-*.md | wc -l)

echo "Draft specs: $draft_count"
echo "Approved specs: $approved_count"
echo ""

# Summary
echo "=== Validation Summary ==="
total_errors=$((structure_errors + link_errors + estimate_errors))

if [ "$total_errors" -eq 0 ] && [ "$spec_count" -eq 28 ]; then
  echo "RESULT: PASS - All specs valid"
  echo "VERDICT: GO"
  exit 0
else
  echo "RESULT: FAIL - $total_errors errors found"
  echo "VERDICT: NO-GO - Fix errors before proceeding"
  exit 1
fi