import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultWeatherConfig, weatherScore } from './features.js';

function weatherSensitivity() {
  const baseline = defaultWeatherConfig;
  const weights = ['Rain', 'Temperature', 'Condition', 'Wind', 'Storm'];
  const variants = [
    ['Equal weights', baseline],
    ...weights.map((label, index) => [`${label} emphasis`, { ...baseline, weights: weights.map((_, i) => i === index ? 0.4 : 0.15) }]),
    ['Comfort range 18–28 °C', { ...baseline, minTemperature: 18 }],
    ['Comfort range 20–30 °C', { ...baseline, maxTemperature: 30 }],
    ['Wind reference 35 km/h', { ...baseline, windReference: 35 }],
    ['Wind reference 45 km/h', { ...baseline, windReference: 45 }]
  ];
  const examples = [
    { label: 'Paper TC04', rain: 20, temperature: 24, wind: 8, code: 2, hourlyCodes: Array(24).fill(2), expected: 88 },
    { label: 'Paper TC05', rain: 20, temperature: 24, wind: 8, code: 95, hourlyCodes: Array(24).fill(95), expected: 39 },
    { label: 'Cool and windy example', rain: 25, temperature: 18, wind: 12, code: 2, hourlyCodes: Array(24).fill(2) },
    { label: 'Warm example', rain: 15, temperature: 30, wind: 8, code: 2, hourlyCodes: Array(24).fill(2) }
  ];
  console.log('WSI sensitivity on synthetic cases using the paper’s proposed baseline.');
  for (const example of examples) {
    const reference = weatherScore(example, baseline);
    if (example.expected !== undefined) assert.equal(reference.score, example.expected);
    console.log(example.label);
    console.table(variants.map(([variant, config]) => {
      const result = weatherScore(example, config);
      return { variant, score: result.score.toFixed(2), change: (result.score - reference.score).toFixed(2),
        suitability: result.label, categoryChanged: result.label !== reference.label };
    }));
  }
}

async function catalogRehearsal() {
  const { createStore } = await import('./storage.js');
  const { createApp } = await import('./app.js');
  const testDirectory = fileURLToPath(new URL('./storage/tests/', import.meta.url));
  await mkdir(testDirectory, { recursive: true });
  const folder = await mkdtemp(join(testDirectory, 'pilot-catalog-'));
  const file = join(folder, 'catalog.json');
  let store;
  let server;
  try {
    store = await createStore({ demo: true, path: file });
    await store.mutate((state) => {
      const camp = state.campsites[0], unit = state.units.find((item) => item.campId === camp.id);
      for (let id = 5; id <= 100; id++) {
        state.campsites.push({ ...camp, id, name: `Synthetic pilot campsite ${id}` });
        state.units.push({ ...unit, id: 100 + id, campId: id });
      }
    });
    const app = await createApp(store);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const sessions = await Promise.all(Array.from({ length: 20 }, async () => {
      const response = await fetch(base + '/session');
      assert.equal(response.status, 200);
      await response.json();
      return response.headers.getSetCookie()[0].split(';')[0];
    }));
    assert.equal(new Set(sessions).size, 20);
    const durations = [];
    for (let round = 0; round < 5; round++) {
      await Promise.all(sessions.map(async (cookie) => {
        const started = performance.now();
        const response = await fetch(base + '/campsites', { headers: { cookie } });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.campsites.length, 100);
        durations.push(performance.now() - started);
      }));
    }
    durations.sort((a, b) => a - b);
    const percentile = (p) => Number(durations[Math.ceil(durations.length * p) - 1].toFixed(1));
    const p95 = percentile(0.95);
    console.log(JSON.stringify({ scenario: 'synthetic catalog rehearsal over local HTTP', storage: store.mode,
      runtime: process.version, platform: process.platform, listings: 100, concurrentSessions: 20,
      requests: durations.length, medianMs: percentile(0.5), p95Ms: p95, targetMs: 2000, withinTarget: p95 <= 2000 }, null, 2));
    if (p95 > 2000) process.exitCode = 1;
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await store?.close();
    for (const path of [file, file + '.tmp']) {
      await unlink(path).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(folder);
  }
}

if (process.argv[2] === 'weather') weatherSensitivity();
else if (process.argv[2] === 'catalog') await catalogRehearsal();
else throw new Error('Choose the weather or catalog rehearsal.');
