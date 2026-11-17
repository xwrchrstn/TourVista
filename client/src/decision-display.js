// Presentation helpers only. Algorithm scores and eligibility come from the API.
export const criteria = [
  { key: 'price', label: 'Budget', detail: 'Lower nightly price', icon: 'coin' },
  { key: 'distance', label: 'Distance', detail: 'Closer to your starting point', icon: 'pin' },
  { key: 'amenities', label: 'Facilities', detail: 'More checklist amenities', icon: 'tent' }
];
export const weatherFactors = [
  { label: 'Rain chance', icon: 'rain', code: 'R' }, { label: 'Temperature', icon: 'thermometer', code: 'K' },
  { label: 'Sky condition', icon: 'cloud', code: 'Q' }, { label: 'Wind', icon: 'wind', code: 'W' }, { label: 'Storm risk', icon: 'storm', code: 'S' }
];
export function preferenceShares(weights = {}) {
  const values = criteria.map(({ key }) => Number.isFinite(weights[key]) && weights[key] >= 0 ? weights[key] : 0);
  const sum = values.reduce((total, value) => total + value, 0);
  return Object.fromEntries(criteria.map(({ key }, index) => [key, sum ? values[index] / sum : 0]));
}
export function weatherMeaning(score, thunderstorm = false) {
  if (!Number.isFinite(score) || score < 0 || score > 100) return { tone: 'neutral', label: 'Not assessed', title: 'Check the forecast first', advice: 'Weather information has not been assessed for this stay.' };
  if (thunderstorm) return { tone: 'caution', label: 'Thunderstorm indicated', title: 'Pay attention to storm risk', advice: 'Check PAGASA advisories and speak with the host before travelling. A storm flag deserves attention regardless of the index.' };
  if (score >= 80) return { tone: 'positive', label: 'Higher suitability', title: 'More favourable conditions', advice: 'The assessed weather factors are more favourable. Check the daily forecast and current advisories before leaving.' };
  if (score >= 60) return { tone: 'moderate', label: 'Moderate suitability', title: 'Plan with a little extra care', advice: 'Some forecast factors may affect outdoor plans. Review each day and ask the host about local conditions.' };
  if (score >= 40) return { tone: 'caution', label: 'Lower suitability', title: 'Review your outdoor plans', advice: 'The forecast may be less suitable for camping. Check the factors below and discuss your plans with the host.' };
  return { tone: 'caution', label: 'Very low suitability', title: 'Consider another plan or date', advice: 'The assessed conditions are less favourable. Consult official advisories and the host before deciding to travel.' };
}
export function weatherCondition(code) {
  const labels = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall', 77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail' };
  return Number.isInteger(code) && Object.hasOwn(labels, code) ? labels[code] : 'Condition unavailable';
}
export function weatherIcon(code, thunderstorm = false) {
  if (thunderstorm || [95, 96, 99].includes(code)) return 'storm';
  if (code === 0) return 'sun';
  if (code === 1 || code === 2) return 'partlyCloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  return code === 3 ? 'cloud' : 'info';
}
export function displayDate(value, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Date unavailable';
  const date = new Date(value + 'T12:00:00+08:00');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', ...options });
}
export function matchScore(score) { return Number.isFinite(score) && score >= 0 && score <= 1 ? score.toFixed(3) : '—'; }
export function checkinWindow(booking, today) { return booking.status === 'confirmed' && booking.start <= today && today < booking.end; }
export function bookingStatusLabel(value) { return ({ pending: 'Awaiting host', confirmed: 'Confirmed', checked_in: 'Checked in', completed: 'Completed', cancelled: 'Cancelled', rejected: 'Declined', active: 'Active', inactive: 'Paused' })[value] || String(value).replaceAll('_', ' '); }
export function drivingTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} hr${remaining ? ` ${remaining} min` : ''}` : `${minutes} min`;
}

