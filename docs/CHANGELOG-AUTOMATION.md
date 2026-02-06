# Changelog Automation

This document explains the automated changelog system for Klaus Code.

## Overview

Klaus Code now has **three automated workflows** that keep changelogs up-to-date:

```
┌─────────────────────────────────────────────────────────────┐
│                   Changelog Automation Flow                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Daily (2 AM UTC)                                           │
│  ┌────────────────────────────────┐                         │
│  │ Nightly Changelog Update       │                         │
│  │ (.github/workflows/            │                         │
│  │  nightly-changelog.yml)        │                         │
│  └────────────────┬───────────────┘                         │
│                   │                                          │
│                   ├─ Analyzes commits since last weekly     │
│                   ├─ Generates changeset file              │
│                   ├─ Creates preview changelog             │
│                   └─ Opens PR for review                    │
│                                                              │
│  Weekly (Sunday midnight UTC)                               │
│  ┌────────────────────────────────┐                         │
│  │ Weekly Build                   │                         │
│  │ (.github/workflows/            │                         │
│  │  weekly-build.yml)             │                         │
│  └────────────────┬───────────────┘                         │
│                   │                                          │
│                   ├─ Generates rich changelog              │
│                   ├─ Builds VSIX package                   │
│                   └─ Creates GitHub pre-release            │
│                                                              │
│  Manual (when ready for stable release)                     │
│  ┌────────────────────────────────┐                         │
│  │ Prepare Release                │                         │
│  │ (./scripts/prepare-release.sh) │                         │
│  └────────────────┬───────────────┘                         │
│                   │                                          │
│                   ├─ Creates changeset from commits        │
│                   ├─ Determines version bump (major/minor/  │
│                   │   patch)                               │
│                   └─ Generates release notes               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Workflow Details

### 1. Nightly Changelog Update

**Schedule**: Every night at 2 AM UTC
**Trigger**: Automatic (can also be triggered manually)
**What it does**:

1. Checks for new commits since last weekly build
2. If commits found:
    - Generates a changeset file (`.changeset/auto-YYYYMMDD.md`)
    - Categorizes commits by type (feat, fix, docs, etc.)
    - Determines appropriate version bump (major/minor/patch)
    - Creates a PR with:
        - The changeset file
        - Preview of the upcoming changelog
        - Commit statistics
3. If no commits: Exits silently

**Example PR**:

```markdown
## Automated Changelog Update

This PR contains automatically generated changelog entries.

### Summary

- **Commits analyzed**: 12
- **Since**: `weekly-v0.0.5500`

### What's included:

- ✅ New changeset file in `.changeset/`
- ✅ Auto-categorized by commit type

### Preview Changelog

## What's Changed

### ✨ Features

- feat: implement Claude Code quota check
- feat: add usage tracking UI

### 🐛 Bug Fixes

- fix: correct rate limit parsing

### 📚 Documentation

- docs: add usage tracking guide
```

**Actions Required**:

- Review the PR
- Edit changeset if needed
- Merge when satisfied
- Changes will be included in next weekly build

### 2. Weekly Build

**Schedule**: Every Sunday at midnight UTC
**Trigger**: Automatic (can also be triggered manually)
**What it does**:

1. Generates version number (auto-incremented)
2. Builds VSIX package
3. **Generates rich changelog**:
    - Scans all commits since last weekly tag
    - Groups by category (Features, Bug Fixes, Docs, Other)
    - Adds commit statistics
    - Includes full diff link
4. Creates GitHub pre-release with:
    - Rich changelog in release notes
    - VSIX attachment
    - Pre-release badge

**Example Release Notes**:

```markdown
## What's Changed

### ✨ Features

- feat: implement Claude Code quota check and remove Opus 4.6 [1M]
- feat: add usage tracking UI with 3 progress bars

### 🐛 Bug Fixes

- fix: correct rate limit header parsing
- fix: handle missing overage data

### 📚 Documentation

- docs: add usage tracking implementation guide
- docs: update release process documentation

### 🔧 Other Changes

- chore: update dependencies
- refactor: simplify quota logic
- ci: improve weekly build changelog

---

**Full Changelog**: https://github.com/user/repo/compare/weekly-v0.0.5500...weekly-v0.0.5501

📊 **15** commits in this release
```

### 3. Prepare Release (Manual)

**Trigger**: Manual script execution
**What it does**:

1. Analyzes commits since last tag
2. Determines version bump type based on:
    - BREAKING CHANGE → major (1.0.0 → 2.0.0)
    - feat: → minor (1.0.0 → 1.1.0)
    - fix: → patch (1.0.0 → 1.0.1)
3. Creates changeset with grouped commits
4. Shows next steps for releasing

**Usage**:

```bash
# Generate changeset from recent commits
./scripts/prepare-release.sh

# Or specify starting point
./scripts/prepare-release.sh v3.47.0

# Then follow the prompts to:
# 1. Review changeset
# 2. Commit changeset
# 3. Run version bump
# 4. Create release
```

## Commit Message Format

For best results, use **Conventional Commits**:

| Prefix      | Category in Changelog | Example                            |
| ----------- | --------------------- | ---------------------------------- |
| `feat:`     | ✨ Features           | `feat: add quota tracking`         |
| `fix:`      | 🐛 Bug Fixes          | `fix: parse rate limits correctly` |
| `docs:`     | 📚 Documentation      | `docs: update README`              |
| `chore:`    | 🔧 Other Changes      | `chore: update deps`               |
| `refactor:` | 🔧 Other Changes      | `refactor: simplify logic`         |
| `test:`     | 🔧 Other Changes      | `test: add quota tests`            |
| `ci:`       | 🔧 Other Changes      | `ci: update workflow`              |

**Breaking Changes**:

```bash
git commit -m "feat: redesign API

BREAKING CHANGE: Settings now require auth token"
```

## Files Created

### Workflows

- `.github/workflows/nightly-changelog.yml` - Auto-generates changelog PRs
- `.github/workflows/weekly-build.yml` - Weekly pre-release with rich changelog

### Scripts

- `scripts/generate-weekly-changelog.sh` - Generate markdown changelog from git
- `scripts/prepare-release.sh` - Create changeset for stable release

### Documentation

- `docs/RELEASE-PROCESS.md` - Complete release guide
- `docs/CHANGELOG-AUTOMATION.md` - This file

## Benefits

✅ **Automated Weekly Releases**

- Rich changelogs without manual work
- Consistent format
- Links to full diffs

✅ **Automated Changelog PRs**

- Daily checks for new commits
- Auto-categorized entries
- Review before merge

✅ **Easy Stable Releases**

- Script generates changesets
- Conventional commit support
- Version bump automation

✅ **Developer Friendly**

- No extra work required
- Works with existing git workflow
- Optional manual override

## Manual Workflows

### Test Changelog Generation Locally

```bash
# Generate changelog for commits since last weekly tag
./scripts/generate-weekly-changelog.sh

# Or specify a starting point
./scripts/generate-weekly-changelog.sh weekly-v0.0.5500
```

### Trigger Workflows Manually

```bash
# Trigger nightly changelog update
gh workflow run nightly-changelog.yml

# Trigger weekly build
gh workflow run weekly-build.yml

# Check workflow runs
gh run list --workflow=nightly-changelog.yml
gh run list --workflow=weekly-build.yml
```

### Create Changeset Manually

```bash
# Interactive (recommended)
pnpm changeset

# Or use script
./scripts/prepare-release.sh

# Or create file manually
# .changeset/my-feature.md:
---
"klaus-code": minor
---

### ✨ Features
- feat: add new feature
```

## Troubleshooting

### Nightly PR not created

Check:

1. Are there new commits since last weekly build?
2. Does the workflow have write permissions?
3. Check workflow logs: Actions → Nightly Changelog Update

### Weekly build has no changelog

Check:

1. Are commits using conventional format?
2. Is the last weekly tag correct? (`git tag --list 'weekly-v*'`)
3. Check workflow logs: Actions → Weekly Build

### Changelog missing commits

Make sure commits:

1. Are on the main branch
2. Use conventional commit prefixes (feat:, fix:, docs:)
3. Are between the correct tags

## Configuration

### Change nightly schedule

Edit `.github/workflows/nightly-changelog.yml`:

```yaml
on:
    schedule:
        - cron: "0 2 * * *" # 2 AM UTC (change as needed)
```

### Change weekly schedule

Edit `.github/workflows/weekly-build.yml`:

```yaml
on:
    schedule:
        - cron: "0 0 * * 0" # Sunday midnight UTC (change as needed)
```

### Customize changelog categories

Edit `scripts/generate-weekly-changelog.sh` to add/remove sections.

## Future Enhancements

Possible improvements:

- [ ] Auto-merge changelog PRs after review period
- [ ] Notify on Slack/Discord when PR created
- [ ] Generate release notes for stable versions
- [ ] Auto-publish to VS Code Marketplace
- [ ] Add contributor statistics
- [ ] Generate visual changelog (with screenshots)
