import { weatherScore, dateValid, todayManila } from './features.js';
import { audit, nextId } from './storage.js';

export async function getWeather(store, camp, start, end) {
  const unavailable = (message) => ({ available: false, message, advisory: 'https://www.pagasa.dost.gov.ph/' });
  if (!dateValid(start) || !dateValid(end) || start > end || start < todayManila()) return unavailable('Choose valid forecast dates starting today or later.');
  const last = new Date(Date.parse(todayManila()) + 15 * 86400000).toISOString().slice(0, 10);
  if (end > last) return unavailable('These dates are outside the 16-day forecast horizon. Check closer to your trip.');
  const state = await store.read();
  const cached = state.forecasts.filter((row) => row.campId === camp.id && row.start === start && row.end === end && row.version === state.config.version && row.snapshot?.location?.latitude === camp.latitude && row.snapshot?.location?.longitude === camp.longitude)
    .sort((a, b) => b.id - a.id)[0];
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 3600000) return cached.snapshot;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({ latitude: camp.latitude, longitude: camp.longitude, timezone: 'Asia/Manila', wind_speed_unit: 'kmh',
      daily: 'precipitation_probability_max,temperature_2m_mean,wind_speed_10m_max,weather_code', hourly: 'weather_code',
      start_date: start, end_date: end }).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Forecast provider unavailable.');
    const data = await response.json();
    const days = [];
    if (data.timezone !== 'Asia/Manila' || data.daily_units?.temperature_2m_mean !== '°C' ||
      data.daily_units?.wind_speed_10m_max !== 'km/h' || data.daily_units?.precipitation_probability_max !== '%') throw new Error('Forecast units or timezone were not as expected.');
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10), i = data.daily?.time?.indexOf(date);
      if (i === undefined || i < 0) throw new Error('Forecast days are incomplete.');
      const values = { rain: data.daily.precipitation_probability_max[i], temperature: data.daily.temperature_2m_mean[i],
        wind: data.daily.wind_speed_10m_max[i], code: data.daily.weather_code[i],
        hourlyCodes: (data.hourly?.time || []).flatMap((hour, index) => hour.startsWith(date) ? [data.hourly.weather_code[index]] : []) };
      const score = weatherScore(values, state.config);
      if (!score) throw new Error('Required daily or hourly forecast values are incomplete.');
      days.push({ date, ...values, ...score });
    }
    const fetchedAt = new Date().toISOString();
    const result = { available: true, location: { latitude: camp.latitude, longitude: camp.longitude }, days, score: Math.min(...days.map((day) => day.score)), provider: 'Open-Meteo',
      fetchedAt, version: state.config.version, message: 'Proposed descriptive WSI. Forecasts may change; consult PAGASA advisories.', advisory: 'https://www.pagasa.dost.gov.ph/' };
    await store.mutate((draft) => {
      draft.forecasts.push({ id: nextId(draft, 'forecasts'), campId: camp.id, start, end, fetchedAt, version: state.config.version, snapshot: result });
    });
    return result;
  } catch (error) {
    return { ...unavailable(`Weather assessment unavailable: ${error.message}`), previous: cached ? { fetchedAt: cached.fetchedAt, stale: true } : null };
  }
}
