import React, { useRef, useState } from 'react';
import { useApp, Field } from './context.jsx';
import Icon from './Icons.jsx';
import LocationEditor from './LocationEditor.jsx';
import { defaultProfile, defaultInitialUnit, siteTypes, listingChecklist, boundaryProblem } from '../../shared/listing-profile.js';

const sections = [
  { id: 'basics', name: 'Basics', icon: 'tent' },
  { id: 'location', name: 'Map pin', icon: 'pin' },
  { id: 'optional', name: 'Optional details', icon: 'info' },
];
async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 10485760) throw new Error('Choose JPEG or PNG photos up to 10 MB. The editor prepares a smaller copy for upload.');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = () => reject(new Error('This photo could not be read.')); item.src = source; });
    if (image.naturalWidth * image.naturalHeight > 60000000) throw new Error('Use a photo smaller than 60 megapixels.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/jpeg', .84);
    const maxDataUrlLength = 'data:image/jpeg;base64,'.length + Math.ceil(1048576 / 3) * 4;
    if (dataUrl.length > maxDataUrlLength) dataUrl = canvas.toDataURL('image/jpeg', .65);
    if (dataUrl.length > maxDataUrlLength) throw new Error('This photo is still too large. Choose a smaller image.');
    return { name: file.name.slice(0, 110), type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally { URL.revokeObjectURL(source); }
}
export default function CampsiteEditor({ initial, close, submitForReview }) {
  const { session, dashboard, api, reload, setNotice, navigate } = useApp();
  const [camp, setCamp] = useState(() => {
    const profile = { ...defaultProfile(), ...structuredClone(initial.profile || {}) };
    if (!profile.photos.length && initial.imageUrl) profile.photos = [{ kind: 'url', src: initial.imageUrl }];
    return { ...initial, profile };
  });
  const [section, setSection] = useState('basics'), [pending, setPending] = useState([]), [photoUrl, setPhotoUrl] = useState(''), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [progress, setProgress] = useState(''), [failure, setFailure] = useState(''), [saved, setSaved] = useState(Boolean(initial.id));
  const [initialUnit, setInitialUnit] = useState({ name: '', capacity: '' });
  const editor = useRef(null);
  const photoSequence = useRef(0);
  function change(patch) { setCamp((value) => ({ ...value, ...patch })); setSaved(false); }
  function profile(patch) { setCamp((value) => ({ ...value, profile: { ...value.profile, ...patch } })); setSaved(false); }
  function movePhoto(index) { const photos = [...camp.profile.photos], [photo] = photos.splice(index, 1); photos.unshift(photo); profile({ photos }); }
  function srcFor(ref) { return ref.kind === 'url' ? ref.src : `/api/campsites/${camp.id}/photos/${ref.id}`; }
  function showIssue(next, message) {
    setSection(next);
    setFailure(message);
    editor.current?.scrollIntoView({ block: 'start' });
  }
  async function filesSelected(event) {
    const files = Array.from(event.target.files || []); event.target.value = ''; setFailure('');
    if (camp.profile.photos.length + pending.length + files.length > 6) { setFailure('Choose up to 6 gallery photos in total.'); return; }
    setPreparing(true);
    try {
      const next = [];
      for (const file of files) next.push({ ...await preparePhoto(file), key: ++photoSequence.current });
      setPending((value) => [...value, ...next]); setSaved(false);
    }
    catch (error) { setFailure(error.message); } finally { setPreparing(false); }
  }
  function addPhotoUrl() {
    try { const url = new URL(photoUrl.trim()); if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 1000) throw new Error();
      if (camp.profile.photos.length + pending.length >= 6) { setFailure('A listing can have up to 6 photos.'); return; }
      if (camp.profile.photos.some((photo) => photo.kind === 'url' && photo.src === url.href)) { setFailure('That photo is already in this gallery.'); return; }
      profile({ photos: [...camp.profile.photos, { kind: 'url', src: url.href }] }); setPhotoUrl(''); setFailure('');
    } catch { setFailure('Enter a valid HTTPS image URL without credentials.'); }
  }
  async function save(prepareSubmission = false) {
    if (busy || preparing) return; setFailure('');
    if (camp.name.trim().length < 3) {
      showIssue('basics', 'Enter a campsite name of at least 3 characters.');
      return;
    }
    if (!Number.isFinite(camp.price) || camp.price < 0 || camp.price > 1000000) {
      showIssue('basics', 'Enter a nightly price between ₱0 and ₱1,000,000.');
      return;
    }
    if (!Number.isFinite(camp.latitude) || !Number.isFinite(camp.longitude) || Math.abs(camp.latitude) > 90 || Math.abs(camp.longitude) > 180) {
      showIssue('location', 'Choose valid campsite coordinates.');
      return;
    }
    const problem = boundaryProblem(camp.polygon || []);
    if (problem) { showIssue('location', problem); return; }
    if (prepareSubmission) {
      const missing = listingChecklist(camp).find((item) => !item.ready);
      if (missing) {
        showIssue('location', missing.id === 'location' ? 'Set and confirm your campsite entrance pin to continue.' : missing.label);
        return;
      }
    }
    setBusy(true); let latest = null;
    try {
      setProgress('Saving campsite details…');
      const unit = { name: initialUnit.name.trim() || undefined, capacity: initialUnit.capacity === '' ? undefined : Number(initialUnit.capacity) };
      latest = await api(camp.id ? `/campsites/${camp.id}` : '/campsites', { method: camp.id ? 'PATCH' : 'POST', body: { ...camp, imageUrl: '', ...(camp.id ? {} : { initialUnit: unit }) } });
      setCamp(latest);
      for (const [index, file] of pending.entries()) {
        setProgress(`Uploading photo ${index + 1} of ${pending.length}…`);
        const result = await api(`/campsites/${latest.id}/photos`, { method: 'POST', body: { revision: latest.revision, file: { name: file.name, type: file.type, data: file.data } } });
        latest = result.camp; setCamp(latest); setPending((value) => value.filter((item) => item.key !== file.key));
      }
      setSaved(true);
      await reload().catch(() => {});
      if (prepareSubmission) submitForReview(latest);
      else setNotice('Draft saved. You can return to finish it anytime.');
    } catch (error) { setFailure((latest ? 'Your draft details were saved. ' : '') + error.message); if (latest) await reload().catch(() => {}); }
    finally { setBusy(false); setProgress(''); }
  }
  return <section ref={editor} className="campsite-editor" aria-labelledby="listing-editor-title">
    <div className="editor-topline">
      <div>
        <h2 id="listing-editor-title">{initial.id ? 'Edit your listing' : 'Build your listing'}</h2>
        <p>Save a draft anytime. Set your entrance pin before sending the listing for review.</p>
      </div>
      <button type="button" onClick={close} disabled={busy}>Close editor</button>
    </div>
    {initial.approvalStatus === 'approved' && <p className="notice-box">Saving changes creates a new draft and pauses public visibility until the updated listing is approved. Existing bookings keep their original campsite location.</p>}
    <nav className="editor-sections" aria-label="Listing sections">
      {sections.map((item) => <button
        key={item.id} type="button" disabled={busy} aria-pressed={section === item.id}
        onClick={() => { setSection(item.id); setFailure(''); }}>
        <Icon name={item.icon} size={17} />{item.name}
      </button>)}
    </nav>
    <form className="editor-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {failure && <p className="error" role="alert">{failure}</p>}
      <fieldset disabled={busy} className="form-state">
        {section === 'basics' && <>
          <div className="two-fields">
            <Field label="Campsite name" required minLength="3" maxLength="120" value={camp.name}
              onChange={(event) => change({ name: event.target.value })} />
            <Field label="Price per space per night (₱)" type="number" min="0" max="1000000" step="0.01" required value={camp.price}
              onChange={(event) => change({ price: event.target.value === '' ? '' : Number(event.target.value) })} />
          </div>
          <Field label="Description (optional)">
            <textarea maxLength="4000" rows="3" placeholder="What can guests expect at your campsite?"
              value={camp.description} onChange={(event) => change({ description: event.target.value })} />
          </Field>
        </>}
        {section === 'location' && <LocationEditor
          point={{ latitude: camp.latitude, longitude: camp.longitude }} polygon={camp.polygon || []}
          confirmed={camp.profile.locationConfirmed}
          onPoint={(point) => {
            setCamp((value) => ({ ...value, ...point, profile: { ...value.profile, locationConfirmed: false } }));
            setSaved(false);
          }}
          onPolygon={(polygon) => change({ polygon })}
          onConfirmed={(locationConfirmed) => profile({ locationConfirmed })}
        />}
        {section === 'optional' && <div className="editor-optional">
          <details>
            <summary>Photos <Icon name="chevron" size={17} /></summary>
            <div className="editor-optional-content">
              <p className="editor-help">Add up to 6 campsite photos. The first photo is your cover.</p>
              <label className="photo-upload-zone">
                <Icon name="camera" size={32} />
                <strong>{preparing ? 'Preparing photos…' : 'Choose campsite photos'}</strong>
                <span>JPEG or PNG · up to 10 MB per original</span>
                <input type="file" multiple accept="image/jpeg,image/png" disabled={preparing} onChange={filesSelected} />
              </label>
              <div className="editor-photo-grid">
                {camp.profile.photos.map((ref, index) => <article key={ref.kind === 'upload' ? ref.id : ref.src}>
                  <img src={srcFor(ref)} alt={'Property photo ' + (index + 1)} />
                  {index === 0 && <span className="cover-photo-badge">Cover photo</span>}
                  <div>
                    <button type="button" disabled={index === 0} onClick={() => movePhoto(index)}>Make cover</button>
                    <button type="button" onClick={() => profile({ photos: camp.profile.photos.filter((_, i) => i !== index) })}>Remove</button>
                  </div>
                </article>)}
                {pending.map((file) => <article key={file.key}>
                  <img src={file.preview} alt="New campsite photo preview" />
                  <span className="cover-photo-badge">New · not saved</span>
                  <div><button type="button" onClick={() => setPending((value) => value.filter((item) => item.key !== file.key))}>Remove</button></div>
                </article>)}
              </div>
              <div className="photo-url-row">
                <Field label="Or add an HTTPS photo URL" type="url" placeholder="https://your-photo.jpg" value={photoUrl}
                  onChange={(event) => setPhotoUrl(event.target.value)} />
                <button type="button" onClick={addPhotoUrl}>Add photo link</button>
              </div>
              <p className="fine">Use photos you have permission to publish. Add ownership documents in the private proof form.</p>
            </div>
          </details>
          <details>
            <summary>Accommodation and amenities <Icon name="chevron" size={17} /></summary>
            <div className="editor-optional-content">
              <Field label="Accommodation type">
                <select value={camp.profile.siteType} onChange={(event) => profile({ siteType: event.target.value })}>
                  {siteTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </Field>
              {!camp.id ? <div className="editor-inset">
                <h4>First bookable space</h4>
                <p>Leave these blank to start with {defaultInitialUnit.name} for up to {defaultInitialUnit.capacity} guests. Edit or add spaces later under Availability.</p>
                <div className="two-fields">
                  <Field label="Space name" placeholder={defaultInitialUnit.name} minLength="2" maxLength="100" value={initialUnit.name}
                    onChange={(event) => setInitialUnit({ ...initialUnit, name: event.target.value })} />
                  <Field label="Guest limit" placeholder={defaultInitialUnit.capacity} type="number" min="1" max="100" value={initialUnit.capacity}
                    onChange={(event) => setInitialUnit({ ...initialUnit, capacity: event.target.value })} />
                </div>
              </div> : <div className="editor-inset">
                <strong>Bookable spaces</strong>
                <p>{dashboard.units.filter((unit) => unit.campId === camp.id).map((unit) => unit.name + ': ' + unit.capacity + ' guests').join(' · ') || 'No spaces yet'}</p>
                <button type="button" onClick={() => navigate('units')}>Manage units &amp; availability</button>
              </div>}
              <h4>Amenities</h4>
              <div className="editor-amenities">
                {session.amenities.map((item) => <label key={item}>
                  <span>{item}</span>
                  <input type="checkbox" checked={camp.amenities.includes(item)}
                    onChange={(event) => change({ amenities: event.target.checked ? [...camp.amenities, item] : camp.amenities.filter((value) => value !== item) })} />
                </label>)}
              </div>
            </div>
          </details>
          <details>
            <summary>Address, contact and guest information <Icon name="chevron" size={17} /></summary>
            <div className="editor-optional-content">
              <p className="editor-help">Guest details you add here become public after approval.</p>
              <Field label="Property address" maxLength="400" placeholder="Sitio / street, barangay, municipality, province" value={camp.profile.address}
                onChange={(event) => profile({ address: event.target.value })} />
              <Field label="Municipality / locality" maxLength="120" value={camp.profile.locality}
                onChange={(event) => profile({ locality: event.target.value })} />
              <div className="two-fields">
                <Field label="Business phone" type="tel" maxLength="30" value={camp.profile.contactPhone}
                  onChange={(event) => profile({ contactPhone: event.target.value })} />
                <Field label="Business email" type="email" maxLength="160" value={camp.profile.contactEmail}
                  onChange={(event) => profile({ contactEmail: event.target.value })} />
              </div>
              <div className="two-fields">
                <Field label="Check-in time" type="time" value={camp.profile.checkInTime}
                  onChange={(event) => profile({ checkInTime: event.target.value })} />
                <Field label="Check-out time" type="time" value={camp.profile.checkOutTime}
                  onChange={(event) => profile({ checkOutTime: event.target.value })} />
              </div>
              <Field label="Arrival and access instructions">
                <textarea maxLength="2000" rows="3" value={camp.profile.accessInstructions}
                  onChange={(event) => profile({ accessInstructions: event.target.value })} />
              </Field>
              <Field label="House rules">
                <textarea maxLength="2000" rows="3" value={camp.rules} onChange={(event) => change({ rules: event.target.value })} />
              </Field>
              <Field label="Cancellation and booking-change policy">
                <textarea maxLength="2000" rows="3" value={camp.profile.cancellationPolicy}
                  onChange={(event) => profile({ cancellationPolicy: event.target.value })} />
              </Field>
              <label className="checkbox-label">
                <input type="checkbox" checked={camp.active} onChange={(event) => change({ active: event.target.checked })} />
                Accept new requests when this listing is approved
              </label>
            </div>
          </details>
        </div>}
      </fieldset>
      <div className="editor-footer">
        <span aria-live="polite">{busy ? progress : saved && !pending.length ? 'Draft saved' : 'Unsaved changes'}</span>
        <div className="button-row">
          <button type="submit" disabled={busy || preparing}>Save draft</button>
          <button type="button" className="primary compact" disabled={busy || preparing} onClick={() => save(true)}>
            Continue to ownership proof <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    </form>
  </section>;
}
