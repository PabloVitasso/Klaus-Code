#!/bin/bash
set -e

# Prepare release by creating a changeset from recent commits
# Usage: ./scripts/prepare-release.sh [since-tag]

echo "🚀 Preparing Release Changeset"
echo ""

# Get last tag or use last 10 commits
SINCE_TAG="${1:-}"
if [ -z "$SINCE_TAG" ]; then
    SINCE_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")
fi

echo "📝 Analyzing commits since $SINCE_TAG"
echo ""

# Determine version bump type
HAS_BREAKING=$(git log ${SINCE_TAG}..HEAD --oneline --grep="BREAKING CHANGE" | wc -l)
HAS_FEAT=$(git log ${SINCE_TAG}..HEAD --oneline --grep="^feat" | wc -l)
HAS_FIX=$(git log ${SINCE_TAG}..HEAD --oneline --grep="^fix" | wc -l)

if [ "$HAS_BREAKING" -gt 0 ]; then
    BUMP_TYPE="major"
    echo "⚠️  Found BREAKING CHANGE - suggesting major version bump"
elif [ "$HAS_FEAT" -gt 0 ]; then
    BUMP_TYPE="minor"
    echo "✨ Found $HAS_FEAT feature(s) - suggesting minor version bump"
elif [ "$HAS_FIX" -gt 0 ]; then
    BUMP_TYPE="patch"
    echo "🐛 Found $HAS_FIX fix(es) - suggesting patch version bump"
else
    BUMP_TYPE="patch"
    echo "📝 No conventional commits found - defaulting to patch"
fi

echo ""
echo "Creating changeset with $BUMP_TYPE version bump..."
echo ""

# Generate changeset content
CHANGESET_ID=$(date +%s)
CHANGESET_FILE=".changeset/release-${CHANGESET_ID}.md"

cat > "$CHANGESET_FILE" <<EOF
---
"klaus-code": $BUMP_TYPE
---

EOF

# Add features
FEATURES=$(git log ${SINCE_TAG}..HEAD --oneline --no-merges --grep="^feat" --perl-regexp --pretty=format:"- %s" 2>/dev/null | head -20 || true)
if [ -n "$FEATURES" ]; then
    echo "### ✨ Features" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
    echo "$FEATURES" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
fi

# Add fixes
FIXES=$(git log ${SINCE_TAG}..HEAD --oneline --no-merges --grep="^fix" --perl-regexp --pretty=format:"- %s" 2>/dev/null | head -20 || true)
if [ -n "$FIXES" ]; then
    echo "### 🐛 Bug Fixes" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
    echo "$FIXES" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
fi

# Add docs
DOCS=$(git log ${SINCE_TAG}..HEAD --oneline --no-merges --grep="^docs" --perl-regexp --pretty=format:"- %s" 2>/dev/null | head -10 || true)
if [ -n "$DOCS" ]; then
    echo "### 📚 Documentation" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
    echo "$DOCS" >> "$CHANGESET_FILE"
    echo "" >> "$CHANGESET_FILE"
fi

echo "✅ Created changeset: $CHANGESET_FILE"
echo ""
cat "$CHANGESET_FILE"
echo ""
echo "🎯 Next steps:"
echo "  1. Review the changeset: cat $CHANGESET_FILE"
echo "  2. Edit if needed: vim $CHANGESET_FILE"
echo "  3. Commit: git add $CHANGESET_FILE && git commit -m 'chore: add changeset for release'"
echo "  4. Run release: pnpm changeset version && pnpm changeset publish"
