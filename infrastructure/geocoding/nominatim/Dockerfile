FROM ubuntu:24.04

ARG NOMINATIM_VERSION=5.3.2
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PATH=/opt/nominatim/bin:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl libicu-dev osm2pgsql postgresql-client postgis \
      python3 python3-pip python3-venv \
 && python3 -m venv /opt/nominatim \
 && /opt/nominatim/bin/pip install --no-cache-dir \
      "nominatim-db==${NOMINATIM_VERSION}" \
      "nominatim-api==${NOMINATIM_VERSION}" \
      "falcon>=4,<5" \
      "gunicorn==25.1.0" \
 && groupadd --gid 10001 nominatim \
 && useradd --uid 10001 --gid 10001 --home-dir /srv/nominatim-project --create-home nominatim \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

COPY --chown=nominatim:nominatim entrypoint.sh /usr/local/bin/geocoder-entrypoint
RUN chmod 0755 /usr/local/bin/geocoder-entrypoint
USER nominatim
WORKDIR /srv/nominatim-project
EXPOSE 8088
ENTRYPOINT ["geocoder-entrypoint"]
