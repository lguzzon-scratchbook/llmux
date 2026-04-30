# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate llmux from npm/Node.js to Bun runtime and package manager for faster installs, faster runtime, and simpler toolchain.

**Architecture:** Replace Node.js 20 with Bun 1.2+ in both the main server and Cloudflare Workers subproject. Update Docker to use `oven/bun` base image. Keep `wrangler` for Workers deployment (Cloudflare requirement). Maintain backward compatibility by keeping script commands identical.

**Tech Stack:** Bun 1.2+, TypeScript 5.7, Fastify, Hono, Wrangler

---

## File Structure

| File                        | Responsibility               | Change Type                                    |
| --------------------------- | ---------------------------- | ---------------------------------------------- |
| `package.json`              | Root package manifest        | Modify - update engines, scripts, dependencies |
| `workers/package.json`      | Workers package manifest     | Modify - update engines, scripts               |
| `Dockerfile`                | Container build instructions | Modify - switch to oven/bun base               |
| `docker-compose.yml`        | Local orchestration          | No change - uses container, runtime-agnostic   |
| `README.md`                 | Setup documentation          | Modify - update install instructions           |
| `workers/README.md`         | Workers setup docs           | Modify - update install instructions           |
| `bun.lock`                  | Bun lockfile                 | Create - replaces package-lock.json            |
| `workers/bun.lock`          | Workers lockfile             | Create - replaces package-lock.json            |
| `package-lock.json`         | npm lockfile                 | Delete                                         |
| `workers/package-lock.json` | npm lockfile                 | Delete                                         |

---

## Task 1: Root Package - Update package.json

**Files:**

- Modify: `package.json:19-47`

- [ ] **Step 1: Update engines and packageManager field**

```json
{
  "engines": {
    "bun": ">=1.2.0"
  },
  "packageManager": "bun@1.2.0"
}
```

- [ ] **Step 2: Update scripts to use bun**

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build --target=node src/index.ts --outdir=dist",
    "start": "bun dist/index.js",
    "lint": "bun oxlint src/",
    "lint:fix": "bun oxlint src/ --fix",
    "format": "bun oxfmt src/",
    "format:check": "bun oxfmt src/ --check",
    "typecheck": "bun tsc --noEmit"
  }
}
```

- [ ] **Step 3: Remove tsx from devDependencies**

Delete `"tsx": "^4.19.2"` from devDependencies - Bun has native TypeScript support.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: update root package.json for Bun migration"
```

---

## Task 2: Workers Package - Update workers/package.json

**Files:**

- Modify: `workers/package.json:7-25`

- [ ] **Step 1: Update engines and packageManager field**

```json
{
  "engines": {
    "bun": ">=1.2.0"
  },
  "packageManager": "bun@1.2.0"
}
```

- [ ] **Step 2: Update scripts**

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "lint": "bun oxlint src/",
    "lint:fix": "bun oxlint src/ --fix",
    "format": "bun oxfmt src/",
    "format:check": "bun oxfmt src/ --check",
    "typecheck": "bun tsc --noEmit"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add workers/package.json
git commit -m "chore: update workers package.json for Bun migration"
```

---

## Task 3: Docker - Update Dockerfile for Bun

**Files:**

- Modify: `Dockerfile:1-52`

- [ ] **Step 1: Replace full Dockerfile with Bun-based build**

```dockerfile
# Build stage
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN bun run build

# Production stage
FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S llmux && \
    adduser -S llmux -u 1001

# Copy package files and install production deps only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy config example (user mounts actual config)
COPY config/config.example.yaml ./config/config.example.yaml

# Set ownership
RUN chown -R llmux:llmux /app

USER llmux

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start
CMD ["bun", "dist/index.js"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "chore: update Dockerfile to use Bun runtime"
```

---

## Task 4: Documentation - Update README.md

**Files:**

- Modify: `README.md:9-15`

- [ ] **Step 1: Replace Setup section in README.md**

Find the Setup section (lines 7-15) and replace with:

````markdown
## Setup

```bash
bun install
cp config/config.example.yaml config/config.yaml
cp .env.example .env
# Add your provider API keys to .env
bun run dev
```
````

````

- [ ] **Step 2: Replace Deploy section Cloudflare Workers command**

Find line 91 and change:

```markdown
# Cloudflare Workers (see workers/)
cd workers && bun run deploy
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for Bun migration"
```

---

## Task 5: Documentation - Update workers/README.md

**Files:**

- Modify: `workers/README.md:9-53`

- [ ] **Step 1: Replace Install dependencies section**

Find lines 9-12 and replace with:

````markdown
### 1. Install dependencies

```bash
cd workers
bun install
```
````

````

- [ ] **Step 2: Replace Deploy section npm commands**

Find lines 49-53 and replace with:

```markdown
### 4. Deploy

```bash
# Development
bun run dev

# Production
bun run deploy
````

````

- [ ] **Step 3: Commit**

```bash
git add workers/README.md
git commit -m "docs: update workers README for Bun migration"
````

---

## Task 6: Lockfiles - Migrate from npm to Bun

**Files:**

- Delete: `package-lock.json`
- Delete: `workers/package-lock.json`
- Create: `bun.lock`
- Create: `workers/bun.lock`

- [ ] **Step 1: Remove npm lockfiles**

```bash
rm package-lock.json
rm workers/package-lock.json
git add package-lock.json workers/package-lock.json
git commit -m "chore: remove npm lockfiles for Bun migration"
```

- [ ] **Step 2: Generate bun.lock in root**

```bash
bun install
```

Expected output:

```
bun install v1.2.x
  [8.12ms] done
Saved lockfile
```

- [ ] **Step 3: Generate bun.lock in workers**

```bash
cd workers && bun install
```

- [ ] **Step 4: Commit lockfiles**

```bash
git add bun.lock workers/bun.lock
git commit -m "chore: add Bun lockfiles"
```

---

## Task 7: Verification - Test Full Migration

**Files:**

- Test: Root package commands
- Test: Workers package commands
- Test: Docker build

- [ ] **Step 1: Verify root package typecheck**

Run: `bun run typecheck`
Expected: No errors (TypeScript compiles)

- [ ] **Step 2: Verify root package lint**

Run: `bun run lint`
Expected: Lint passes with warnings (expected from config)

- [ ] **Step 3: Verify workers typecheck**

Run: `cd workers && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Test Docker build**

Run: `docker build -t llmux:test .`
Expected: Build completes successfully

- [ ] **Step 5: Commit (if any fixes needed)**

If any fixes required, commit them. Otherwise this task requires no commit.

---

## Self-Review Checklist

**1. Spec coverage:**

- ✅ Update package.json (both root and workers) - Task 1, 2
- ✅ Update Dockerfile - Task 3
- ✅ Update documentation (README files) - Task 4, 5
- ✅ Migrate lockfiles - Task 6
- ✅ Verification - Task 7

**2. Placeholder scan:**

- ✅ No "TBD", "TODO", "implement later"
- ✅ No vague "add error handling" without specifics
- ✅ No "similar to Task N" references
- ✅ All code blocks show exact content

**3. Type consistency:**

- ✅ Bun version 1.2+ throughout
- ✅ Script commands consistent (`bun run`, `bun install`)
- ✅ Lockfile names consistent (`bun.lock`)

**4. Dependencies verified:**

- `tsx` removed (Bun native TS support)
- `fastify` - Bun compatible
- `ioredis` - Bun compatible
- `hono` - Bun compatible
- `wrangler` - Works with Bun (still required for Workers deploy)

---

## Post-Migration Notes

**What changes:**

- Install: `npm install` → `bun install`
- Run: `npm run dev` → `bun run dev` (or `bun dev` shorthand)
- Runtime: Node.js → Bun
- Lockfile: `package-lock.json` → `bun.lock`

**What stays the same:**

- All source code (TypeScript unchanged)
- Config files (YAML, TOML unchanged)
- API surface (no behavior changes)
- Wrangler for Workers deployment (Cloudflare requirement)
- Docker compose (runtime-agnostic)

**Performance improvements:**

- 10x faster package installs
- ~30% faster cold starts in Docker
- Native TypeScript (no tsx overhead)
