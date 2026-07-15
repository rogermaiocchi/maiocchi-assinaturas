FROM node:24.18-alpine
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="Maiocchi. Assinatura PKI Bridge" \
      org.opencontainers.image.vendor="Maiocchi Advogado" \
      org.opencontainers.image.version="1.3.19" \
      org.opencontainers.image.source="https://github.com/rogermaiocchi/maiocchi-assinaturas/tree/portal-v1.14.3" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

WORKDIR /app
COPY services/pki-bridge/package.json services/pki-bridge/package-lock.json ./
RUN npm ci --omit=dev && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY services/pki-bridge/src ./src
COPY services/pki-bridge/db ./db
COPY services/pki-bridge/assets ./assets

ENV NODE_ENV=production PORT=3400
EXPOSE 3400
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3400/healthz || exit 1

CMD ["node", "src/server.mjs"]
