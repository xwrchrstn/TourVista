import { createHash } from 'node:crypto';
import { defaultProfile, siteTypes, listingChecklist, listingBoundaryProblem } from '../shared/listing-profile.js';

function ensure(value, message, status = 400) { if (!value) { const error = new Error(message); error.status = status; throw error; } }
const bounded = (value, max, label) => { ensure(typeof value === 'string' && value.trim().length <= max, `${label} must be text of at most ${max} characters.`); return value.trim(); };
export function validateProfile(input, state, campId) {
  ensure(input === undefined || (input && typeof input === 'object' && !Array.isArray(input)), 'Invalid campsite details.');
  const source = { ...defaultProfile(), ...input }, result = defaultProfile();
  for (const [key, max, label] of [['address', 400, 'Address'], ['locality', 120, 'Locality'], ['contactPhone', 30, 'Business phone'], ['contactEmail', 160, 'Business email'], ['accessInstructions', 2000, 'Access instructions'], ['cancellationPolicy', 2000, 'Cancellation policy']]) result[key] = bounded(source[key], max, label);
  ensure(siteTypes.includes(source.siteType), 'Choose a campsite accommodation type.'); result.siteType = source.siteType;
  ensure(!result.contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contactEmail), 'Enter a valid business email.');
  ensure(!result.contactPhone || (/^[+()\d\s-]{7,30}$/.test(result.contactPhone) && result.contactPhone.replace(/\D/g, '').length >= 7 && result.contactPhone.replace(/\D/g, '').length <= 15), 'Enter a valid business phone number.');
  for (const key of ['checkInTime', 'checkOutTime']) { ensure(typeof source[key] === 'string' && (!source[key] || /^([01]\d|2[0-3]):[0-5]\d$/.test(source[key])), 'Choose valid check-in and check-out times.'); result[key] = source[key]; }
  ensure(typeof source.locationConfirmed === 'boolean', 'Location confirmation must be true or false.'); result.locationConfirmed = source.locationConfirmed;
  ensure(Array.isArray(source.photos) && source.photos.length <= 6, 'A listing can have up to 6 photos.');
  const seen = new Set();
  result.photos = source.photos.map((photo) => {
    ensure(photo && typeof photo === 'object', 'Invalid listing photo.'); let ref;
    if (photo.kind === 'upload') {
      ensure(Number.isSafeInteger(photo.id) && photo.id > 0 && state.campsitePhotos.some((row) => row.id === photo.id && row.campId === campId), 'Select photos uploaded to this campsite only.', 403);
      ref = { kind: 'upload', id: photo.id };
    } else {
      ensure(photo.kind === 'url', 'Invalid photo source.'); const src = bounded(photo.src, 1000, 'Photo URL'); let url;
      try { url = new URL(src); } catch { ensure(false, 'Photo links must be valid HTTPS URLs.'); }
      ensure(url.protocol === 'https:' && !url.username && !url.password, 'Photo links must use HTTPS without credentials.'); ref = { kind: 'url', src: url.href };
    }
    const key = ref.kind === 'upload' ? `id:${ref.id}` : ref.src; ensure(!seen.has(key), 'Each gallery photo must be unique.'); seen.add(key); return ref;
  });
  return result;
}
export function photoViews(state, camp) {
  const refs = camp.profile?.photos?.length ? camp.profile.photos : camp.imageUrl ? [{ kind: 'url', src: camp.imageUrl }] : [];
  return refs.flatMap((ref) => {
    if (ref.kind === 'url') return [{ src: ref.src, sample: false }];
    const photo = state?.campsitePhotos?.find((item) => item.id === ref.id && item.campId === camp.id);
    return photo ? [{ id: photo.id, src: `/api/campsites/${camp.id}/photos/${photo.id}`, sample: false, width: photo.file.width, height: photo.file.height }] : [];
  });
}
export function requireCompleteListing(camp) {
  const boundaryIssue = listingBoundaryProblem(camp);
  ensure(!boundaryIssue, boundaryIssue, 409);
  const missing = listingChecklist(camp).filter((item) => !item.ready).map((item) => item.label);
  ensure(!missing.length, 'Complete this listing before submitting: ' + missing.join('; ') + '.', 409);
}
export function validatePhoto(input) {
  ensure(input && ['image/jpeg', 'image/png'].includes(input.type), 'Use JPEG or PNG campsite photos.');
  ensure(typeof input.data === 'string' && input.data.length <= 1398104 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data), 'Photo limit: 1 MB each.');
  const bytes = Buffer.from(input.data, 'base64'); ensure(bytes.length >= 24 && bytes.length <= 1048576 && bytes.toString('base64') === input.data, 'Invalid or oversized photo.');
  let width = 0, height = 0;
  if (input.type === 'image/png') {
    ensure(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.length >= 45 && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND', 'The PNG photo is incomplete or invalid.');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else {
    ensure(bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217, 'The JPEG photo is incomplete or invalid.');
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      ensure(bytes[offset] === 255, 'Invalid JPEG marker.'); while (bytes[offset] === 255) offset += 1;
      const marker = bytes[offset++]; if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break; const length = bytes.readUInt16BE(offset);
      ensure(length >= 2 && offset + length <= bytes.length, 'Invalid JPEG segment.');
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) { ensure(length >= 8, 'Invalid JPEG dimensions.'); height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  }
  ensure(width > 0 && height > 0 && width <= 6000 && height <= 6000 && width * height <= 24000000, 'Photo dimensions must be valid and at most 6000 pixels per side / 24 megapixels.');
  const ext = input.type === 'image/png' ? '.png' : '.jpg', stem = bounded(input.name || 'campsite', 120, 'Photo name').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\.[^.]*$/, '').slice(0, 110) || 'campsite';
  return { name: stem + ext, type: input.type, data: input.data, size: bytes.length, width, height, sha256: createHash('sha256').update(bytes).digest('hex') };
}
