import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useApp, Field, money } from './context.jsx';
import { CampVisual } from './CampComponents.jsx';
import { Status } from './Dashboards.jsx';
import CampsiteMap from './Map.jsx';
import CampsiteFacts from './CampsiteFacts.jsx';
import { CampGallery } from './MarketplaceUI.jsx';
import Icon from './Icons.jsx';
import { defaultProfile, listingChecklist } from '../../shared/listing-profile.js';
const CampsiteEditor = lazy(() => import('./CampsiteEditor.jsx'));

const documentTypes = ['Land title or tax declaration', 'Lease with owner authorization', 'Business permit with ownership support'];
const reviewFilters = { pending: 'Awaiting review', approved: 'Approved', rejected: 'Declined', withdrawn: 'Withdrawn', all: 'All submissions' };
const stateLabel = { draft: 'Draft', pending: 'Awaiting review', approved: 'Approved', rejected: 'Declined · update & resubmit', suspended: 'Suspended' };
export function ListingStatus({ camp }) { return <span className={'status status-' + camp.approvalStatus}>{stateLabel[camp.approvalStatus] || 'Review required'}{camp.approvalStatus === 'approved' && !camp.active ? ' · paused' : ''}</span>; }
function EvidenceFiles({ submission }) {
  return <ul className="evidence-files">{submission.documents.map((file, index) => <li key={index}><a href={`/api/ownership-submissions/${submission.id}/documents/${index}`} download>{file.name} ↓</a><span>{Math.ceil(file.size / 1024)} KB · private document</span></li>)}</ul>;
}
async function encodeFiles(files) {
  if (!files.length || files.length > 2) throw new Error('Choose 1–2 documents, up to 1 MB each.');
  return Promise.all(files.map(async (file) => {
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    const typeFromName = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const type = !file.type || file.type === 'application/octet-stream' ? typeFromName[extension] : file.type;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(type) || file.size > 1024 * 1024) throw new Error('Use PDF, JPEG, or PNG files up to 1 MB each.');
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('The document could not be read.')); reader.readAsDataURL(file); });
    return { name: file.name, type, data };
  }));
}
function ProofForm({ camp, close }) {
  const { session, api, reload, navigate, setNotice } = useApp();
  const [legalName, setLegalName] = useState(session.user.name), [documentType, setDocumentType] = useState(documentTypes[0]), [statement, setStatement] = useState('');
  const [files, setFiles] = useState([]), [declaration, setDeclaration] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [submitted, setSubmitted] = useState(false);
  const panel = useRef(null);
  const needsVerification = session.user.emailVerificationRequired && !session.user.emailVerified;
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: 'start' });
  }, []);
  async function refreshSubmission() {
    try { await reload(); close(); }
    catch { setError('Your listing was sent. Refresh the workspace to see the updated status.'); }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || submitted || needsVerification) return;
    setBusy(true); setError('');
    try {
      const documents = await encodeFiles(files);
      await api(`/campsites/${camp.id}/submit`, { method: 'POST', body: { revision: camp.revision, legalName, documentType, statement, documents, declaration } });
      setSubmitted(true);
      setNotice('Listing sent. It is now awaiting administrator review.');
      await refreshSubmission();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <section ref={panel} tabIndex={-1} className="panel proof-panel"><div className="results-heading"><div><p className="eyebrow">Private ownership review</p><h2>Submit {camp.name}</h2></div><button onClick={close} disabled={busy}>Close</button></div>
    <p>Provide evidence connecting the legal owner or authorized operator to the campsite you marked on the map. The administrator checks your listing and supporting documents before it appears in search.</p>
    {needsVerification ? <div className="notice-box"><p>{session.mailMode === 'unavailable' ? 'Your draft is saved. TourVista’s email sender must be connected so you can verify your email before submitting.' : 'Your draft is saved. Verify your email in Account settings, then return to submit your listing.'}</p><button onClick={() => navigate('account')}>Open Account settings</button></div>
      : submitted ? <button type="button" disabled={busy} onClick={refreshSubmission}>Refresh listing status</button>
      : <form onSubmit={submit}><fieldset disabled={busy} className="form-state"><div className="two-fields"><Field label="Legal owner / authorized operator name" required minLength="2" maxLength="160" value={legalName} onChange={(e) => setLegalName(e.target.value)} /><Field label="Supporting document type"><select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>{documentTypes.map((type) => <option key={type}>{type}</option>)}</select></Field></div>
      <Field label="Explain your ownership or authorization"><textarea required minLength="20" maxLength="2000" placeholder="Explain who owns the property, its address, and how the attached documents establish your right to operate it." value={statement} onChange={(e) => setStatement(e.target.value)} /></Field>
      <Field label="Supporting evidence: 1–2 files, 1 MB each"><input type="file" required multiple accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></Field>
      <p className="fine">PDF, JPEG, or PNG. Include the property address and relevant authorization. Redact unrelated financial details and identification numbers. Evidence is stored privately; it is visible to you and TourVista administrators.</p>
      <label className="checkbox-label"><input type="checkbox" required checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />I am the owner or authorized operator, and these documents accurately support my right to offer this campsite.</label>
      <button className="primary compact" disabled={!declaration || busy}>{busy ? 'Submitting evidence…' : 'Send listing for review'}</button>
    </fieldset></form>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
export function OwnerListings() {
  const { dashboard, session, action, navigate } = useApp();
  const [editing, setEditing] = useState(null), [editorKey, setEditorKey] = useState(0), [proofCamp, setProofCamp] = useState(null);
  if (!dashboard) return <p>Loading your campsites…</p>;
  const camps = dashboard.campsites, submissions = dashboard.ownershipSubmissions || [];
  function openEditor(camp) { setProofCamp(null); setEditorKey((value) => value + 1); setEditing(camp); }
  const add = () => openEditor({ name: '', description: '', price: 450, latitude: 8.61, longitude: 124.89, amenities: [], rules: '', imageUrl: '', polygon: [], active: true, profile: defaultProfile() });
  return <><section className="owner-workspace-hero"><div><p className="eyebrow">TourVista hosting studio</p><h1>Your place.<br /><em>Their next great escape.</em></h1><p>Start with your campsite name, set the entrance pin, then send your listing for ownership review.</p><button className="primary compact" onClick={add}><Icon name="tent" size={18} /> Add a campsite</button></div><div className="owner-hero-stats"><span><Icon name="tree" size={40} /></span><p>YOUR HOSTING OVERVIEW</p><div><strong>{camps.filter((camp) => camp.approvalStatus === 'approved').length}</strong><span>Approved listings</span></div><div><strong>{camps.filter((camp) => camp.approvalStatus === 'pending').length}</strong><span>Awaiting review</span></div><div><strong>{camps.filter((camp) => ['draft', 'rejected', 'suspended'].includes(camp.approvalStatus)).length}</strong><span>To complete or update</span></div></div></section>
    <ol className="host-steps capstone-host-steps"><li><span>1</span>Build your listing</li><li><span>2</span>Set the entrance pin</li><li><span>3</span>Submit ownership proof</li><li><span>4</span>Admin review & guest requests</li></ol>
    {editing && <Suspense fallback={<div className="panel">Loading your campsite editor…</div>}><CampsiteEditor key={editorKey} initial={editing} close={() => setEditing(null)} submitForReview={(camp) => { setEditing(null); setProofCamp(camp); }} /></Suspense>}
    {proofCamp && <ProofForm key={proofCamp.id} camp={proofCamp} close={() => setProofCamp(null)} />}
    <div className="owner-listings-heading"><div><p className="eyebrow">Your collection</p><h2>My campsites</h2><p>Only approved, active listings appear in the tourist catalog.</p></div><span>{camps.length} {camps.length === 1 ? 'listing' : 'listings'}</span></div>
    <div className="host-listings capstone-host-listings">{camps.map((camp) => {
      const submission = submissions.find((item) => item.id === camp.reviewId), checks = listingChecklist(camp), complete = checks.filter((item) => item.ready).length, ready = complete === checks.length;
      return <article className="panel host-listing" key={camp.id}><div className="host-listing-image"><CampVisual camp={camp} /><ListingStatus camp={camp} /></div><div><p className="eyebrow">{camp.profile?.siteType || 'Campsite'} · revision {camp.revision}</p><h3>{camp.name}</h3><p className="owner-site-address"><Icon name="pin" size={15} />{camp.profile?.address || (camp.profile?.locationConfirmed ? camp.profile.locality || 'Entrance pin set' : 'Set the entrance pin')}</p><div className="owner-site-metrics"><span><strong>{money(camp.price)}</strong> / unit / night</span><span>{dashboard.units.filter((unit) => unit.campId === camp.id && unit.active).length} active units</span></div>
        {camp.demoListing ? <p className="fine">Fictional demo listing; no real ownership claim. Supply your own property details and photos when editing.</p> : <div className="listing-completeness"><span>{complete}/{checks.length} required details ready</span><div><i style={{ width: `${complete / checks.length * 100}%` }} /></div></div>}
        {camp.moderationNote && <p className="notice-box">Administrator note: {camp.moderationNote}</p>}{submission?.reason && <p className="notice-box"><strong>Review feedback:</strong> {submission.reason}</p>}
        <div className="button-row">{camp.approvalStatus === 'pending' ? <button onClick={() => action(`/campsites/${camp.id}/withdraw`, { method: 'POST', body: { revision: camp.revision } }, 'Submission withdrawn. You can edit the draft now.')}>Withdraw to edit</button> : <button onClick={() => openEditor({ ...camp })}>Edit details & location</button>}<button onClick={() => navigate('details', camp.id)}>Preview listing</button>{ready && ['draft', 'rejected', 'suspended'].includes(camp.approvalStatus) && <button className="primary compact" onClick={() => setProofCamp(camp)}>Submit for admin review</button>}</div>
        {!ready && ['draft', 'rejected'].includes(camp.approvalStatus) && <p className="fine">Open the editor to see the required details for review.</p>}
        {submission && <details className="submission-history"><summary>Private evidence & decision history</summary><p>{submission.legalName} · {submission.documentType}</p><p>{submission.statement}</p><EvidenceFiles submission={submission} /><p className="fine">Submitted {new Date(submission.submittedAt).toLocaleString('en-PH')} · {submission.status}</p></details>}
      </div></article>;
    })}</div>{!camps.length && <section className="panel empty owner-first-listing"><Icon name="tent" size={40} /><h2>Every great stay starts with a place.</h2><p>Add your first campsite and mark its entrance before submitting it for ownership review.</p><button className="primary compact" onClick={add}>Create my first listing</button></section>}</>;
}

export function ListingReviews() {
  const { dashboard, api, reload, setNotice, session } = useApp();
  const [filter, setFilter] = useState('pending'), [selectedId, setSelectedId] = useState(null), [reason, setReason] = useState(''), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  const detail = useRef(null);
  useEffect(() => {
    if (!selectedId) return;
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);
  if (!dashboard) return <p>Loading listing reviews…</p>;
  const submissions = [...(dashboard.ownershipSubmissions || [])].reverse(), selected = submissions.find((item) => item.id === selectedId), camp = dashboard.campsites.find((item) => item.id === selected?.campId);
  async function refreshQueue() {
    setRefreshing(true); setError('');
    try { await reload(); }
    catch (failure) { setError(failure.message); }
    finally { setRefreshing(false); }
  }
  async function decide(decision) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/admin/listing-reviews/${selected.id}`, { method: 'PATCH', body: { revision: selected.revision, decision, reason, evidenceReviewed: checked } });
      setNotice(decision === 'approve' ? 'Listing approved. Active listings appear in tourist search.' : 'Listing declined. The owner can read your feedback and resubmit.');
      select(null);
      await refreshQueue();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function select(id) { setSelectedId(id); setReason(''); setChecked(false); setError(''); }
  return <><div className="page-heading admin-review-hero"><p className="eyebrow">TourVista administration</p><h1>Listing approvals.</h1><p>Review the property, its owner or authorized operator, and supporting evidence before publishing.</p></div>
    <div className="stats"><div className="stat"><span>Awaiting review</span><strong>{submissions.filter((item) => item.status === 'pending').length}</strong></div><div className="stat"><span>Approved listings</span><strong>{dashboard.campsites.filter((item) => item.approvalStatus === 'approved' && !item.demoListing).length}</strong></div><div className="stat"><span>Changes needed</span><strong>{submissions.filter((item) => item.status === 'rejected').length}</strong></div><div className="stat"><span>Suspended listings</span><strong>{dashboard.campsites.filter((item) => item.approvalStatus === 'suspended').length}</strong></div></div>
    <div className="review-layout"><section className="panel"><Field label="Submission status"><select value={filter} onChange={(e) => { setFilter(e.target.value); select(null); }}>{Object.entries(reviewFilters).map(([state, label]) => <option key={state} value={state}>{label}</option>)}</select></Field>
      <button type="button" className="review-refresh" disabled={refreshing || busy} onClick={refreshQueue}>{refreshing ? 'Refreshing…' : 'Refresh review queue'}</button>
      {!selected && error && <p className="error" role="alert">{error}</p>}
      {submissions.filter((item) => filter === 'all' || item.status === filter).map((item) => <button className={'review-queue-item' + (item.id === selectedId ? ' selected' : '')} key={item.id} disabled={busy} onClick={() => select(item.id)}><strong>{item.listingSnapshot.name}</strong><span>{dashboard.users.find((user) => user.id === item.ownerId)?.name} · revision {item.revision}</span><Status value={item.status} /></button>)}{!submissions.some((item) => filter === 'all' || item.status === filter) && <p>{filter === 'pending' ? 'No listings awaiting review.' : 'No submissions for this filter.'}</p>}</section>
      <section ref={detail} tabIndex={-1} className="panel review-detail">{selected ? <><div className="results-heading"><h2>{selected.listingSnapshot.name}</h2><Status value={selected.status} /></div><p className="fine">Submission #{selected.id} · revision {selected.revision} · {new Date(selected.submittedAt).toLocaleString('en-PH')}</p><CampGallery camp={selected.listingSnapshot} /><p>{selected.listingSnapshot.description}</p><p><strong>{money(selected.listingSnapshot.price)}</strong> / unit / night · {selected.listingSnapshot.amenities.join(' · ')}</p><p>Rules: {selected.listingSnapshot.rules || 'None supplied'}</p><CampsiteFacts camp={selected.listingSnapshot} /><CampsiteMap campsites={[selected.listingSnapshot]} showBoundary />
        <div className="private-evidence"><p className="eyebrow">Private · owner and administrators only</p><h3>Ownership evidence</h3><dl className="reservation-facts"><dt>Legal name</dt><dd>{selected.legalName}</dd><dt>Document type</dt><dd>{selected.documentType}</dd><dt>Account</dt><dd>{dashboard.users.find((user) => user.id === selected.ownerId)?.email}</dd></dl><p>{selected.statement}</p><EvidenceFiles submission={selected} /><p className="fine">Download and inspect every document. Match the name, property address, and authority to operate. Seek clarification or external verification where needed; uploading a document alone does not establish legitimacy.</p></div>
        {selected.status === 'pending' && camp?.approvalStatus === 'pending' && camp?.reviewId === selected.id ? <form onSubmit={(e) => { e.preventDefault(); decide('approve'); }}><fieldset disabled={busy} className="form-state"><Field label="Review decision reason / feedback to owner"><textarea required minLength="5" maxLength="1000" value={reason} onChange={(e) => setReason(e.target.value)} /></Field><label className="checkbox-label"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I reviewed the evidence, matched it to this property and operator, and completed the ownership or authorization checks.</label><div className="button-row"><button className="primary compact" disabled={!checked || reason.trim().length < 5 || busy}>Approve listing</button><button type="button" disabled={reason.trim().length < 5 || busy} onClick={() => decide('reject')}>Decline listing</button></div></fieldset></form> : <p className="notice-box">{selected.reason || 'This submission is no longer awaiting a decision.'}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </> : <div className="empty"><h2>Every listing starts with trust.</h2><p>Select a submission to inspect its listing and private documents. Owners handle their guests and reservations; administrators handle platform review.</p></div>}</section></div>
    <section className="panel"><h2>Listing register</h2>
      {!session.suspensionCancelsReservations && <p className="notice-box">Restart TourVista with <code>npm.cmd run dev:restart</code> to enable suspension with automatic cancellation.</p>}
      <div className="listing-register">{dashboard.campsites.map((item) => <RegistryRow key={item.id} camp={item} />)}</div>
    </section></>;
}
function RegistryRow({ camp }) {
  const { action, session, setNotice } = useApp();
  const [reason, setReason] = useState(''), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const canSuspend = camp.approvalStatus === 'approved' && session.suspensionCancelsReservations;
  async function suspend(event) {
    event.preventDefault();
    if (!canSuspend || busy) return;
    setBusy(true);
    try {
      const result = await action(`/admin/campsites/${camp.id}/suspend`, {
        method: 'PATCH', body: { revision: camp.revision, reason },
      }, 'Campsite suspended.');
      if (result) {
        setOpen(false);
        setReason('');
        const count = result.cancelledReservations;
        setNotice(count === 1 ? 'Campsite suspended and 1 reservation cancelled.' : `Campsite suspended and ${count} reservations cancelled.`);
      }
    } finally { setBusy(false); }
  }
  return <div className="register-item">
    <div className="list-row">
      <div><strong>{camp.name}</strong><p>Owner #{camp.ownerId}{camp.demoListing ? ' · fictional demo' : ''}</p></div>
      <ListingStatus camp={camp} />
      {camp.approvalStatus === 'approved' && <button type="button" disabled={!canSuspend || busy} onClick={() => setOpen(!open)}>Suspend</button>}
    </div>
    {open && canSuspend && <form className="inline-form" onSubmit={suspend}>
      <p className="notice-box">Suspending this campsite cancels its pending and active stays, disables trip directions, and removes its saved itinerary stops and check-ins.</p>
      <Field label={`Suspension reason for ${camp.name}`} required minLength="5" maxLength="1000" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
      <button disabled={busy}>{busy ? 'Suspending…' : 'Suspend listing and cancel bookings'}</button>
    </form>}
  </div>;
}
