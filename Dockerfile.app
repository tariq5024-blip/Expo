FROM node:18-alpine AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:18-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
EXPOSE 5000
CMD ["node", "server.js"]
