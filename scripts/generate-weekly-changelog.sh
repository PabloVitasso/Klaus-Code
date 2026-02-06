#!/bin/bash
set -e

# Generate changelog for weekly build from git commits
# Usage: ./scripts/generate-weekly-changelog.sh [last-weekly-tag]

LAST_TAG="${1:-}"

# If no tag provided, find the last weekly-v* tag
if [ -z "$LAST_TAG" ]; then
    LAST_TAG=$(git tag --list 'weekly-v*' --sort=-version:refname | head -n1)
fi

# If still no tag (first weekly build), use first commit
if [ -z "$LAST_TAG" ]; then
    LAST_TAG=$(git rev-list --max-parents=0 HEAD)
    echo "📝 Generating changelog from first commit to HEAD"
else
    echo "📝 Generating changelog from $LAST_TAG to HEAD"
fi

# Get commit range
COMMIT_RANGE="${LAST_TAG}..HEAD"

# Generate changelog grouped by type
echo "# Changelog"
echo ""
echo "## What's Changed"
echo ""

# Features
FEATURES=$(git log $COMMIT_RANGE --oneline --no-merges --grep="^feat" | sed 's/^[a-f0-9]* //' || true)
if [ -n "$FEATURES" ]; then
    echo "### ✨ Features"
    echo ""
    while IFS= read -r line; do
        # Extract commit message (remove 'feat: ' or 'feat(scope): ')
        MSG=$(echo "$line" | sed 's/^feat[(:].*[)]: //' | sed 's/^feat: //')
        echo "- $MSG"
    done <<< "$FEATURES"
    echo ""
fi

# Fixes
FIXES=$(git log $COMMIT_RANGE --oneline --no-merges --grep="^fix" | sed 's/^[a-f0-9]* //' || true)
if [ -n "$FIXES" ]; then
    echo "### 🐛 Bug Fixes"
    echo ""
    while IFS= read -r line; do
        MSG=$(echo "$line" | sed 's/^fix[(:].*[)]: //' | sed 's/^fix: //')
        echo "- $MSG"
    done <<< "$FIXES"
    echo ""
fi

# Docs
DOCS=$(git log $COMMIT_RANGE --oneline --no-merges --grep="^docs" | sed 's/^[a-f0-9]* //' || true)
if [ -n "$DOCS" ]; then
    echo "### 📚 Documentation"
    echo ""
    while IFS= read -r line; do
        MSG=$(echo "$line" | sed 's/^docs[(:].*[)]: //' | sed 's/^docs: //')
        echo "- $MSG"
    done <<< "$DOCS"
    echo ""
fi

# Chores/Other
CHORES=$(git log $COMMIT_RANGE --oneline --no-merges --invert-grep --grep="^feat" --grep="^fix" --grep="^docs" | sed 's/^[a-f0-9]* //' || true)
if [ -n "$CHORES" ]; then
    echo "### 🔧 Maintenance"
    echo ""
    while IFS= read -r line; do
        MSG=$(echo "$line" | sed 's/^chore[(:].*[)]: //' | sed 's/^chore: //')
        echo "- $MSG"
    done <<< "$CHORES"
    echo ""
fi

# Commit statistics
COMMIT_COUNT=$(git rev-list --count $COMMIT_RANGE)
CONTRIBUTORS=$(git log $COMMIT_RANGE --format='%an' | sort -u | wc -l)

echo "---"
echo ""
echo "**Full Changelog**: ${LAST_TAG}...HEAD"
echo ""
echo "📊 **Stats**: $COMMIT_COUNT commits from $CONTRIBUTORS contributor(s)"
