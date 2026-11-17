import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryProblem, defaultProfile, listingChecklist } from '../shared/listing-profile.js';

test('Boundary drawing accepts a real perimeter and rejects crossings, duplicates, collinearity and invalid coordinates', () => {
  const square = [{ latitude: 8.6, longitude: 124.8 }, { latitude: 8.6, longitude: 124.81 }, { latitude: 8.61, longitude: 124.81 }, { latitude: 8.61, longitude: 124.8 }];
  assert.equal(boundaryProblem([]), ''); assert.equal(boundaryProblem(square), ''); assert.equal(boundaryProblem([...square, square[0]]), '');
  for (const points of [[square[0], square[2], square[1], square[3]], [square[0], square[1]], [square[0], square[1], square[0]], [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }], [{ latitude: 91, longitude: 0 }, ...square]]) assert.ok(boundaryProblem(points));
});
test('Listing review requires only a name and explicitly confirmed entrance pin when the optional boundary is blank', () => {
  const camp = { name: 'Synthetic camp', description: '', latitude: 8.61, longitude: 124.89, amenities: [], imageUrl: '',
    profile: defaultProfile() };
  assert.deepEqual(listingChecklist(camp).map((item) => item.id), ['name', 'location']);
  assert.deepEqual(listingChecklist(camp).filter((item) => !item.ready).map((item) => item.id), ['location']);
  camp.profile.locationConfirmed = true;
  assert.ok(listingChecklist(camp).every((item) => item.ready));
  camp.polygon = [{ latitude: 8.6, longitude: 124.8 }, { latitude: 8.6, longitude: 124.81 }, { latitude: 8.62, longitude: 124.81 }, { latitude: 8.62, longitude: 124.8 }];
  const boundary = listingChecklist(camp).find((item) => item.id === 'boundary');
  assert.equal(boundary.ready, false);
  assert.match(boundary.label, /entrance pin must be inside/);
  camp.longitude = 124.805;
  assert.equal(listingChecklist(camp).length, 2);
  assert.ok(listingChecklist(camp).every((item) => item.ready));
  assert.equal(defaultProfile().checkInTime, '');
});
