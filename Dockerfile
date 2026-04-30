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
