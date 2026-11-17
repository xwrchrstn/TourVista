import { pointInPolygon } from '../shared/geography.js';

export { pointInPolygon };

export const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function dateValid(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateTrip(start, end, partySize, future = true) {
  if (!dateValid(start) || !dateValid(end) || start >= end) throw new Error('Choose valid check-in and check-out dates, with check-out after check-in.');
  if (future && start < todayManila()) throw new Error('Check-in cannot be in the past.');
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) throw new Error('Party size must be a whole number from 1 to 100.');
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 30) throw new Error('A stay can be at most 30 nights in this prototype.');
}
export const overlaps = (a, b) => a.start < b.end && a.end > b.start;
export const blocking = (reservation) => ['confirmed', 'checked_in'].includes(reservation.status);
export function availableUnits(state, campId, start, end, partySize) {
  return state.units.filter((unit) => unit.campId === campId && unit.active && unit.capacity >= partySize &&
    !state.closures.some((closure) => closure.active && closure.unitId === unit.id && overlaps(closure, { start, end })) &&
    !state.reservations.some((booking) => booking.unitId === unit.id && blocking(booking) && overlaps(booking, { start, end })));
}
export function greedySchedule(requests, confirmed = [], closures = []) {
  const compatible = requests.filter((request) => ![...confirmed, ...closures].some((booked) => overlaps(request, booked)))
    .sort((a, b) => a.end.localeCompare(b.end) || a.start.localeCompare(b.start) || a.id - b.id);
  const selected = [];
  let finish = '';
  for (const request of compatible) if (request.start >= finish) { selected.push(request.id); finish = request.end; }
  return selected;
}

export function geofence(point, accuracy, polygon) {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000 || !Array.isArray(polygon) || polygon.length < 3) return 'uncertain';
  if (!pointInPolygon(point, polygon)) return 'outside';
  const latScale = 111195, lonScale = latScale * Math.cos(point.latitude * Math.PI / 180);
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ax = (a.longitude - point.longitude) * lonScale, ay = (a.latitude - point.latitude) * latScale;
    const bx = (b.longitude - point.longitude) * lonScale, by = (b.latitude - point.latitude) * latScale;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return accuracy < nearest ? 'inside' : 'uncertain';
}

export const defaultWeatherConfig = { version: '1.0-proposed', weights: [0.2, 0.2, 0.2, 0.2, 0.2],
  minTemperature: 20, maxTemperature: 28, windReference: 40, thunderstormCap: 39 };
export function weatherScore({ rain, temperature, wind, code, hourlyCodes }, config = defaultWeatherConfig) {
  const mappings = [[100, [0]], [80, [1, 2, 3]], [60, [45, 48]],
    [40, [51, 53, 55, 56, 57, 61, 63, 66, 67, 80, 81]], [20, [65, 82, 95, 96, 99]], [0, [71, 73, 75, 77, 85, 86]]];
  const condition = mappings.find(([, codes]) => codes.includes(code));
  if (!Number.isFinite(rain) || rain < 0 || rain > 100 || !Number.isFinite(temperature) || !Number.isFinite(wind) || wind < 0 ||
    !condition || !Array.isArray(hourlyCodes) || hourlyCodes.length !== 24 ||
    hourlyCodes.some((hour) => !mappings.some(([, codes]) => codes.includes(hour)))) return null;
  const storm = hourlyCodes.some((hour) => [95, 96, 99].includes(hour));
  const clip = (value) => Math.max(0, Math.min(100, value));
  const factors = [100 - rain, clip(100 - 10 * Math.max(config.minTemperature - temperature, 0, temperature - config.maxTemperature)),
    condition[0], clip(100 * (1 - wind / config.windReference)), storm ? 0 : 100];
  const raw = factors.reduce((sum, factor, i) => sum + factor * config.weights[i], 0);
  const score = storm ? Math.min(raw, config.thunderstormCap) : raw;
  return { score, raw, factors, thunderstorm: storm, label: score >= 80 ? 'Higher suitability' : score >= 60 ? 'Moderate suitability' :
    score >= 40 ? 'Lower suitability' : 'Very low suitability' };
}

export function dijkstra(nodes, edges, startId, endId) {
  return prepareDijkstra(nodes, edges)(startId, endId);
}

export function prepareDijkstra(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!Number.isFinite(edge.km) || edge.km < 0 || !byId.has(edge.from) || !byId.has(edge.to))
      throw new Error('Graph edges require valid endpoints and nonnegative finite lengths.');
    adjacency.get(edge.from).push(edge);
  }
  return (startId, endId) => shortestPath(byId, adjacency, startId, endId);
}

function shortestPath(byId, adjacency, startId, endId) {
  if (!byId.has(startId) || !byId.has(endId)) return null;
  // Binary min-heap and adjacency lists keep large road snapshots practical.
  const heap = [], push = (entry) => {
    heap.push(entry); let i = heap.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].km <= entry.km) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = entry;
  }, pop = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) { let i = 0;
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].km < heap[child].km) child++;
        if (last.km <= heap[child].km) break; heap[i] = heap[child]; i = child; }
      heap[i] = last;
    }
    return first;
  };
  const distances = new Map([[startId, 0]]), previous = new Map(); push({ id: startId, km: 0 });
  while (heap.length) {
    const current = pop();
    if (current.km !== distances.get(current.id)) continue;
    if (current.id === endId) break;
    for (const edge of adjacency.get(current.id)) {
      const next = current.km + edge.km;
      if (next < (distances.get(edge.to) ?? Infinity)) { distances.set(edge.to, next); previous.set(edge.to, edge); push({ id: edge.to, km: next }); }
    }
  }
  if (!Number.isFinite(distances.get(endId))) return null;
  const path = [endId], chosen = [];
  while (path.at(-1) !== startId) { const edge = previous.get(path.at(-1)); chosen.push(edge); path.push(edge.from); }
  return { km: distances.get(endId), path: path.reverse().map((id) => byId.get(id)), edges: chosen.reverse() };
}
