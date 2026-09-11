# ==============================================================================
# Multi-Stage Dockerfile untuk Arbill Billing SaaS (Frontend + Backend API)
# ==============================================================================

# STAGE 1: Build Frontend (Vite + React)
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependensi untuk proses build
COPY package*.json ./
RUN npm ci

# Salin source code
COPY . .

# Build assets frontend ke direktori dist/
RUN npm run build

# ==============================================================================
# STAGE 2: Production Runner
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006
ENV TZ=Asia/Jakarta

# Install dumb-init dan tzdata untuk timezone & signal handler yang aman
RUN apk add --no-cache dumb-init tzdata

# Install hanya runtime production dependencies + tsx runner
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Salin hasil build frontend dari stage 1
COPY --from=builder /app/dist ./dist

# Salin source code backend Express & TypeScript files
COPY server.ts ./
COPY tsconfig.json ./
COPY server ./server

# Port aplikasi
EXPOSE 3006

# Jalankan dengan dumb-init agar penanganan proses SIGTERM/SIGINT berjalan mulus
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tsx", "server.ts"]
