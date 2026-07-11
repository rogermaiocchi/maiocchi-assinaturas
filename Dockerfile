FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_DOCUMENTS_URL=https://documentos.assinatura.maiocchi.adv.br
ARG NEXT_PUBLIC_LAWYERS_URL=https://documentos.assinatura.maiocchi.adv.br/sign_in
ARG NEXT_PUBLIC_ICP_URL=https://certificado.assinatura.maiocchi.adv.br/certificate_auth/login/present
ARG NEXT_PUBLIC_WEB_PKI_LICENSE=
ARG NEXT_PUBLIC_PKI_BRIDGE_URL=
ENV NEXT_PUBLIC_DOCUMENTS_URL=$NEXT_PUBLIC_DOCUMENTS_URL
ENV NEXT_PUBLIC_LAWYERS_URL=$NEXT_PUBLIC_LAWYERS_URL
ENV NEXT_PUBLIC_ICP_URL=$NEXT_PUBLIC_ICP_URL
ENV NEXT_PUBLIC_WEB_PKI_LICENSE=$NEXT_PUBLIC_WEB_PKI_LICENSE
ENV NEXT_PUBLIC_PKI_BRIDGE_URL=$NEXT_PUBLIC_PKI_BRIDGE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
