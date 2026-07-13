FROM node:24.18-alpine

WORKDIR /app
COPY services/pki-bridge/package.json services/pki-bridge/package-lock.json ./
RUN npm ci --omit=dev

COPY services/pki-bridge/src ./src
COPY services/pki-bridge/db ./db
COPY services/pki-bridge/assets ./assets

ENV NODE_ENV=production PORT=3400
EXPOSE 3400
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3400/healthz || exit 1

CMD ["node", "src/server.mjs"]
