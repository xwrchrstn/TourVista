import { haversineKm } from '../../shared/geography.js';

export function routeProgress(coordinates, roadKm) {
  if (coordinates.length < 2 || !Number.isFinite(roadKm) || roadKm < 0) return null;
  const points = coordinates.map(([latitude, longitude]) => ({ latitude, longitude }));
  let total = 0;
  const segments = points.slice(1).map((end, index) => {
    const start = points[index];
    const length = haversineKm(start, end);
    const segment = { start, end, length, before: total };
    total += length;
    return segment;
  });
  return total > 0 ? { segments, total, roadKm } : null;
}

export function remainingRoadKm(point, accuracy, route) {
  if (!route || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;
  const longitudeScale = Math.cos(point.latitude * Math.PI / 180);
  let nearest = Infinity, traveled = 0;
  for (const { start, end, length, before } of route.segments) {
    const ax = (start.longitude - point.longitude) * longitudeScale, ay = start.latitude - point.latitude;
    const dx = (end.longitude - start.longitude) * longitudeScale, dy = end.latitude - start.latitude;
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const projected = { latitude: start.latitude + fraction * dy, longitude: start.longitude + fraction * (end.longitude - start.longitude) };
    const offset = haversineKm(point, projected);
    if (offset < nearest) {
      nearest = offset;
      traveled = before + fraction * length;
    }
  }
  return nearest <= Math.max(0.06, accuracy / 1000) ? route.roadKm * Math.max(0, 1 - traveled / route.total) : null;
}
