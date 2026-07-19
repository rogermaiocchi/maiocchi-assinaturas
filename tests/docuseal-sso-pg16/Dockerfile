FROM ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6 AS docuseal-sso-tiff-package

ARG TIFF_SOURCE_DATE_EPOCH=1782568942
ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apk add --no-cache \
      alpine-sdk \
      cmake \
      diffutils \
      libjpeg-turbo-dev \
      libwebp-dev \
      python3 \
      samurai \
      zlib-dev \
      zstd-dev && \
    addgroup -g 2101 package-builder && \
    adduser -u 2101 -G package-builder -s /bin/sh -D -h /home/package-builder package-builder && \
    addgroup package-builder abuild && \
    install -d -m 0755 -o package-builder -g package-builder /home/package-builder/tiff /repository/x86_64

WORKDIR /home/package-builder/tiff

COPY --chown=package-builder:package-builder ./build/tiff/APKBUILD ./APKBUILD
COPY --chown=package-builder:package-builder ./build/tiff/tiff-4.7.2.tar.gz ./tiff-4.7.2.tar.gz

RUN touch -d "@${TIFF_SOURCE_DATE_EPOCH}" APKBUILD tiff-4.7.2.tar.gz && \
    su package-builder -c 'abuild-keygen -a -n' && \
    generated_private_key=$(sed -n 's/^PACKAGER_PRIVKEY="\([^"]*\)"$/\1/p' /home/package-builder/.abuild/abuild.conf) && \
    case "$generated_private_key" in /home/package-builder/.abuild/*.rsa) ;; *) exit 1 ;; esac && \
    fixed_private_key=/home/package-builder/.abuild/maiocchi-tiff.rsa && \
    mv "$generated_private_key" "$fixed_private_key" && \
    mv "$generated_private_key.pub" "$fixed_private_key.pub" && \
    sed -i "s|$generated_private_key|$fixed_private_key|" /home/package-builder/.abuild/abuild.conf && \
    install -m 0644 "$fixed_private_key.pub" /etc/apk/keys/maiocchi-tiff.rsa.pub && \
    su package-builder -c "cd /home/package-builder/tiff && SOURCE_DATE_EPOCH=${TIFF_SOURCE_DATE_EPOCH} abuild validate && SOURCE_DATE_EPOCH=${TIFF_SOURCE_DATE_EPOCH} abuild -r" && \
    set -- /home/package-builder/packages/*/x86_64/tiff-4.7.2-r0.apk && \
    test "$#" -eq 1 && \
    install -m 0644 "$1" /repository/x86_64/tiff-4.7.2-r0.apk && \
    apk index --description 'Maiocchi libtiff 4.7.2 security repository' --output /repository/x86_64/APKINDEX.tar.gz /repository/x86_64/tiff-4.7.2-r0.apk && \
    abuild-sign -k "$fixed_private_key" /repository/x86_64/APKINDEX.tar.gz && \
    install -m 0644 "$fixed_private_key.pub" /repository/maiocchi-tiff.rsa.pub && \
    install -m 0644 APKBUILD /repository/APKBUILD && \
    printf '%s  %s\n' \
      'bad66954a7e7e158c6dcbfc0e2d0032b8f3e2a354b6d0fdbb8038a7963e36c5b8a433dd4ee81c6c4dabfb50094152d440aa1f32b5299098c9ae29e55de2e41fc' \
      'tiff-4.7.2.tar.gz' > /repository/UPSTREAM.SHA512 && \
    (cd /repository && sha256sum APKBUILD UPSTREAM.SHA512 maiocchi-tiff.rsa.pub x86_64/APKINDEX.tar.gz x86_64/tiff-4.7.2-r0.apk > SHA256SUMS) && \
    rm -f "$fixed_private_key" && \
    test ! -e "$fixed_private_key"

FROM ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6 AS docuseal-sso-pdfium

WORKDIR /pdfium-download

RUN apk add --no-cache wget && \
    wget -O pdfium-linux.tgz "https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/7947/pdfium-linux-musl-x64.tgz" && \
    printf '%s\n' '4fd8d95a629dfd5009f81ddb32b54b96e113d6fdc1c4801aae5e2fb37911c91b  pdfium-linux.tgz' | sha256sum -c - && \
    mkdir -p /pdfium-linux && \
    tar -xzf pdfium-linux.tgz -C /pdfium-linux

FROM ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6 AS docuseal-sso-pg16-test

ARG DOCUSEAL_BASE_SOURCE_SHA256
ARG DOCUSEAL_SSO_PATCH_SHA256
ARG DOCUSEAL_BUILD_INPUTS_PATCH_SHA256
ARG DOCUSEAL_NATIVE_SECURITY_PATCH_SHA256
ARG TIFF_APKBUILD_SHA256
ARG TIFF_SOURCE_SHA256
ARG TIFF_VERSION
ARG OPENEXR_VERSION
ARG HARNESS_DOCKERFILE_SHA256

LABEL org.opencontainers.image.title="Maiocchi DocuSeal SSO PostgreSQL 16 test harness" \
      org.opencontainers.image.vendor="Maiocchi Advogado" \
      org.opencontainers.image.version="3.0.1-maiocchi.15-test-harness" \
      br.adv.maiocchi.harness="docuseal-sso-pg16" \
      br.adv.maiocchi.base-source-sha256="${DOCUSEAL_BASE_SOURCE_SHA256}" \
      br.adv.maiocchi.sso-patch-sha256="${DOCUSEAL_SSO_PATCH_SHA256}" \
      br.adv.maiocchi.build-inputs-patch-sha256="${DOCUSEAL_BUILD_INPUTS_PATCH_SHA256}" \
      br.adv.maiocchi.native-security-patch-sha256="${DOCUSEAL_NATIVE_SECURITY_PATCH_SHA256}" \
      br.adv.maiocchi.tiff-apkbuild-sha256="${TIFF_APKBUILD_SHA256}" \
      br.adv.maiocchi.tiff-source-sha256="${TIFF_SOURCE_SHA256}" \
      br.adv.maiocchi.tiff-version="${TIFF_VERSION}" \
      br.adv.maiocchi.openexr-version="${OPENEXR_VERSION}" \
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

COPY --from=docuseal-sso-pdfium /pdfium-linux/lib/libpdfium.so /usr/lib/libpdfium.so
COPY --from=docuseal-sso-pdfium /pdfium-linux/licenses/pdfium.txt /usr/lib/libpdfium-LICENSE.txt

COPY --from=docuseal-sso-tiff-package /repository /usr/share/maiocchi/tiff-repository

RUN install -m 0644 /usr/share/maiocchi/tiff-repository/maiocchi-tiff.rsa.pub /etc/apk/keys/maiocchi-tiff.rsa.pub && \
    (cd /usr/share/maiocchi/tiff-repository && sha256sum -c SHA256SUMS) && \
    apk add --no-cache \
      --repository /usr/share/maiocchi/tiff-repository \
      libpq \
      vips \
      redis \
      onnxruntime \
      tzdata \
      'tiff=4.7.2-r0' \
      'openexr-libiex=3.4.13-r0' \
      'openexr-libilmthread=3.4.13-r0' \
      'openexr-libopenexr=3.4.13-r0' \
      'openexr-libopenexrcore=3.4.13-r0' && \
    apk info -e 'tiff=4.7.2-r0' && \
    apk info -e 'openexr-libiex=3.4.13-r0' && \
    apk info -e 'openexr-libilmthread=3.4.13-r0' && \
    apk info -e 'openexr-libopenexr=3.4.13-r0' && \
    apk info -e 'openexr-libopenexrcore=3.4.13-r0' && \
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
