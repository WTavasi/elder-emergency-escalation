/**
 * Distance between two coordinates.
 *
 * Haversine on a spherical earth, which is accurate to about 0.5 percent. The system
 * uses distance for two decisions, neither of which is sensitive to that error: whether
 * an alert was raised away from the registered home, and whether an alert falls inside
 * a responder's declared coverage radius. Taking on PostGIS for one formula would add a
 * database extension, a deployment dependency and a schema migration for no gain.
 */

const EARTH_RADIUS_METRES = 6_371_000;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function distanceInMetres(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a))));
}

export function isWithinMetres(from: Coordinates, to: Coordinates, metres: number): boolean {
  return distanceInMetres(from, to) <= metres;
}
