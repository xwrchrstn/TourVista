import test from 'node:test';
import assert from 'node:assert/strict';
import { savedKey, loadSaved, saveSaved, applyQuickFilter, quickFilterActive, emptyFilters, photosForCamp } from './src/marketplace.js';

test('Saved places are scoped to each tourist account and unavailable to host or guest accounts', () => {
  assert.equal(savedKey({ id: 3, role: 'tourist' }), 'tourvista:saved:3');
  assert.notEqual(savedKey({ id: 3, role: 'tourist' }), savedKey({ id: 5, role: 'tourist' }));
  for (const user of [null, { id: 3, role: 'owner' }, { id: 1, role: 'admin' }, { id: -1, role: 'tourist' }, { id: '3', role: 'tourist' }]) assert.equal(savedKey(user), null);
});
test('Corrupt or disabled browser storage cannot break browsing or inject saved identifiers', () => {
  assert.deepEqual(loadSaved({ getItem: () => '[3,3,-1,0,"4",null,5,1.2]' }, 'key'), [3, 5]);
  assert.deepEqual(loadSaved({ getItem: () => '{"role":"admin"}' }, 'key'), []);
  assert.deepEqual(loadSaved({ getItem: () => '{invalid' }, 'key'), []);
  assert.deepEqual(loadSaved({ getItem() { throw new Error('Unavailable'); } }, 'key'), []);
  assert.equal(saveSaved({ setItem() { throw new Error('Quota'); } }, 'key', [1]), false);
});
test('Saved places persist as a bounded ID list and accounts cannot overwrite each other accidentally', () => {
  const entries = new Map(), storage = { getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const first = savedKey({ id: 3, role: 'tourist' }), second = savedKey({ id: 5, role: 'tourist' });
  assert.equal(saveSaved(storage, first, [1, 3, 3]), true); assert.equal(saveSaved(storage, second, [4]), true);
  assert.deepEqual(loadSaved(storage, first), [1, 3]); assert.deepEqual(loadSaved(storage, second), [4]);
  assert.equal(saveSaved(storage, null, [1]), false);
  saveSaved(storage, first, Array.from({ length: 150 }, (_, i) => i + 1)); assert.equal(loadSaved(storage, first).length, 100);
});
test('Marketplace shortcuts use the same real price, rating and amenity filters as ranking', () => {
  const source = { ...emptyFilters, search: 'Forest', minPrice: '700', amenities: ['Water'] };
  let filtered = applyQuickFilter(source, 'budget'); assert.equal(filtered.maxPrice, '500'); assert.equal(filtered.minPrice, ''); assert.equal(filtered.search, 'Forest');
  filtered = applyQuickFilter(filtered, 'Parking'); filtered = applyQuickFilter(filtered, 'rated');
  assert.deepEqual(filtered.amenities, ['Water', 'Parking']); assert.equal(filtered.minRating, '4'); assert.equal(quickFilterActive(filtered, 'rated'), true);
  assert.deepEqual(applyQuickFilter(filtered, 'Parking').amenities, ['Water']);
  assert.equal(applyQuickFilter(filtered, 'budget').maxPrice, '');
  assert.deepEqual(applyQuickFilter(filtered, 'all'), { ...emptyFilters, search: 'Forest', amenities: [] });
  assert.deepEqual(source, { ...emptyFilters, search: 'Forest', minPrice: '700', amenities: ['Water'] });
  assert.equal(applyQuickFilter(source, 'unrecognized'), source);
});
test('Stock galleries appear only on explicit demo listings, and owner photos take precedence', () => {
  assert.deepEqual(photosForCamp({ id: 1, demoListing: false, imageUrl: '' }), []);
  assert.deepEqual(photosForCamp({ id: 100, demoListing: true, imageUrl: '' }), []);
  assert.equal(photosForCamp({ id: 1, demoListing: true }).length, 3);
  assert.ok(photosForCamp({ id: 1, demoListing: true }).every((photo) => photo.sample && photo.src.startsWith('/images/')));
  assert.deepEqual(photosForCamp({ id: 1, demoListing: true, imageUrl: 'https://owner.example/photo.jpg' }), [{ src: 'https://owner.example/photo.jpg', sample: false }]);
});
