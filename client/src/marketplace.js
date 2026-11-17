export const emptyFilters = { search: '', minPrice: '', maxPrice: '', minRating: '0', amenities: [] };
export const quickFilters = [
  { id: 'all', name: 'All campsites', icon: 'tent' },
  { id: 'budget', name: '₱500 or less', icon: 'coin' },
  { id: 'rated', name: '4 stars & up', icon: 'star' },
  { id: 'Fire pit', name: 'Campfire', icon: 'fire' },
  { id: 'Parking', name: 'Parking', icon: 'car' },
  { id: 'Wi-Fi', name: 'Wi-Fi', icon: 'wifi' },
];
export function quickFilterActive(filters, id) {
  if (id === 'all') return !filters.minPrice && !filters.maxPrice && !Number(filters.minRating) && !filters.amenities.length;
  if (id === 'budget') return filters.maxPrice !== '' && Number(filters.maxPrice) === 500;
  if (id === 'rated') return Number(filters.minRating) >= 4;
  return filters.amenities.includes(id);
}
export function applyQuickFilter(filters, id) {
  if (!quickFilters.some((item) => item.id === id)) return filters;
  if (id === 'all') return { ...emptyFilters, search: filters.search, amenities: [] };
  if (id === 'budget') return { ...filters, maxPrice: quickFilterActive(filters, id) ? '' : '500', minPrice: Number(filters.minPrice) > 500 ? '' : filters.minPrice };
  if (id === 'rated') return { ...filters, minRating: quickFilterActive(filters, id) ? '0' : '4' };
  return { ...filters, amenities: filters.amenities.includes(id) ? filters.amenities.filter((item) => item !== id) : [...filters.amenities, id] };
}
export function savedKey(user) { return user?.role === 'tourist' && Number.isSafeInteger(user.id) && user.id > 0 ? `tourvista:saved:${user.id}` : null; }
function validIds(value) { return Array.isArray(value) ? [...new Set(value.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100) : []; }
export function loadSaved(storage, key) {
  if (!key) return [];
  try { return validIds(JSON.parse(storage.getItem(key) || '[]')); } catch { return []; }
}
export function saveSaved(storage, key, ids) {
  if (!key) return false;
  try { storage.setItem(key, JSON.stringify(validIds(ids))); return true; } catch { return false; }
}
export const demoPhotos = {
  1: '/images/camp-forest.jpg', 2: '/images/camp-ridge.jpg', 3: '/images/camp-sunrise.jpg', 4: '/images/camp-valley.jpg',
};
export function photosForCamp(camp) {
  if (Array.isArray(camp.photos) && camp.photos.length) return camp.photos.map((photo) => ({ ...photo, sample: false }));
  if (camp.imageUrl) return [{ src: camp.imageUrl, sample: false }];
  if (!camp.demoListing || !demoPhotos[camp.id]) return [];
  const first = demoPhotos[camp.id];
  return [first, ...Object.values(demoPhotos).filter((src) => src !== first).slice(0, 2)].map((src) => ({ src, sample: true }));
}
