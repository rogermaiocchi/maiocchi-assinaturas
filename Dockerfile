FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_DOCUMENTS_URL=https://assinatura.maiocchi.adv.br
ARG NEXT_PUBLIC_LAWYERS_URL=https://assinatura.maiocchi.adv.br/dashboard
ARG NEXT_PUBLIC_ICP_URL=https://assinatura.maiocchi.adv.br/sign_in
ARG NEXT_PUBLIC_WEB_PKI_LICENSE=
ARG NEXT_PUBLIC_PKI_BRIDGE_URL=
ENV NEXT_PUBLIC_DOCUMENTS_URL=$NEXT_PUBLIC_DOCUMENTS_URL
ENV NEXT_PUBLIC_LAWYERS_URL=$NEXT_PUBLIC_LAWYERS_URL
ENV NEXT_PUBLIC_ICP_URL=$NEXT_PUBLIC_ICP_URL
ENV NEXT_PUBLIC_WEB_PKI_LICENSE=$NEXT_PUBLIC_WEB_PKI_LICENSE
ENV NEXT_PUBLIC_PKI_BRIDGE_URL=$NEXT_PUBLIC_PKI_BRIDGE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.3-alpine3.23-slim@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="Maiocchi. Assinatura" \
      org.opencontainers.image.vendor="Maiocchi Advogado" \
      org.opencontainers.image.description="Portal estático de assinaturas do Maiocchi Advogado" \
      org.opencontainers.image.version="1.15.1" \
      org.opencontainers.image.source="https://github.com/rogermaiocchi/maiocchi-assinaturas" \
      org.opencontainers.image.url="https://assinatura.maiocchi.adv.br" \
      org.opencontainers.image.created="2026-07-18T00:00:00Z" \
      org.opencontainers.image.licenses="NOASSERTION" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
