# Release Process

This document describes the release process for Klaus Code, including weekly builds and stable releases.

## Weekly Builds (Automated)

Weekly builds are created automatically every Sunday at midnight UTC via GitHub Actions.

### What Happens Automatically

1. **Version Numbering**: Each weekly build gets a version `0.0.XXXX` where XXXX is auto-incremented
2. **Changelog Generation**: Commits since last weekly build are automatically formatted into a changelog
3. **GitHub Release**: A pre-release is created with:
    - Rich changelog grouped by type (Features, Bug Fixes, Documentation, Other)
    - Commit statistics
    - Link to full diff
    - VSIX file attachment

### Changelog Format

The weekly build changelog automatically includes:

- ✨ **Features**: Commits starting with `feat:`
- 🐛 **Bug Fixes**: Commits starting with `fix:`
- 📚 **Documentation**: Commits starting with `docs:`
- 🔧 **Other Changes**: All other commits (chore, refactor, etc.)

**Example Output:**

```markdown
## What's Changed

### ✨ Features

- feat: implement Claude Code quota check
- feat: add usage tracking UI

### 🐛 Bug Fixes

- fix: correct rate limit parsing

### 📚 Documentation

- docs: add usage tracking guide

### 🔧 Other Changes

- chore: update dependencies
- refactor: simplify quota logic

---

**Full Changelog**: weekly-v0.0.5500...weekly-v0.0.5501

📊 **15** commits in this release
```

### Triggering Manual Weekly Build

```bash
# Via GitHub Actions UI:
# 1. Go to Actions → Weekly Build
# 2. Click "Run workflow"
# 3. Select branch (usually main)
# 4. Click "Run workflow"

# Or via GitHub CLI:
gh workflow run weekly-build.yml
```

## Stable Releases (Manual)

Stable releases use changesets for version management and changelog generation.

### Step 1: Create Changeset

When you complete a feature or fix, create a changeset:

```bash
# Interactive prompt (recommended)
pnpm changeset

# Or use the automated script
./scripts/prepare-release.sh

# This creates a file like .changeset/pretty-lions-jump.md
```

The changeset file describes:

- What changed
- Which packages are affected
- Version bump type (major/minor/patch)

### Step 2: Commit Changeset

```bash
git add .changeset/*.md
git commit -m "chore: add changeset for [feature/fix description]"
git push
```

### Step 3: Version Bump (When Ready to Release)

```bash
# This will:
# 1. Update package.json versions
# 2. Generate CHANGELOG.md entries
# 3. Delete consumed changeset files
pnpm changeset version

# Review changes
git diff

# Commit version bump
git add .
git commit -m "chore: version packages"
git push
```

### Step 4: Build and Tag

```bash
# Build the release
pnpm vsix

# Create git tag
git tag -a v3.47.3 -m "Release v3.47.3"
git push origin v3.47.3
```

### Step 5: Create GitHub Release

```bash
# Create release with generated changelog
gh release create v3.47.3 \
  --title "Klaus Code v3.47.3" \
  --notes-file CHANGELOG.md \
  bin/klaus-code-*.vsix
```

Or manually:

1. Go to GitHub → Releases → Draft a new release
2. Choose tag: v3.47.3
3. Copy changelog from CHANGELOG.md
4. Attach VSIX file
5. Publish release

## Commit Message Conventions

To get proper changelogs, use conventional commits:

| Type        | Description                               | Example                             |
| ----------- | ----------------------------------------- | ----------------------------------- |
| `feat:`     | New feature                               | `feat: add quota tracking UI`       |
| `fix:`      | Bug fix                                   | `fix: correct rate limit parsing`   |
| `docs:`     | Documentation changes                     | `docs: update installation guide`   |
| `chore:`    | Maintenance (deps, build, etc.)           | `chore: update dependencies`        |
| `refactor:` | Code refactoring                          | `refactor: simplify quota logic`    |
| `test:`     | Adding or updating tests                  | `test: add quota check tests`       |
| `perf:`     | Performance improvements                  | `perf: optimize rate limit parsing` |
| `ci:`       | CI/CD changes                             | `ci: update weekly build workflow`  |
| `style:`    | Code style changes (formatting, no logic) | `style: format with prettier`       |

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the commit body:

```bash
git commit -m "feat: redesign settings API

BREAKING CHANGE: Settings API now requires authentication token"
```

## Changelog Best Practices

### Good Commit Messages

✅ **Good:**

```
feat: add Claude Code quota check with 3-tier rate limits
fix: parse overage utilization from response headers
docs: add usage tracking implementation guide
```

❌ **Bad:**

```
update stuff
fixed bug
changes
```

### Commit Message Components

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Example:**

```
feat(claude-code): implement quota tracking

- Add quota check API call matching official CLI
- Parse unified rate limit headers (5h, 7d, overage)
- Display 3 usage bars in UI

Closes #123
```

## Scripts

| Script                                   | Description                          |
| ---------------------------------------- | ------------------------------------ |
| `./scripts/prepare-release.sh`           | Auto-generate changeset from commits |
| `./scripts/generate-weekly-changelog.sh` | Generate markdown changelog          |
| `pnpm changeset`                         | Create changeset interactively       |
| `pnpm changeset version`                 | Bump versions and update CHANGELOG   |
| `pnpm vsix`                              | Build production VSIX                |
| `pnpm vsix:nightly`                      | Build weekly VSIX                    |

## Version Numbers

- **Weekly builds**: `0.0.XXXX` (auto-incremented)
- **Stable releases**: Semantic versioning `MAJOR.MINOR.PATCH`
    - **MAJOR**: Breaking changes
    - **MINOR**: New features (backwards compatible)
    - **PATCH**: Bug fixes (backwards compatible)

## GitHub Actions Workflows

| Workflow       | Trigger         | Purpose                   |
| -------------- | --------------- | ------------------------- |
| `weekly-build` | Weekly + Manual | Automated pre-releases    |
| TBD            | Tag push        | Stable release publishing |

## Troubleshooting

### "No commits since last weekly build"

This means no changes were pushed to main since the last weekly build. The workflow will create an empty release noting this.

### Changeset not picked up

Make sure:

1. Changeset file is in `.changeset/` directory
2. File has correct frontmatter with package name and version bump type
3. File is committed to git

### Weekly build missing commits

Check:

1. Commits are on `main` branch
2. Commits use conventional commit format
3. GitHub Actions has permissions to read repository

## Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
