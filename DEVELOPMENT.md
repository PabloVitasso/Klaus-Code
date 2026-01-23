# Klaus Code Development Guide

> Developer documentation for building and releasing Klaus Code

## Table of Contents

- [Fork Divergence from Upstream](#fork-divergence-from-upstream)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Building from Source](#building-from-source)
- [Development Workflow](#development-workflow)
- [Creating a Release](#creating-a-release)
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

---

## Merging Upstream Changes

Klaus Code periodically merges improvements from upstream Roo Code. Follow this process to safely integrate upstream changes while preserving Klaus Code-specific features.

### Pre-Merge Checklist

Before starting a merge, review the [Fork Divergence from Upstream](#fork-divergence-from-upstream) section to understand what must be preserved.

### Step-by-Step Merge Process

#### 1. Prepare Your Environment

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Fetch latest from upstream
git fetch roocode

# Check what's new in upstream
git log --oneline main..roocode/main | head -20
```

#### 2. Create a Merge Branch

```bash
# Create dated branch for the merge
git checkout -b merge-upstream-$(date +%Y%m%d)
```

#### 3. Backup Klaus Code-Specific Changes

```bash
# Save current divergence for reference
git diff roocode/main HEAD -- src/integrations/claude-code/ > ~/klaus-code-diff-backup.patch
git diff roocode/main HEAD -- src/api/providers/claude-code.ts >> ~/klaus-code-diff-backup.patch
```

#### 4. Attempt the Merge

```bash
git merge roocode/main
```

#### 5. Resolve Conflicts

**If conflicts occur**, they will likely be in:

**Critical files (preserve Klaus Code version):**

- `src/integrations/claude-code/*` - Keep Klaus Code version entirely
- `src/api/providers/claude-code.ts` - Keep Klaus Code version entirely
- `packages/types/src/providers/claude-code.ts` - Keep Klaus Code version entirely
- `webview-ui/src/components/settings/providers/ClaudeCode*.tsx` - Keep Klaus Code version

**Branding files (preserve Klaus Code branding):**

- `package.json`, `src/package.json` - Keep `klaus-code` name, `KlausCode` publisher
- `*.nls*.json` - Keep "Klaus Code" display names
- `webview-ui/src/i18n/locales/*/*.json` - Keep "Klaus Code" translations

**Provider infrastructure (merge carefully):**

- `src/api/index.ts` - Ensure Claude Code provider is included
- `src/api/providers/index.ts` - Ensure Claude Code export is present
- `src/core/config/ProviderSettingsManager.ts` - Preserve Claude Code handling

**Resolution strategy:**

```bash
# For Claude Code files, use ours
git checkout --ours src/integrations/claude-code/
git checkout --ours src/api/providers/claude-code.ts

# For other conflicts, resolve manually
git status  # Check remaining conflicts
# Edit conflicted files
git add <resolved-files>
```

#### 6. Verify Critical Features Preserved

After resolving conflicts:

```bash
# Check Claude Code provider is still present
ls src/integrations/claude-code/
ls src/api/providers/claude-code.ts

# Check tool prefixing code is intact
grep "TOOL_NAME_PREFIX" src/integrations/claude-code/streaming-client.ts
grep "prefixToolName" src/integrations/claude-code/streaming-client.ts

# Verify branding
grep '"klaus-code"' src/package.json
grep '"Klaus Code"' src/package.nls.json
```

#### 7. Complete the Merge

```bash
git commit  # Complete the merge commit
```

#### 8. Update Version

```bash
# Edit src/package.json
# Change "version": "X.Y.Z" to "version": "X.Y.Z-klaus.1"
# (or increment -klaus.N if already on this upstream version)
```

#### 9. Test Thoroughly

```bash
# Install dependencies (in case of changes)
pnpm install

# Type check
pnpm check-types

# Run tests
pnpm test

# Run Claude Code specific tests
cd src && npx vitest run integrations/claude-code/__tests__/

# Build VSIX
pnpm clean
pnpm vsix

# Install and test
code --install-extension bin/klaus-code-*.vsix --force
```

#### 10. Manual Testing

Open VS Code with the newly installed extension and test:

1. **Claude Code OAuth Flow**:

    - Go to Settings → API Provider
    - Select "Claude Code"
    - Click "Login with Claude Code"
    - Verify OAuth flow completes successfully

2. **Tool Use with Claude Code**:

    - Create a new task
    - Ask it to read a file or execute a command
    - Verify tools work correctly (no OAuth rejection errors)

3. **Rate Limit Dashboard**:

    - With Claude Code provider selected
    - Verify rate limit info displays in settings

4. **Other Providers** (regression testing):
    - Test at least one other provider (e.g., Anthropic API)
    - Ensure no regressions in other functionality

#### 11. Push and Create PR

```bash
git push origin merge-upstream-$(date +%Y%m%d)

# Create PR for review
gh pr create --base main --title "Merge upstream changes from Roo Code" --body "..."
```

### Common Merge Scenarios

#### Scenario 1: Upstream Modified Provider Infrastructure

If upstream changes affect how providers are loaded or configured:

1. Review changes to `src/api/providers/index.ts` and related files
2. Ensure Claude Code provider is still exported and registered
3. Test provider selection in UI after merge

#### Scenario 2: Upstream Added New Provider

New providers from upstream can usually be merged cleanly:

1. Accept all changes for the new provider
2. Ensure it doesn't conflict with Claude Code provider
3. Test that provider shows in dropdown alongside Claude Code

#### Scenario 3: Upstream Changed OAuth Handling

If OAuth infrastructure changes:

1. Review Claude Code OAuth implementation carefully
2. May need to adapt `src/integrations/claude-code/oauth.ts` to new patterns
3. Thoroughly test OAuth flow after merge

### Rollback Procedure

If merge causes issues:

```bash
# Abort ongoing merge
git merge --abort

# Or reset completed merge
git reset --hard origin/main

# Restore from backup
git apply ~/klaus-code-diff-backup.patch
```

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
