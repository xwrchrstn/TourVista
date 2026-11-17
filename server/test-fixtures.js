import { defaultProfile } from '../shared/listing-profile.js';

// Synthetic data for isolated tests. No real host, business, address or ownership claim.
export function completeProfile(patch = {}) {
  return { ...defaultProfile(), address: 'Synthetic Test Road, Barangay Fixture, Claveria', contactEmail: 'fixture-host@example.test',
    accessInstructions: 'Synthetic access instructions for isolated testing only.', checkInTime: '14:00', checkOutTime: '11:00',
    cancellationPolicy: 'Synthetic cancellation terms for this isolated test only.', locationConfirmed: true,
    photos: [{ kind: 'url', src: 'https://example.test/synthetic-campsite.jpg' }], ...patch };
}
