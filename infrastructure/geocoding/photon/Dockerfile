FROM eclipse-temurin:21-jre-jammy

ARG PHOTON_VERSION=1.2.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl --fail --location --retry 3 \
      "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar" \
      --output /photon/photon.jar \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10002 --home-dir /photon photon \
 && chown -R photon:photon /photon

COPY --chown=photon:photon entrypoint.sh /usr/local/bin/photon-entrypoint
RUN chmod 0755 /usr/local/bin/photon-entrypoint
USER photon
WORKDIR /photon
EXPOSE 2322
ENTRYPOINT ["photon-entrypoint"]
