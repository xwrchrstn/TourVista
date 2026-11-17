import { pointInPolygon } from './geography.js';

export const siteTypes = ['Tent campsite', 'Glamping', 'Cabin stay', 'Mixed accommodation'];
export const defaultInitialUnit = Object.freeze({ name: 'Main pitch', capacity: 4 });
export function defaultProfile() {
  return { address: '', locality: 'Claveria, Misamis Oriental', siteType: siteTypes[0], contactPhone: '', contactEmail: '',
    accessInstructions: '', checkInTime: '', checkOutTime: '', cancellationPolicy: '', locationConfirmed: false, photos: [] };
}
export function listingChecklist(camp) {
  const profile = { ...defaultProfile(), ...camp.profile };
  const boundaryIssue = listingBoundaryProblem(camp);
  return [
    { id: 'name', label: 'Campsite name', ready: (camp.name?.trim().length || 0) >= 3 },
    { id: 'location', label: 'Confirmed campsite entrance pin', ready: Number.isFinite(camp.latitude) && Math.abs(camp.latitude) <= 90 && Number.isFinite(camp.longitude) && Math.abs(camp.longitude) <= 180 && profile.locationConfirmed === true },
    ...(boundaryIssue ? [{ id: 'boundary', label: boundaryIssue, ready: false }] : []),
  ];
}
export function listingBoundaryProblem(camp) {
  const boundary = camp.polygon ?? [];
  return boundaryProblem(boundary) || (boundary.length && !pointInPolygon(camp, boundary)
    ? 'The campsite entrance pin must be inside its check-in boundary. Adjust the pin or boundary before submitting.' : '');
}
export function boundaryProblem(vertices) {
  if (!Array.isArray(vertices) || vertices.length > 100) return 'Use an empty boundary or 3–100 boundary points.';
  if (!vertices.length) return '';
  if (vertices.some((p) => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) return 'Every boundary point needs valid coordinates.';
  const same = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude;
  const points = vertices.length > 1 && same(vertices[0], vertices.at(-1)) ? vertices.slice(0, -1) : vertices;
  if (points.length < 3 || new Set(points.map((p) => `${p.latitude},${p.longitude}`)).size !== points.length) return 'A boundary needs at least 3 distinct points.';
  const cross = (a, b, c) => (b.longitude - a.longitude) * (c.latitude - a.latitude) - (b.latitude - a.latitude) * (c.longitude - a.longitude);
  const between = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-14 && p.longitude >= Math.min(a.longitude, b.longitude) && p.longitude <= Math.max(a.longitude, b.longitude) && p.latitude >= Math.min(a.latitude, b.latitude) && p.latitude <= Math.max(a.latitude, b.latitude);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || between(a, b, c) || between(a, b, d) || between(c, d, a) || between(c, d, b)) return 'Boundary edges must not cross or touch each other.';
  }
  const area = points.reduce((sum, p, i) => sum + (p.longitude - points[0].longitude) * (points[(i + 1) % points.length].latitude - points[0].latitude) - (points[(i + 1) % points.length].longitude - points[0].longitude) * (p.latitude - points[0].latitude), 0);
  return Math.abs(area) < 1e-12 ? 'Boundary points must enclose a usable area.' : '';
}
