FROM node:18-bullseye-slim AS client_builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:18-bullseye-slim AS server_builder
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=client_builder /app/client/dist ./client/dist

FROM node:18-bullseye-slim AS runtime
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app
RUN useradd -m appuser
COPY --from=server_builder /app /app
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 5000
CMD ["node", "server/server.js"]
