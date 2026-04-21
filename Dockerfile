# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install only production deps first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# ── Stage 2: Final Image ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup --system --gid 1001 ctfgroup && \
    adduser  --system --uid 1001 --ingroup ctfgroup ctfuser

WORKDIR /app

# Copy dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=ctfuser:ctfgroup src/       ./src/
COPY --chown=ctfuser:ctfgroup public/    ./public/
COPY --chown=ctfuser:ctfgroup package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Render uses this port
EXPOSE 3000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Switch to non-root user
USER ctfuser

# Start application
CMD ["node", "src/app.js"]
