# Release Process

This document describes how to create releases for llmux, including both local development builds and official CI/CD releases.

## Overview

llmux uses a hybrid build approach:

- **Local builds**: Fast iteration during development (current platform only)
- **CI releases**: Automated multi-platform builds via GitHub Actions

## Local Development Builds

Build a native executable for your current platform:

```bash
bun run build:binary
```

This produces a single-file executable in `dist/`:

- macOS ARM64: `dist/llmux-v0.1.0-darwin-arm64`
- macOS Intel: `dist/llmux-v0.1.0-darwin-x64`
- Linux x64: `dist/llmux-v0.1.0-linux-x64`
- Windows x64: `dist/llmux-v0.1.0-windows-x64.exe`

### Build Options

```bash
# Build for current platform (default)
bun run build:binary

# Build for specific target
bun run scripts/build.ts --target bun-linux-x64

# Custom output path
bun run scripts/build.ts --output ./my-llmux-binary

# Verbose output
bun run scripts/build.ts --verbose
```

### Supported Targets

| Target             | Platform | Architecture             |
| ------------------ | -------- | ------------------------ |
| `bun-darwin-arm64` | macOS    | Apple Silicon (M1/M2/M3) |
| `bun-darwin-x64`   | macOS    | Intel                    |
| `bun-linux-x64`    | Linux    | x86-64                   |
| `bun-linux-arm64`  | Linux    | ARM64                    |
| `bun-windows-x64`  | Windows  | x86-64                   |

## CI/CD Releases

Official releases are built automatically via GitHub Actions when you push a version tag.

### Creating a Release

1. **Ensure all changes are committed and pushed**

2. **Update version in `package.json`** (if not already updated)

3. **Create and push a version tag**:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **GitHub Actions automatically**:
   - Builds binaries for all 5 platforms
   - Creates a draft GitHub Release
   - Attaches all binary artifacts

5. **Review and publish the release**:
   - Go to GitHub Releases page
   - Review the draft release
   - Edit release notes if needed
   - Click "Publish release" (or keep as draft for further testing)

### Release Tag Format

- **Stable releases**: `v1.0.0`, `v0.2.0`
- **Pre-releases**: `v1.0.0-rc1`, `v0.2.0-beta.1`, `v0.2.0-alpha.1`

Pre-release tags (containing `-rc`, `-beta`, or `-alpha`) are automatically marked as pre-releases on GitHub.

### Platform Support Matrix

| OS      | Architecture          | Status       | Notes                             |
| ------- | --------------------- | ------------ | --------------------------------- |
| macOS   | ARM64 (Apple Silicon) | ✅ Supported | Native builds on macOS 14 runners |
| macOS   | x64 (Intel)           | ✅ Supported | Native builds on macOS 13 runners |
| Linux   | x64                   | ✅ Supported | Native builds on Ubuntu runners   |
| Linux   | ARM64                 | ✅ Supported | Cross-compiled with QEMU          |
| Windows | x64                   | ✅ Supported | Native builds on Windows runners  |
| Windows | ARM64                 | ⚠️ Planned   | Not yet implemented               |

## Artifact Naming Convention

All release artifacts follow this pattern:

```
llmux-v{VERSION}-{PLATFORM}-{ARCH}
```

Examples:

- `llmux-v0.2.0-darwin-arm64` (macOS Apple Silicon)
- `llmux-v0.2.0-linux-x64` (Linux x86-64)
- `llmux-v0.2.0-windows-x64.exe` (Windows x86-64)

## Testing Releases

### Before Publishing

1. Download the draft release artifacts
2. Test on target platforms:
   ```bash
   chmod +x llmux-v0.2.0-darwin-arm64
   ./llmux-v0.2.0-darwin-arm64 --help
   ```
3. Verify the binary runs without errors

### Quick Smoke Test

```bash
# Check version embedded in binary
strings llmux-v0.2.0-darwin-arm64 | grep "0.2.0"

# Test binary execution (will fail on missing config, that's expected)
./llmux-v0.2.0-darwin-arm64 2>&1 | head -1
# Expected: Configuration file not found...
```

## Troubleshooting

### Build Failures

**Error: "Invalid target"**

- Check the target name matches one of the supported targets exactly
- Use `bun run scripts/build.ts --help` to see valid targets

**Error: "Build failed with exit code 1"**

- Ensure Bun is installed and on PATH: `bun --version`
- Check that source files compile: `bun run typecheck`
- Verify no syntax errors in `src/index.ts`

### CI Failures

**Workflow doesn't trigger**

- Ensure tag format is `v*` (e.g., `v0.2.0`)
- Check tag was pushed to GitHub: `git ls-remote --tags origin`
- Verify `.github/workflows/release.yml` exists on the tagged commit

**ARM64 build fails**

- Linux ARM64 uses QEMU emulation which can be slow
- If timeouts occur, increase runner timeout or split into separate job

### Binary Issues

**Binary runs but can't find config**

- This is expected behavior - llmux requires a config file
- Create `config/config.yaml` from the example

**Binary size is large**

- Bun compile produces ~60-70 MB binaries (includes Bun runtime)
- This is normal and expected for single-file executables

## Rollback Procedure

If a release has issues:

1. **Delete the GitHub Release** (if published):
   - Go to Releases page
   - Click "Delete" on the problematic release

2. **Delete the git tag**:

   ```bash
   git push --delete origin v0.2.0
   git tag -d v0.2.0
   ```

3. **Create a new release** with fixed code:
   ```bash
   # Make fixes, commit, then:
   git tag v0.2.1
   git push origin v0.2.1
   ```

Note: Deleting a tag does not cancel in-progress workflow runs. Use draft releases initially to avoid publishing bad builds.

## Future Improvements

- [ ] Windows ARM64 support
- [ ] macOS code signing and notarization
- [ ] Automated changelog generation
- [ ] Homebrew tap formula
- [ ] Chocolatey package for Windows
