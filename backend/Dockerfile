FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc --project tsconfig.json
RUN ls dist/main.js

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
