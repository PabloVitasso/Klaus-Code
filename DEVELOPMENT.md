# Klaus Code Development Guide

> Developer documentation for building and releasing Klaus Code

## Table of Contents

- [Fork Divergence from Upstream](#fork-divergence-from-upstream)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Building from Source](#building-from-source)
- [Development Workflow](#development-workflow)
- [Creating a Release](#creating-a-release)
- [Automated Release](#automated-release)
- [Merging Upstream Changes](#merging-upstream-changes)
- [Troubleshooting](#troubleshooting)

---

## Fork Divergence from Upstream

Klaus Code is a fork of [Roo Code](https://github.com/RooCodeInc/Roo-Code) that maintains features removed from upstream. **When merging changes from upstream, be aware of these key differences:**

### 1. Claude Code Provider Support (CRITICAL)

**Status**: ✅ Maintained in Klaus Code | ❌ Removed from Roo Code (commit `7f854c0`)

Klaus Code preserves full Claude Code OAuth integration that was removed from upstream Roo Code.

**Files to watch when merging:**

- `src/api/providers/claude-code.ts` - Main provider implementation
- `src/integrations/claude-code/oauth.ts` - OAuth authentication flow
- `src/integrations/claude-code/streaming-client.ts` - Streaming API client
- `packages/types/src/providers/claude-code.ts` - Type definitions
- `webview-ui/src/components/settings/providers/ClaudeCode.tsx` - Settings UI
- `webview-ui/src/components/settings/providers/ClaudeCodeRateLimitDashboard.tsx` - Rate limit display

**Action when merging**: If upstream changes affect provider infrastructure, ensure Claude Code provider is not accidentally removed. Test OAuth flow after merge.

### 2. Tool Name Prefixing Fix (CRITICAL)

**Status**: ✅ Applied in Klaus Code | ⚠️ May or may not be in upstream

**Upstream PR**: [RooCodeInc/Roo-Code#10620](https://github.com/RooCodeInc/Roo-Code/pull/10620)
**Klaus Code PR**: [PabloVitasso/Klaus-Code#10916](https://github.com/RooCodeInc/Roo-Code/pull/10916)
**Commits**:

- `6173606`: fix(claude-code): prefix tool names to bypass OAuth validation
- `f578dfb`: fix: prefix tool_choice.name when type is tool

**What it does**: Adds `oc_` prefix to tool names when sending to Claude Code API and strips the prefix from responses. This works around Anthropic's OAuth validation that rejects third-party tool names.

**Files modified:**

- `src/integrations/claude-code/streaming-client.ts`
    - Added `TOOL_NAME_PREFIX = "oc_"` constant
    - Added `prefixToolName()` and `stripToolNamePrefix()` helpers
    - Added `prefixToolNames()` and `prefixToolNamesInMessages()` internal helpers
    - Modified `createStreamingMessage()` to prefix/strip tool names
- `src/integrations/claude-code/__tests__/streaming-client.spec.ts`
    - Unit tests for prefixing functions
    - Integration tests for API request/response handling

**Action when merging**:

1. Check if upstream has merged this fix
2. If not, ensure our changes to `streaming-client.ts` are preserved
3. Run tests: `cd src && npx vitest run integrations/claude-code/__tests__/streaming-client.spec.ts`
4. Test Claude Code OAuth flow with tool use after merge

### 3. Branding Changes

**Klaus Code** branding instead of **Roo Code**:

**Files with branding:**

- `package.json` - name: `klaus-code`
- `src/package.json` - name, publisher, author, repository
- All `package.nls*.json` files - Display names and descriptions
- `webview-ui/src/i18n/locales/*/` - All locale files
- `README.md` - Fork notice and branding

**Action when merging**: Review any new user-facing strings from upstream and update them to Klaus Code branding if needed.

### 4. Version Numbering

Klaus Code uses fork-specific versioning:

- Format: `<upstream-version>-klaus.<fork-increment>`
- Example: `3.42.0-klaus.1`

**Action when merging**: After merging upstream version bump, append `-klaus.1` (or increment the fork number if already on that upstream version).

### Upstream Remote Setup

To facilitate merging:

```bash
# Add Roo Code as remote (if not already added)
git remote add roocode https://github.com/RooCodeInc/Roo-Code.git

# Fetch latest from upstream
git fetch roocode

# View upstream branches
git branch -r | grep roocode
```

### Recommended Merge Process

1. **Before merging**: Document current Klaus Code-specific state

    ```bash
    git log --oneline origin/main..HEAD > klaus-specific-commits.txt
    git diff roocode/main HEAD -- src/integrations/claude-code/ > claude-code-diff.patch
    ```

2. **Create merge branch**:

    ```bash
    git checkout -b merge-upstream-<date>
    git fetch roocode
    git merge roocode/main
    ```

3. **Resolve conflicts** - prioritize Klaus Code features:

    - Claude Code provider files: Keep Klaus Code version
    - Tool name prefixing: Keep Klaus Code version
    - Branding: Keep Klaus Code version
    - Other conflicts: Evaluate case-by-case

4. **Test after merge**:

    ```bash
    pnpm install
    pnpm check-types
    pnpm test
    pnpm vsix
    code --install-extension bin/klaus-code-*.vsix
    ```

5. **Manual testing**:

    - Test Claude Code OAuth login flow
    - Test tool use with Claude Code provider
    - Verify rate limit dashboard shows correctly
    - Test other providers to ensure no regression

6. **Update version** in `src/package.json`:
    ```json
    "version": "<new-upstream-version>-klaus.1"
    ```

---

## Prerequisites

### Required Software

- **Node.js**: v20.19.2 (specified in `.nvmrc`)
- **pnpm**: v10.8.1 (package manager)
- **Git**: For version control

### Verify Prerequisites

```bash
node --version  # Should be v20.19.2
npm --version   # Should be 10.x or higher
git --version
```

---

## Environment Setup

### 1. Install Node.js

Use Node Version Manager (nvm) for easy Node.js version management:

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use the correct Node.js version
nvm install 20.19.2
nvm use 20.19.2
```

Alternatively, download Node.js v20.19.2 from [nodejs.org](https://nodejs.org/).

### 2. Install pnpm

```bash
npm install -g pnpm@10.8.1
```

Verify installation:

```bash
pnpm --version  # Should output: 10.8.1
```

### 3. Clone the Repository

```bash
git clone https://github.com/PabloVitasso/Klaus-Code.git
cd Klaus-Code
```

### 4. Install Dependencies

```bash
pnpm install
```

This will:

- Install all workspace dependencies
- Run bootstrap scripts
- Set up husky git hooks

**Note**: The build scripts for some dependencies are ignored by default for security. This is normal.

---

## Building from Source

### Quick Build

```bash
# Build all packages
pnpm build

# Create VSIX package
pnpm vsix
```

The VSIX file will be created in `bin/klaus-code-<version>.vsix`.

### Build Output

```
bin/
└── klaus-code-3.42.0.vsix  (34 MB)
```

---

## Development Workflow

### Run in Development Mode

Press `F5` in VS Code to launch the extension in debug mode:

1. Open the project in VS Code
2. Press `F5` (or **Run** → **Start Debugging**)
3. A new VS Code window opens with Klaus Code loaded
4. Changes to the webview hot-reload automatically
5. Changes to the core extension also hot-reload

### Available Scripts

```bash
# Linting
pnpm lint

# Type checking
pnpm check-types

# Run tests
pnpm test

# Format code
pnpm format

# Clean build artifacts
pnpm clean
```

### Running Individual Tests

Tests use Vitest. Run from the correct workspace:

```bash
# Backend tests
cd src && npx vitest run path/to/test.test.ts

# Webview UI tests
cd webview-ui && npx vitest run src/path/to/test.test.ts
```

**Important**: Do NOT run `npx vitest run src/...` from project root - this causes errors.

---

## Creating a Release

### Release Checklist

Before releasing, ensure you update the following files:

1. **`webview-ui/src/i18n/locales/en/chat.json`** - Update `announcement.release` section with new release notes:

    ```json
    "announcement": {
        "release": {
            "heading": "What's New:",
            "item1": "Description of change 1",
            "item2": "Description of change 2",
            "item3": "Description of change 3"
        },
        "repo": "View the project on <repoLink>GitHub</repoLink>"
    }
    ```

2. **`webview-ui/src/components/chat/Announcement.tsx`** - Update the component if needed to match new release content

3. **`src/core/webview/ClineProvider.ts`** - Update `latestAnnouncementId`:

    ```typescript
    public readonly latestAnnouncementId = "jan-2026-v3.43.0-klaus-code-release"
    ```

    Format: `MMM-YYYY-vX.Y.Z-klaus-code-release`

4. **`src/package.json`** - Update version number:
    ```json
    "version": "3.43.0-klaus.1"
    ```

### Release Process

#### 1. Identify Changes Since Last Release

Get the last release tag:

```bash
gh release list --limit 10
```

View changes since last release:

```bash
git log <last-tag>..HEAD --oneline
```

#### 2. Summarize Changes

Group changes by type:

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Fixed**: Bug fixes
- **Removed**: Removed features

#### 3. Create Release Branch

```bash
git checkout main
git pull origin main
git checkout -b release/v<version>
```

#### 4. Update Files

1. Update version in `src/package.json`
2. Update `webview-ui/src/i18n/locales/en/chat.json` with new release notes
3. Update `src/core/webview/ClineProvider.ts` with new `latestAnnouncementId`
4. Review and update `webview-ui/src/components/chat/Announcement.tsx` if needed

#### 5. Commit and Push

```bash
git add src/package.json webview-ui/src/i18n/locales/en/chat.json src/core/webview/ClineProvider.ts
git commit -m "chore: prepare release v<version>"
git push origin release/v<version>
```

#### 6. Create Pull Request

```bash
gh pr create --title "Release v<version>" \
    --body "Release preparation for v<version>." \
    --base main --head release/v<version>
```

#### 7. Build and Test After Merge

Once the release PR is merged to main:

```bash
# Clean and build
pnpm clean
pnpm build

# Create VSIX
pnpm vsix

# Install locally
code --install-extension bin/klaus-code-<version>.vsix --force
```

#### 8. Create GitHub Release

```bash
# Create and push tag
git checkout main
git pull origin main
git tag -a v<version> -m "Release v<version>"
git push origin v<version>
```

Then create the GitHub release at https://github.com/PabloVitasso/Klaus-Code/releases:

1. Click "Draft a new release"
2. Select the tag `v<version>`
3. Upload the VSIX from `bin/klaus-code-<version>.vsix`
4. Copy release notes from the changelog
5. Publish

### Automated Release

**Script**: `scripts/release.sh`

Automates entire release: version updates, release notes, announcement ID, PR creation/merge, tagging, GitHub release.

```bash
./scripts/release.sh 3.46.1-klaus.2
```

**Prerequisites**: GitHub PAT with `repo` scope configured in gh CLI (`gh auth login`)

**Manual fallback**: See script source for individual commands.

---

## Merging Upstream Changes

Klaus Code periodically merges improvements from upstream Roo Code. Follow this process to safely integrate upstream changes while preserving Klaus Code-specific features.

### Merge Strategy

We use a **commit-by-commit merge strategy** where each upstream commit is:

1. Merged individually on its own branch
2. Tested thoroughly with automated and manual tests
3. Built into a test VSIX package
4. Documented in a tracking file

This approach provides:

- **Granular control** - Easy to identify which commit causes issues
- **Incremental testing** - Problems caught early before they compound
- **Rollback safety** - Can skip problematic commits without blocking others
- **Clear audit trail** - Each commit's impact is documented

### Pre-Merge Checklist

Before starting a merge, review the [Fork Divergence from Upstream](#fork-divergence-from-upstream) section to understand what must be preserved.

### Quick Merge Process (Recommended for Most Merges)

**1. Merge and Resolve Conflicts**

```bash
git fetch roocode
git checkout -b merge-upstream-$(date +%Y%m%d)
git merge roocode/main --no-edit
```

Resolve conflicts:

```bash
# Delete conflicts: remove files deleted in Klaus Code
git rm apps/web-roo-code/...

# Provider files: accept upstream (AI SDK migrations)
git checkout --theirs src/api/providers/*.ts

# Critical files: fix manually
# - src/package.json: publisher="KlausCode", version="X.Y.Z-klaus.1"
# - src/core/webview/ClineProvider.ts: accept new fields
# - Use sed for conflict markers (not Edit tool - indentation issues)
```

**2. Fix Branding and Install**

```bash
./scripts/merge-upstream-fix-branding.sh
git add -A
pnpm install  # Required for new dependencies
pnpm check-types
```

**3. Test and Fix**

```bash
cd src && npx vitest run integrations/claude-code/__tests__/
```

Fix test failures (often beta headers or expectations changed):

```bash
# Example: update test expectations to match current implementation
sed -i 's/old-beta/new-beta/' src/integrations/claude-code/__tests__/*.spec.ts
```

**4. Commit and Push**

```bash
cd .. && git add -A
git commit -m "chore: merge upstream Roo Code changes ($(date +%Y-%m-%d))

Merged N commits from upstream Roo Code main branch (vX.Y.Z).

Key changes:
- [List major changes]

Klaus Code preserved:
- OAuth provider + tool prefixing (oc_)
- Branding (@klaus-code imports)
- Version: X.Y.Z-klaus.1

Testing:
- check-types: ✓ PASSED
- Claude Code tests (N/N): ✓ PASSED"

git checkout main && git merge merge-upstream-$(date +%Y%m%d) --no-edit
git push origin main
```

**Optional: Manual Testing**

```bash
pnpm vsix && code --install-extension bin/klaus-code-*.vsix --force
# Test: OAuth login, tool use, rate limits
```

**Time**: 10-15 minutes for ~30 commits.

---

### Common Pitfalls

**Conflict marker resolution:** Use `sed`, not Edit tool (indentation issues)
**Test failures:** Update test expectations (beta headers, etc.)
**Type errors:** Always `pnpm install` before `check-types`
**Working directory:** Work from project root, not `src/`

---

### Commit-by-Commit Merge Process

This is the **recommended procedure** for merging upstream changes.

**💡 Pro Tip - Batching Strategy:**

You don't need to merge commits one-by-one. **Batch safe commits together:**

1. **Identify HIGH RISK commits** (tool calling, provider changes, OAuth)
2. **Batch all LOW/MEDIUM risk commits** into mega-batches
3. **Merge HIGH RISK commits individually** for careful review

Example from 2026-01-24 merge:

- 21 commits total
- Batched 18 safe commits → 1 merge cycle (86% done!)
- Left 3 HIGH RISK commits for individual merging

**Mega-Batch Command:**

```bash
# Skip HIGH RISK commits 8, 9, 16 and batch the rest
git cherry-pick commit1 commit2 ... commit7 commit10 ... commit15 commit17 ... commit21
```

This saves time while maintaining safety on critical changes.

#### Phase 1: Preparation

**1. Create Tracking Document**

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Fetch latest from upstream
git fetch roocode

# Find the last merged commit (look for "Merge upstream" in history)
git log --oneline --grep="Merge upstream" -n 1

# Get the list of new commits (replace LAST_MERGED_COMMIT with actual hash)
git log --format="%H|%h|%s|%an|%ad" --date=short --reverse LAST_MERGED_COMMIT..roocode/main

# Create tracking document
mkdir -p docs
# Document name format: docs/YYYY.MM.DD-merge-upstream.md
```

**2. Populate Tracking Document**

Create `docs/YYYY.MM.DD-merge-upstream.md` with:

- List of all commits (oldest to newest)
- Risk assessment for each commit:
    - 🟢 **LOW RISK** - Safe, minimal conflicts expected
    - 🟡 **MEDIUM RISK** - Review carefully, may affect related systems
    - 🔴 **HIGH RISK** - Critical review, may impact Claude Code provider/OAuth
- Files to check for each commit
- Testing checklist
- Merge status tracking (⏳ PENDING, ✅ MERGED, ⚠️ CONFLICT, ❌ FAILED)

See [docs/2026.01.24-merge-upstream.md](docs/2026.01.24-merge-upstream.md) as a template.

**3. Review Critical Areas**

Before merging, review what must be protected:

- Claude Code provider implementation
- OAuth flow
- Tool name prefixing (`oc_` prefix in streaming-client)
- Klaus Code branding

#### Phase 2: Individual Commit Merges

For each commit in the tracking document:

**1. Create Merge Branch**

```bash
# Branch naming: merge-upstream-<short-commit-hash>
git checkout main
git pull origin main
git checkout -b merge-upstream-abc1234
```

**2. Cherry-Pick the Commit**

```bash
# Cherry-pick the specific commit from upstream
git cherry-pick abc1234567890abcdef1234567890abcdef1234

# If conflicts occur, resolve them carefully:
# - For Claude Code files: prefer Klaus Code version
# - For provider infrastructure: ensure Claude Code provider is included
# - For branding: keep Klaus Code branding
# - Document conflicts in tracking file
```

**💡 Lessons Learned - Branding Conflicts:**

After cherry-picking commits, branding issues (`@roo-code` → `@klaus-code`) may appear in:

- Import statements in TypeScript/TSX files
- Type references

**Quick fix with sed:**

```bash
# Find all files with wrong branding in imports
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -exec grep -l "@roo-code" {} \;

# Fix all at once - safer to target specific import lines
sed -i 's/@roo-code\/types/@klaus-code\/types/g' path/to/file.ts
sed -i 's/@roo-code\/telemetry/@klaus-code\/telemetry/g' path/to/file.ts

# Or fix all at once (use with caution):
find src webview-ui -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i 's/@roo-code\//@klaus-code\//g' {} \;
```

**Always verify after bulk changes:**

```bash
pnpm check-types  # Catch any remaining branding issues
grep -r "@roo-code" src/ webview-ui/  # Verify all fixed
```

**3. Resolve Conflicts (if any)**

**Critical files - preserve Klaus Code version:**

```bash
git checkout --ours src/integrations/claude-code/
git checkout --ours src/api/providers/claude-code.ts
# Manually review and resolve other conflicts
```

**Provider infrastructure - merge carefully:**

- Check `src/api/index.ts` includes Claude Code provider
- Verify `src/api/providers/index.ts` exports Claude Code
- Ensure settings UI includes Claude Code

**4. Verify Critical Features**

```bash
# Check Claude Code provider files exist
ls src/integrations/claude-code/
ls src/api/providers/claude-code.ts

# Check tool name prefixing code is intact
grep "TOOL_NAME_PREFIX" src/integrations/claude-code/streaming-client.ts
grep "prefixToolName" src/integrations/claude-code/streaming-client.ts

# Verify branding
grep '"klaus-code"' src/package.json
```

**5. Run Automated Tests**

```bash
# Install dependencies (if package.json changed)
pnpm install

# Type checking
pnpm check-types

# Run all tests
pnpm test

# Run Claude Code specific tests
cd src && npx vitest run integrations/claude-code/__tests__/
cd ..
```

**6. Create Test Build**

```bash
# Clean and build
pnpm clean
pnpm build

# Create VSIX with commit hash in filename
pnpm vsix

# Rename to include commit hash
# Format: klaus-code-<version>-<commit-hash>.vsix
mv bin/klaus-code-*.vsix bin/klaus-code-3.43.0-klaus.1-abc1234.vsix

# Install for manual testing
code --install-extension bin/klaus-code-3.43.0-klaus.1-abc1234.vsix --force
```

**7. Manual Testing**

Test the following in VS Code with the installed extension:

**Claude Code OAuth Flow:**

- Settings → API Provider → Select "Claude Code"
- Click "Login with Claude Code"
- Verify OAuth completes successfully

**Tool Use with Claude Code:**

- Create a new task
- Ask it to read a file: "What's in the README?"
- Ask it to execute a command: "List the files in this directory"
- Verify tools work (no OAuth rejection errors)
- Check console for tool name prefixing (should see `oc_` prefix in requests)

**Rate Limit Dashboard:**

- With Claude Code provider selected
- Verify rate limit info displays in settings

**Regression Testing:**

- Test another provider (e.g., Anthropic API)
- Ensure no regressions in core functionality

**8. Update Tracking Document**

Mark the commit status:

- ✅ **MERGED** - Successfully merged and tested
- ⚠️ **CONFLICT** - Had conflicts, document resolution approach
- ❌ **FAILED** - Merge caused test failures or critical issues

Add notes about:

- Conflicts encountered and how resolved
- Test results
- Any issues found
- Manual testing observations

**9. Push Branch (Optional)**

```bash
# Push the test branch for review or backup
git push origin merge-upstream-abc1234
```

**10. Repeat for Next Commit**

Start over at step 1 for the next commit in the tracking document.

#### Phase 3: Final Integration

Once all commits are merged individually:

**1. Create Final Merge Branch**

```bash
git checkout main
git pull origin main
git checkout -b merge-upstream-YYYYMMDD-final
```

**2. Cherry-Pick All Merged Commits**

```bash
# Cherry-pick all commits in order
git cherry-pick abc1234..xyz9876
```

**3. Update Version**

Edit `src/package.json`:

```json
{
	"version": "3.43.0-klaus.1"
}
```

**4. Update Announcement**

Update files for new release (see [Creating a Release](#creating-a-release)):

- `webview-ui/src/i18n/locales/en/chat.json`
- `src/core/webview/ClineProvider.ts` (`latestAnnouncementId`)

**5. Final Testing**

Run complete test suite one more time:

```bash
pnpm install
pnpm check-types
pnpm test
cd src && npx vitest run integrations/claude-code/__tests__/
cd ..
pnpm clean && pnpm vsix
code --install-extension bin/klaus-code-*.vsix --force
```

Perform full manual testing as described in Phase 2, step 7.

**6. Commit and Push**

```bash
git add .
git commit -m "chore: merge upstream Roo Code changes ($(date +%Y-%m-%d))

Merged commits:
- abc1234: Feature 1
- def5678: Feature 2
- xyz9876: Feature 3

See docs/YYYY.MM.DD-merge-upstream.md for detailed tracking."

git push origin merge-upstream-YYYYMMDD-final
```

**7. Create Pull Request**

```bash
gh pr create --base main \
  --title "Merge upstream Roo Code changes ($(date +%Y-%m-%d))" \
  --body "## Overview

Merges upstream changes from Roo Code.

## Tracking Document

See \`docs/YYYY.MM.DD-merge-upstream.md\` for detailed commit-by-commit tracking.

## Changes

- X commits merged
- Y high-risk commits reviewed carefully
- All tests passing
- Manual testing completed

## Testing

- [x] Type checking passed
- [x] All automated tests passed
- [x] Claude Code OAuth flow tested
- [x] Tool use with Claude Code tested
- [x] Rate limit dashboard tested
- [x] Regression testing completed

## Claude Code Provider

- [x] Provider files unchanged/reviewed
- [x] OAuth flow works correctly
- [x] Tool name prefixing intact
- [x] No regressions"
```

#### Phase 4: Handling Failed Commits

If a commit cannot be merged safely:

**1. Document the Issue**

In the tracking document:

- Mark as ❌ **FAILED**
- Document why it failed
- Note if it blocks other commits
- Decide: Skip, fix later, or requires upstream discussion

**2. Skip and Continue**

```bash
# Skip the problematic commit
git cherry-pick --skip
# Or abort and continue with next commit
git cherry-pick --abort
```

**3. Create Issue for Follow-up**

```bash
gh issue create --title "Upstream commit abc1234 conflicts with Klaus Code" \
  --body "Commit abc1234 from upstream cannot be merged cleanly.

**Issue:** [description]
**Impact:** [what features are affected]
**Action needed:** [skip permanently / needs custom implementation / upstream discussion]"
```

### Rollback Procedure

If merge causes critical issues:

```bash
# Abort ongoing cherry-pick
git cherry-pick --abort

# Or reset branch to main
git checkout main
git branch -D merge-upstream-abc1234

# Document in tracking file why rollback was needed
```

### Alternative: Bulk Merge (Not Recommended)

For reference only. Use Quick Merge Process above for better results. See git history or backup for legacy instructions.

## Helper Scripts

Klaus Code includes helper scripts to automate common development tasks:

### Branding Fix Script

**Location**: `scripts/merge-upstream-fix-branding.sh`

**Purpose**: Automatically fixes Klaus Code branding after merging from upstream Roo Code.

**Usage**:

```bash
./scripts/merge-upstream-fix-branding.sh
```

**What it does**:

- Replaces all `@roo-code/` imports with `@klaus-code/` in source files
- Fixes package.json dependencies
- Verifies critical Klaus Code files are preserved:
    - Claude Code provider files
    - Tool name prefixing code (`oc_` prefix)
    - Branding in key configuration files
- Reports detailed status of all operations
- Continues on errors (won't fail completely if one step fails)

**When to use**:

- After merging upstream changes from Roo Code
- When you see TypeScript errors about `@roo-code/types` imports
- To verify Klaus Code-specific features are intact after a merge

**Safe to run multiple times** - the script is idempotent and won't break anything if run repeatedly.

---

## Troubleshooting

### pnpm not found

```bash
npm install -g pnpm@10.8.1
```

### Build fails with "vitest: command not found"

You're running tests from the wrong directory. See [Running Individual Tests](#running-individual-tests).

### VSIX build warnings about bundle size

This is normal. The extension includes all dependencies. To reduce size:

```bash
# Bundle the extension (advanced)
pnpm bundle
pnpm vsix
```

### Hot reload not working in debug mode

1. Restart the debug session (Ctrl+Shift+F5)
2. Check the VS Code debug console for errors
3. Ensure you're running from the project root

### Dependencies installation issues

```bash
# Clear cache and reinstall
pnpm store prune
rm -rf node_modules
pnpm install
```

### TypeScript errors

```bash
# Check types
pnpm check-types

# Fix common issues
pnpm format
pnpm lint
```

---

## Project Structure

```
Klaus-Code/
├── src/                    # Main VS Code extension
│   ├── api/               # LLM provider integrations
│   ├── core/              # Agent core logic
│   ├── services/          # Supporting services
│   └── integrations/      # VS Code integrations
├── webview-ui/            # React frontend
├── packages/              # Shared packages
│   ├── types/            # Shared TypeScript types
│   ├── core/             # Core utilities
│   ├── cloud/            # Cloud integration
│   └── telemetry/        # Telemetry service
├── bin/                   # Built VSIX packages
└── DEVELOPMENT.md         # This file
```

For more details, see [CLAUDE.md](CLAUDE.md) for AI-specific development guidance.

---

## Additional Resources

- **Project Repository**: https://github.com/PabloVitasso/Klaus-Code
- **Original Fork Source**: https://github.com/RooCodeInc/Roo-Code
- **VS Code Extension API**: https://code.visualstudio.com/api

---

_Last updated: 2026-01-23_
_Divergence tracking added: 2026-01-23_
