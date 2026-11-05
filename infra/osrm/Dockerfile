# MzaziCare's own road router: OSRM with Kenya's OpenStreetMap data, for driving.
#
# The public demonstration router allows one request a second and is not for a service
# people depend on. This image carries the map inside it, prepared when the image is
# built, so it starts in seconds and needs nothing from outside to answer.
#
#   docker build -t mzazicare-osrm infra/osrm        build (10 to 30 minutes, 8 GB of memory)
#   docker run -p 5050:5000 mzazicare-osrm          run
#
# Then point the API at it: ROUTING_PROVIDER=osrm, ROUTING_URL=http://localhost:5050,
# ROUTING_RATE_PER_SECOND=0. Rebuild every month or two for new roads.
#
# Another region: --build-arg REGION_URL=<a Geofabrik .osm.pbf link>.

FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

ARG REGION_URL=https://download.geofabrik.de/africa/kenya-latest.osm.pbf

WORKDIR /data
ADD ${REGION_URL} /data/region.osm.pbf

# Multi-level Dijkstra: quick to answer, and the profile can be re-weighted later
# without extracting again. The source data is dropped once prepared, to keep the image
# small.
RUN osrm-extract -p /opt/car.lua /data/region.osm.pbf \
 && osrm-partition /data/region.osrm \
 && osrm-customize /data/region.osrm \
 && rm /data/region.osm.pbf

EXPOSE 5000

# A host such as Render says which port to listen on in PORT. The table limit covers the
# most places the API measures at once (50 volunteers and the alert).
CMD ["sh", "-c", "exec osrm-routed --algorithm mld --max-table-size 100 --port ${PORT:-5000} /data/region.osrm"]
