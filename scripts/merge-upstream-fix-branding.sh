#!/bin/bash
# merge-upstream-fix-branding.sh
# Automatically fixes Klaus Code branding after merging from upstream Roo Code
# Safe to run multiple times - only fixes what needs fixing

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Klaus Code Branding Fix Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Track statistics
FIXED_FILES=0
SKIPPED_FILES=0
ERRORS=0

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Step 1: Fix @roo-code → @klaus-code imports
echo ""
echo -e "${BLUE}[1/6] Fixing @roo-code imports...${NC}"
echo ""

# Find files with @roo-code imports
FILES_WITH_ROO_CODE=$(find src packages apps -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) ! -path "*/node_modules/*" ! -path "*/.next/*" -exec grep -l "@roo-code/" {} \; 2>/dev/null || true)

if [ -z "$FILES_WITH_ROO_CODE" ]; then
    print_status "No @roo-code imports found - already clean!"
else
    COUNT=$(echo "$FILES_WITH_ROO_CODE" | wc -l)
    print_info "Found $COUNT files with @roo-code imports"

    # Replace @roo-code with @klaus-code
    for file in $FILES_WITH_ROO_CODE; do
        if sed -i 's/@roo-code\//@klaus-code\//g' "$file" 2>/dev/null; then
            print_status "Fixed: $file"
            ((FIXED_FILES++))
        else
            print_error "Failed to fix: $file"
        fi
    done
fi

# Step 2: Fix package.json files with @roo-code dependencies
echo ""
echo -e "${BLUE}[2/6] Fixing package.json dependencies...${NC}"
echo ""

PACKAGE_JSON_FILES=$(find . -name "package.json" ! -path "*/node_modules/*" ! -path "*/.next/*" -exec grep -l "@roo-code/" {} \; 2>/dev/null || true)

if [ -z "$PACKAGE_JSON_FILES" ]; then
    print_status "No package.json files need fixing"
else
    for file in $PACKAGE_JSON_FILES; do
        if sed -i 's/"@roo-code\//"@klaus-code\//g' "$file" 2>/dev/null; then
            print_status "Fixed: $file"
            ((FIXED_FILES++))
        else
            print_error "Failed to fix: $file"
        fi
    done
fi

# Step 3: Check critical Klaus Code files are preserved
echo ""
echo -e "${BLUE}[3/6] Verifying Claude Code provider files...${NC}"
echo ""

CRITICAL_FILES=(
    "src/integrations/claude-code/streaming-client.ts"
    "src/integrations/claude-code/oauth.ts"
    "src/api/providers/claude-code.ts"
    "packages/types/src/providers/claude-code.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_status "Present: $file"
    else
        print_error "MISSING: $file (CRITICAL!)"
    fi
done

# Step 4: Verify tool name prefixing code
echo ""
echo -e "${BLUE}[4/6] Verifying tool name prefixing...${NC}"
echo ""

if grep -q "TOOL_NAME_PREFIX.*=.*\"oc_\"" src/integrations/claude-code/streaming-client.ts 2>/dev/null; then
    print_status "Tool name prefixing code intact"
else
    print_error "Tool name prefixing code missing or modified!"
fi

# Step 5: Verify branding in key files
echo ""
echo -e "${BLUE}[5/6] Verifying branding in key files...${NC}"
echo ""

# Check src/package.json has Klaus Code branding
if [ -f "src/package.json" ]; then
    if grep -q '"klaus-code"' src/package.json && grep -q '"publisher": "KlausCode"' src/package.json; then
        print_status "src/package.json has Klaus Code branding"
    else
        print_warning "src/package.json may have incorrect branding - manual review needed"
    fi
fi

# Check packages/types/npm/package.metadata.json
if [ -f "packages/types/npm/package.metadata.json" ]; then
    if grep -q '"@klaus-code/types"' packages/types/npm/package.metadata.json; then
        print_status "packages/types/npm/package.metadata.json has Klaus Code branding"
    else
        print_warning "packages/types/npm/package.metadata.json may have incorrect branding"
    fi
fi

# Step 6: Check for remaining @roo-code references in source
echo ""
echo -e "${BLUE}[6/6] Checking for remaining @roo-code references...${NC}"
echo ""

REMAINING=$(grep -r "@roo-code/" src/ packages/ apps/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null | grep -v "^Binary" | wc -l || echo "0")

if [ "$REMAINING" -eq 0 ]; then
    print_status "No remaining @roo-code references found"
else
    print_warning "Found $REMAINING remaining @roo-code references (may be in comments/docs)"
    echo ""
    print_info "Showing first 10 occurrences:"
    grep -r "@roo-code/" src/ packages/ apps/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null | head -10 || true
fi

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Files fixed:    ${GREEN}$FIXED_FILES${NC}"
echo -e "Files skipped:  ${YELLOW}$SKIPPED_FILES${NC}"
echo -e "Errors:         ${RED}$ERRORS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Script completed with $ERRORS error(s)${NC}"
    echo -e "${YELLOW}Please review errors above and fix manually if needed${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All branding fixes applied successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run: pnpm check-types"
    echo "  2. Run: pnpm test"
    echo "  3. If tests pass, stage changes: git add -A"
fi
