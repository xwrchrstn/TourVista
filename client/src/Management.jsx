import React, { useState } from 'react';
import { useApp, Field, money } from './context.jsx';
import { Status } from './Dashboards.jsx';
import Icon from './Icons.jsx';
import { ToolHeader, ToolMessage, AlgorithmNote } from './DecisionUI.jsx';
import { weatherFactors } from './decision-display.js';

export function Units() {
  const { dashboard, session, action } = useApp();
  const [campId, setCampId] = useState(dashboard.campsites[0]?.id || ''), [name, setName] = useState(''), [capacity, setCapacity] = useState(4);
  const [edit, setEdit] = useState(null), [unitId, setUnitId] = useState(dashboard.units[0]?.id || '');
  const [start, setStart] = useState(session.today), [end, setEnd] = useState(session.today), [reason, setReason] = useState('');
  return <><div className="page-heading"><p className="eyebrow">Availability management</p><h1>Units & closures.</h1><p>Reservations are allocated to a specific unit. Confirmed stays prevent conflicting closures and capacity changes.</p></div>
    <div className="dashboard-grid"><section className="panel"><h2>Add reservable unit</h2><form onSubmit={async (event) => { event.preventDefault(); const result = await action('/units', { method: 'POST', body: { campId: Number(campId), name, capacity } }, 'Unit added.'); if (result) setName(''); }}>
      <Field label="Campsite"><select required value={campId} onChange={(event) => setCampId(event.target.value)}>{dashboard.campsites.map((camp) => <option key={camp.id} value={camp.id}>{camp.name}</option>)}</select></Field>
      <Field label="Unit name" required minLength="2" value={name} onChange={(event) => setName(event.target.value)} /><Field label="Guest capacity" required type="number" min="1" max="100" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /><button className="primary" disabled={!campId}>Add unit</button>
    </form></section><section className="panel"><h2>Add closure dates</h2><form onSubmit={async (event) => { event.preventDefault(); await action('/closures', { method: 'POST', body: { unitId: Number(unitId), start, end, reason } }, 'Closure saved.'); }}>
      <Field label="Reservable unit"><select required value={unitId} onChange={(event) => setUnitId(event.target.value)}>{dashboard.units.filter((unit) => unit.active).map((unit) => <option key={unit.id} value={unit.id}>{dashboard.campsites.find((camp) => camp.id === unit.campId)?.name} / {unit.name}</option>)}</select></Field>
      <div className="two-fields"><Field label="Closure start" required type="date" min={session.today} value={start} onChange={(event) => setStart(event.target.value)} /><Field label="Reopening date" required type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></div>
      <Field label="Closure reason" required minLength="3" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="primary" disabled={!unitId}>Add closure</button>
    </form></section></div>
    <section className="panel"><h2>Reservable units</h2><div className="table-wrap"><table><thead><tr><th>Campsite / unit</th><th>Capacity</th><th>Status</th><th>Action</th></tr></thead><tbody>{dashboard.units.map((unit) => <tr key={unit.id}><td>{dashboard.campsites.find((camp) => camp.id === unit.campId)?.name}<br /><strong>{unit.name}</strong></td><td>{unit.capacity}</td><td><Status value={unit.active ? 'active' : 'inactive'} /></td><td><button onClick={() => setEdit({ ...unit })}>Edit unit</button></td></tr>)}</tbody></table></div>
      {edit && <form className="inline-form" onSubmit={async (event) => { event.preventDefault(); const result = await action(`/units/${edit.id}`, { method: 'PATCH', body: edit }, 'Unit updated.'); if (result) setEdit(null); }}>
        <div className="two-fields"><Field label="Edit unit name" required value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /><Field label="Edit guest capacity" required type="number" min="1" max="100" value={edit.capacity} onChange={(event) => setEdit({ ...edit, capacity: Number(event.target.value) })} /></div>
        <label className="checkbox-label"><input type="checkbox" checked={edit.active} onChange={(event) => setEdit({ ...edit, active: event.target.checked })} />Unit active</label><button className="primary">Save unit</button>
      </form>}
    </section><section className="panel"><h2>Closure schedule</h2>{dashboard.closures.map((closure) => <div className="list-row" key={closure.id}><div><strong>{dashboard.units.find((unit) => unit.id === closure.unitId)?.name}</strong><p>{closure.start} → {closure.end} · {closure.reason}</p></div><button onClick={() => action(`/closures/${closure.id}`, { method: 'PATCH', body: {} }, 'Closure removed.')}>Remove closure</button></div>)}{!dashboard.closures.length && <p>No closures recorded.</p>}</section>
  </>;
}

export function Users() {
  const { dashboard, action, session } = useApp();
  return <><div className="page-heading"><p className="eyebrow">Administrator</p><h1>Accounts & roles.</h1><p>Manage account access and roles. Ownership evidence and listing decisions are handled in Listing approvals.</p></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Access</th></tr></thead><tbody>{dashboard.users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><br />{user.email}</td><td><select aria-label={`Role for ${user.email}`} value={user.role} onChange={(event) => action(`/admin/users/${user.id}`, { method: 'PATCH', body: { role: event.target.value } }, 'Account role updated.')}><option value="tourist">Tourist</option><option value="owner">Owner</option><option value="admin">Administrator</option></select></td><td><button onClick={() => action(`/admin/users/${user.id}`, { method: 'PATCH', body: { active: !user.active } }, 'Account access updated.')}>{user.active ? 'Active · disable' : 'Inactive · enable'}</button></td></tr>)}</tbody></table></div></section>
    {session.mailMode === 'preview' && <ResetRequests />}
  </>;
}
function ResetRequests() {
  const { dashboard, api, setError } = useApp();
  const [issued, setIssued] = useState(null);
  return <section className="panel"><h2>Account recovery requests</h2><p className="fine">Verify the account holder before providing a reset token through your agreed channel. Tokens expire after 15 minutes and are single use.</p>
    {dashboard.resetRequests.map((request) => <div className="list-row" key={request.id}><span>{request.email}</span><button onClick={async () => { try { const result = await api(`/admin/reset-token/${request.id}`, { method: 'POST', body: {} }); setIssued({ ...result, email: request.email }); } catch (failure) { setError(failure.message); } }}>Generate reset token</button></div>)}
    {!dashboard.resetRequests.length && <p>No pending recovery requests.</p>}
    {issued && <div className="notice-box"><strong>Reset token for {issued.email}</strong><p className="token">{issued.token}</p><p>The account holder selects “I have a reset link or token” on the recovery page. This fallback is for local testing only.</p><button onClick={() => setIssued(null)}>Hide token</button></div>}
  </section>;
}
export function Reviews() {
  const { dashboard, action } = useApp();
  return <><div className="page-heading"><p className="eyebrow">Administrator</p><h1>Review moderation.</h1><p>Hidden reviews remain in the audit history.</p></div><section className="panel">{dashboard.reviews.map((review) => <div className="list-row" key={review.id}><div><strong>{review.author} · {'★'.repeat(review.rating)}</strong><p>{review.text}</p><small>Reservation #{review.reservationId}</small></div><button onClick={() => action(`/admin/reviews/${review.id}`, { method: 'PATCH', body: { visible: !review.visible } }, 'Review visibility updated.')}>{review.visible ? 'Hide review' : 'Show review'}</button></div>)}{!dashboard.reviews.length && <p>No reviews submitted yet.</p>}</section></>;
}
export function WeatherSettings() {
  const { dashboard, action } = useApp();
  const [config, setConfig] = useState({ ...dashboard.config, reason: '' });
  const sum = config.weights.reduce((total, value) => total + value, 0), validSum = Math.abs(sum - 1) < 1e-8;
  return <><div className="page-heading"><p className="eyebrow">Administrator · weather model</p><h1>Make the weather model clear.</h1><p>Review how the five forecast factors contribute to WSI. These are proposed capstone parameters; changes require a reason and create a new model version.</p></div>
    <section className="panel decision-tool"><ToolHeader icon="cloud" eyebrow="Weather Suitability Index" title="Five factors. One recorded configuration." algorithm="WSI parameters" description="Weights control each factor's contribution. Thresholds describe the project model; they are not official weather-warning thresholds." />
      <div className="weather-config-context"><span>Current model<strong>{dashboard.config.version}</strong></span><span>Forecast snapshots<strong>{dashboard.weatherStatus.snapshots}</strong></span><span>Last retrieved<strong>{dashboard.weatherStatus.latest ? new Date(dashboard.weatherStatus.latest).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'No snapshots yet'}</strong></span></div>
      <form onSubmit={(event) => { event.preventDefault(); action('/admin/weather-config', { method: 'PUT', body: config }, 'A new WSI configuration version was saved.'); }}><div className="weather-config-factors">{weatherFactors.map((factor, index) => <div key={factor.code}><Icon name={factor.icon} size={23} /><Field label={factor.label + ' weight'} type="number" min="0" max="1" step="0.01" required value={config.weights[index]} onChange={(event) => { const weights = [...config.weights]; weights[index] = Number(event.target.value); setConfig({ ...config, weights }); }} /><small>Factor {factor.code} · {(config.weights[index] * 100).toFixed(0)}% contribution</small></div>)}</div>
        <ToolMessage title={`Total weight: ${sum.toFixed(3)} / 1.000`} icon={validSum ? 'check' : 'info'} tone={validSum ? 'positive' : 'caution'}>{validSum ? 'The five weights add up correctly.' : 'Adjust the weights so they add up to exactly 1 before saving.'}</ToolMessage>
        <h3>Scoring thresholds</h3><p className="tool-caption">The temperature range receives the highest temperature-comfort score. The wind reference controls the wind factor; the storm cap limits WSI when the forecast contains a thunderstorm flag.</p><div className="two-fields">{[['minTemperature', 'Comfort range minimum (°C)'], ['maxTemperature', 'Comfort range maximum (°C)'], ['windReference', 'Wind reference (km/h)'], ['thunderstormCap', 'Thunderstorm score cap']].map(([key, label]) => <Field label={label} type="number" step="any" required value={config[key]} key={key} onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })} />)}</div>
        <Field label="Reason for this change" required minLength="5" maxLength="300" placeholder="Explain the approved parameter change for the audit record." value={config.reason} onChange={(event) => setConfig({ ...config, reason: event.target.value })} /><button className="primary compact" disabled={!validSum}>Save new model version <Icon name="arrow" size={16} /></button>
      </form><AlgorithmNote name="WSI"><p>Rain, temperature, weather condition, wind and thunderstorm scores are combined using these weights. The thunderstorm cap is applied after weighting. Stay suitability is the lowest daily score, including departure day.</p><p>A version change prevents older forecast snapshots being reused as current assessments. Record the reason, preserve the paper's assumptions and validate parameter changes with the capstone adviser or domain reviewers.</p></AlgorithmNote>
    </section></>;
}

export function Audit() {
  const { dashboard, api, action, reload, navigate, setError, setNotice } = useApp();
  const [backup, setBackup] = useState(null), [acknowledged, setAcknowledged] = useState(false);
  async function download() {
    try {
      const response = await fetch('/api/admin/backup'); if (!response.ok) throw new Error('Backup could not be exported.');
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'tourvista-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Backup exported. Keep it private; it includes account password hashes.'); await reload();
    } catch (failure) { setError(failure.message); }
  }
  return <><div className="page-heading"><p className="eyebrow">Administrator</p><h1>Audit & recovery.</h1><p>Actor, action, record, and time are recorded for operational changes.</p></div>
    <section className="panel"><h2>Backup and restore</h2><button className="primary compact" onClick={download}>Download database backup</button>
      <Field label="Choose a TourVista JSON backup"><input type="file" accept="application/json,.json" onChange={async (event) => { setAcknowledged(false); try { const file = event.target.files[0]; if (file.size > 4 * 1024 * 1024) throw new Error('Backup must be below 4 MB in this prototype.'); const parsed = JSON.parse(await file.text()); setBackup(parsed); } catch (failure) { setError(failure.message); setBackup(null); } }} /></Field>
      {backup && <><p className="fine">Backup exported: {backup.exportedAt || 'unknown'} · version {backup.version}</p><label className="checkbox-label"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Replace current local records with this backup. A recovery copy will be saved on the server first.</label><button className="secondary compact" disabled={!acknowledged} onClick={async () => { const result = await api('/admin/restore', { method: 'POST', body: backup }).catch((failure) => { setError(failure.message); return null; }); if (result) { await reload(); navigate('login'); setNotice('Backup restored. Sign in again using the restored account credentials.'); } }}>Restore selected backup</button></>}
    </section><section className="panel"><h2>Recent audit events</h2><div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead><tbody>{dashboard.audit.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.actorId ?? 'Guest'}</td><td>{event.action}</td><td>{event.recordId ?? '—'}</td></tr>)}</tbody></table></div></section></>;
}
