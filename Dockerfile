# Context-Simplo Docker image
# Multi-stage build for optimized production image

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Copy root package files
COPY package*.json ./

# Install root dependencies
RUN npm ci

# Copy source and build backend
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Build dashboard
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci

COPY dashboard ./dashboard
RUN cd dashboard && npm run build

# Production stage
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache curl

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY .contextignore.default ./

# Create data and workspace directories
RUN mkdir -p /data /workspace

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV WORKSPACE_ROOT=/workspace

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Volume mounts
VOLUME ["/workspace", "/data"]

# Run the application
CMD ["node", "dist/index.js"]
