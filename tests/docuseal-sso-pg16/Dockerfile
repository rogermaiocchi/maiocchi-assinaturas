# syntax=docker/dockerfile:1

FROM ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6 AS docuseal-sso-pg16-test

ARG DOCUSEAL_BASE_SOURCE_SHA256
ARG DOCUSEAL_SSO_PATCH_SHA256
ARG DOCUSEAL_BUILD_INPUTS_PATCH_SHA256
ARG HARNESS_DOCKERFILE_SHA256

LABEL org.opencontainers.image.title="Maiocchi DocuSeal SSO PostgreSQL 16 test harness" \
      org.opencontainers.image.vendor="Maiocchi Advogado" \
      org.opencontainers.image.version="3.0.1-maiocchi.15-test-harness" \
      br.adv.maiocchi.harness="docuseal-sso-pg16" \
      br.adv.maiocchi.base-source-sha256="${DOCUSEAL_BASE_SOURCE_SHA256}" \
      br.adv.maiocchi.sso-patch-sha256="${DOCUSEAL_SSO_PATCH_SHA256}" \
      br.adv.maiocchi.build-inputs-patch-sha256="${DOCUSEAL_BUILD_INPUTS_PATCH_SHA256}" \
      br.adv.maiocchi.harness-dockerfile-sha256="${HARNESS_DOCKERFILE_SHA256}"

ENV RAILS_ENV=test \
    NODE_ENV=test \
    TZ=UTC \
    DEFAULT_LOCALE=en-US \
    BUNDLE_FROZEN=true \
    BUNDLE_JOBS=2 \
    BUNDLE_RETRY=3 \
    HOME=/home/docuseal-test \
    WORKDIR=/app

WORKDIR /app

RUN apk add --no-cache libpq vips redis onnxruntime tzdata && \
    apk add --no-cache --virtual .build-deps build-base git libpq-dev yaml-dev && \
    addgroup -g 2100 docuseal-test && \
    adduser -u 2100 -G docuseal-test -s /bin/sh -D -h /home/docuseal-test docuseal-test

COPY Gemfile Gemfile.lock ./

RUN bundle config set --local frozen true && \
    bundle install && \
    apk del --no-cache .build-deps && \
    rm -rf /usr/local/bundle/cache /root/.bundle

COPY . ./

RUN mkdir -p /app/log /app/storage /app/tmp/cache /app/tmp/pids && \
    chown -R docuseal-test:docuseal-test /app /home/docuseal-test

USER docuseal-test

ENTRYPOINT ["/app/bin/bundle", "exec"]
CMD ["rspec", "--format", "progress"]
