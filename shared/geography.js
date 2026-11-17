export function haversineKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Points exactly on the polygon boundary count as inside.
export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = point.longitude, y = point.latitude;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const cross = (x - a.longitude) * (b.latitude - a.latitude) - (y - a.latitude) * (b.longitude - a.longitude);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(a.longitude, b.longitude) && x <= Math.max(a.longitude, b.longitude) &&
      y >= Math.min(a.latitude, b.latitude) && y <= Math.max(a.latitude, b.latitude)) return true;
    if ((b.latitude > y) !== (a.latitude > y) && x < (a.longitude - b.longitude) * (y - b.latitude) /
      (a.latitude - b.latitude) + b.longitude) inside = !inside;
  }
  return inside;
}
