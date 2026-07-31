FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc --project tsconfig.json
RUN ls dist/main.js
# tsc only emits compiled .js — non-.ts assets like the bundled customer-codes
# CSV need to be copied into dist by hand or they're missing at runtime.
RUN mkdir -p dist/database/seeds/data && cp -r src/database/seeds/data/. dist/database/seeds/data/

FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads/cad
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/v1/health 2>/dev/null || exit 1
CMD ["node", "dist/main"]
