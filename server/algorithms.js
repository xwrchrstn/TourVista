import { haversineKm } from '../shared/geography.js';

export { haversineKm };

export const amenityChecklist = ['Toilet', 'Water', 'Parking', 'Power', 'Wi-Fi', 'Fire pit'];
const EPSILON = 1e-10;

export function validatePreferences(origin, weights) {
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value);
  if (!origin || !numeric(origin.latitude) || !numeric(origin.longitude) ||
      Math.abs(origin.latitude) > 90 || Math.abs(origin.longitude) > 180) {
    throw new Error('Enter a valid origin latitude (-90 to 90) and longitude (-180 to 180).');
  }
  if (!weights || !['price', 'distance', 'amenities'].every((key) =>
    numeric(weights[key]) && weights[key] >= 0 && weights[key] <= 100) ||
    weights.price + weights.distance + weights.amenities === 0) {
    throw new Error('Each importance value must be from 0 to 100, with at least one above zero.');
  }
}

export function rankCampsites(campsites, origin, importance) {
  validatePreferences(origin, importance);
  const excluded = [];
  const candidates = campsites.filter((camp) => {
    const complete = [camp.price, camp.latitude, camp.longitude].every(Number.isFinite) &&
      camp.price >= 0 && Math.abs(camp.latitude) <= 90 && Math.abs(camp.longitude) <= 180 &&
      Array.isArray(camp.amenities) && camp.amenities.every((item) => amenityChecklist.includes(item));
    if (!complete) excluded.push({ id: camp.id, name: camp.name, reason: 'Missing or invalid ranking data.' });
    return complete;
  }).map((camp) => ({ ...camp, distanceKm: haversineKm(origin, camp),
    amenities: [...new Set(camp.amenities)] }));

  if (candidates.length === 0) return { results: [], excluded, weights: {}, notes: ['No complete candidates to rank.'] };
  const keys = ['price', 'distance', 'amenities'];
  const matrix = candidates.map((camp) => [camp.price, camp.distanceKm, camp.amenities.length]);
  const denominators = keys.map((_, j) => Math.hypot(...matrix.map((row) => row[j])));
  const notes = [];
  const active = keys.map((key, j) => ({ key, j })).filter(({ key, j }) => {
    if (importance[key] === 0) return false;
    const values = matrix.map((row) => row[j]);
    if (denominators[j] <= EPSILON || Math.max(...values) - Math.min(...values) <= EPSILON) {
      notes.push(`${key}: omitted because it does not distinguish the candidates.`);
      return false;
    }
    return true;
  });
  const totalWeight = active.reduce((sum, { key }) => sum + importance[key], 0);
  const weights = Object.fromEntries(active.map(({ key }) => [key, importance[key] / totalWeight]));
  if (candidates.length === 1) notes.push('Only one candidate; no comparison is possible.');
  else if (active.length === 0) notes.push('All candidates are equivalent under these preferences.');

  // Vector normalization, weighting, ideal solutions, and separation distances.
  const weighted = matrix.map((row) => active.map(({ key, j }) => row[j] / denominators[j] * weights[key]));
  const ideal = active.map(({ key }, k) => (key === 'amenities' ? Math.max : Math.min)(...weighted.map((row) => row[k])));
  const worst = active.map(({ key }, k) => (key === 'amenities' ? Math.min : Math.max)(...weighted.map((row) => row[k])));
  const results = candidates.map((camp, i) => {
    const dBest = Math.hypot(...weighted[i].map((value, k) => value - ideal[k]));
    const dWorst = Math.hypot(...weighted[i].map((value, k) => value - worst[k]));
    const topsisScore = dBest + dWorst <= EPSILON ? 0.5 : dWorst / (dBest + dWorst);
    return { ...camp, topsisScore };
  }).sort((a, b) => b.topsisScore - a.topsisScore || a.id - b.id);
  for (let i = 0; i < results.length; i += 1) {
    results[i].rank = i > 0 && Math.abs(results[i].topsisScore - results[i - 1].topsisScore) <= EPSILON
      ? results[i - 1].rank : i + 1;
  }
  return { results, excluded, weights, notes };
}
