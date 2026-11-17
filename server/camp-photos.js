import { audit, nextId } from './storage.js';
import { validatePhoto } from './camp-profile.js';
import { isPublished } from './listing-review.js';

export function installCampPhotos(app, store, { actor, record, manageCamp, requireThat }) {
  app.post('/api/campsites/:id/photos', async (req, res) => {
    actor(req.state, req, ['owner']);
    const file = validatePhoto(req.body.file);
    const result = await store.mutate((state) => {
      const user = actor(state, req, ['owner']), camp = manageCamp(state, user, req.params.id);
      requireThat(camp.approvalStatus !== 'pending', 'Withdraw the pending submission before changing its photos.', 409);
      requireThat(req.body.revision === camp.revision, 'The listing changed. Refresh before adding photos.', 409);
      requireThat(camp.profile.photos.length < 6, 'A listing can have up to 6 photos.', 409);
      requireThat(state.campsitePhotos.filter((row) => row.campId === camp.id).length < 40, 'This campsite has reached its retained-photo limit. Contact the administrator before uploading more.', 409);
      const photo = { id: nextId(state, 'campsitePhotos'), campId: camp.id, ownerId: user.id, file, createdAt: new Date().toISOString() };
      state.campsitePhotos.push(photo); camp.profile.photos.push({ kind: 'upload', id: photo.id }); camp.approvalStatus = 'draft'; camp.demoListing = false; camp.revision += 1;
      audit(state, user.id, 'Uploaded campsite gallery photo', camp.id); return { camp, photo: { id: photo.id, src: `/api/campsites/${camp.id}/photos/${photo.id}` } };
    }); res.status(201).json(result);
  });
  app.get('/api/campsites/:campId/photos/:id', (req, res) => {
    const camp = record(req.state, 'campsites', req.params.campId), photo = record(req.state, 'campsitePhotos', req.params.id);
    requireThat(photo.campId === camp.id, 'Photo not found.', 404);
    const user = req.state.users.find((row) => row.id === req.session.userId && row.active);
    const attached = camp.profile.photos.some((ref) => ref.kind === 'upload' && ref.id === photo.id);
    const guestHasSnapshot = user?.role === 'tourist' && req.state.reservations.some((booking) => booking.userId === user.id && booking.campSnapshot?.id === camp.id && booking.campSnapshot?.photos?.some((item) => item.id === photo.id));
    requireThat((attached && isPublished(req.state, camp)) || user?.role === 'admin' || (user?.role === 'owner' && camp.ownerId === user.id) || guestHasSnapshot, 'Photo not found.', 404);
    res.set({ 'Content-Type': photo.file.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(Buffer.from(photo.file.data, 'base64'));
  });
}
