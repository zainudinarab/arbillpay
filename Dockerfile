# ==============================================================================
# Single-Stage Dockerfile untuk Arbill Billing SaaS (Ultra-Fast Pre-built Runner)
# Frontend di-build di lokal/CI ke 'dist/', server VPS running instan tanpa beban kompilasi!
# ==============================================================================
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006
ENV TZ=Asia/Jakarta

# Install dumb-init dan tzdata untuk timezone & signal handler yang aman
RUN apk add --no-cache dumb-init tzdata

# Install runtime production dependencies + tsx runner (ter-cache efisien di Docker)
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Salin pre-built frontend distribution
COPY dist ./dist

# Salin public assets
COPY public ./public

# Salin source code backend Express & TypeScript files
COPY server.ts ./
COPY tsconfig.json ./
COPY server ./server

# Port aplikasi
EXPOSE 3006

# Jalankan dengan dumb-init agar penanganan proses SIGTERM/SIGINT berjalan mulus
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tsx", "server.ts"]
