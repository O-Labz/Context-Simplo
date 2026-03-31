# Context-Simplo Docker image
# Multi-stage build for optimized production image

FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      pnpm install; \
    fi

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Production stage
FROM node:22-alpine

# Install git (needed for some operations)
RUN apk add --no-cache git

WORKDIR /app

# Enable corepack
RUN corepack enable

# Copy built files and dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.contextignore.default ./

# Create data and workspace directories
RUN mkdir -p /data /workspace

# Set environment variables
ENV NODE_ENV=production
ENV CONTEXT_SIMPLO_DATA_DIR=/data

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "process.exit(0)" || exit 1

# Volume mounts
VOLUME ["/workspace", "/data"]

# Run the application
ENTRYPOINT ["node", "dist/index.js"]
