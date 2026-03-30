#!/bin/bash
set -e

# Configuration
VERSION="${1:-$(git describe --tags --abbrev=0 | sed 's/v//')}"
TAG="v${VERSION}"
REPO="PabloVitasso/Klaus-Code"
BRANCH="release/${VERSION}"

echo "=== Klaus Code Release v${VERSION} ==="

# 1. Update version in src/package.json
echo "[1/7] Updating version..."
sed -i "s/\"version\": \"[0-9.]*-klaus\.[0-9]\"/\"version\": \"${VERSION}\"/" src/package.json

# 2. Update release notes in chat.json (customize as needed)
echo "[2/7] Updating release notes..."
sed -i 's/"item1": "Updated icon and branding"/"item1": "Updated icon and branding"/' \
  webview-ui/src/i18n/locales/en/chat.json
sed -i 's/"item2": "Initial Klaus Code release"/"item2": "Improved CI\/CD pipeline"/' \
  webview-ui/src/i18n/locales/en/chat.json
sed -i 's/"item3": "Performance improvements and bug fixes"/"item3": "Bug fixes and performance improvements"/' \
  webview-ui/src/i18n/locales/en/chat.json

# 3. Update announcement ID
echo "[3/7] Updating announcement ID..."
MONTH=$(date +%b | awk '{print tolower($0)}')
YEAR=$(date +%Y)
sed -i "s/latestAnnouncementId = \"[^\"]*\"/latestAnnouncementId = \"${MONTH}-${YEAR}-${TAG}\"/" \
  src/core/webview/ClineProvider.ts

# 4. Commit and push
echo "[4/7] Committing and pushing..."
git add src/package.json webview-ui/src/i18n/locales/en/chat.json src/core/webview/ClineProvider.ts
git commit -m "chore: prepare release ${TAG}"

# 5. Create PR (if branch doesn't exist remotely)
if ! git ls-remote --heads origin "${BRANCH}" | grep -q .; then
    echo "[5/7] Creating PR..."
    git push origin "${BRANCH}"
    gh pr create --repo "${REPO}" --base main --head "PabloVitasso:${BRANCH}" \
      --title "Release ${TAG}" --body "Release ${TAG}"
fi

# 6. Merge PR
echo "[6/7] Merging PR..."
gh pr merge "${TAG}" --merge --admin --repo "${REPO}"

# 7. Create tag and GitHub release
echo "[7/7] Creating release..."
git checkout main && git pull origin main
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin "${TAG}"

gh release create "${TAG}" --title "${TAG}" --repo "${REPO}" \
  --notes "## What's New in ${TAG}

### Changed
- Updated icon and branding
- Improved CI/CD pipeline
- Bug fixes and performance improvements

**Full Changelog**: https://github.com/${REPO}/compare/v${VERSION}...${TAG}"

gh release upload "${TAG}" "bin/klaus-code-${VERSION}.vsix" --repo "${REPO}"

echo ""
echo "=== Release ${TAG} Complete! ==="
echo "Release URL: https://github.com/${REPO}/releases/${TAG}"
