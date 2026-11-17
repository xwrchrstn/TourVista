import React from 'react';
import Icon from './Icons.jsx';

export default function CampsiteFacts({ camp }) {
  const profile = camp.profile || {};
  return <div className="campsite-facts"><div className="arrival-times"><div><Icon name="calendar" size={21} /><span>Check-in<strong>{profile.checkInTime || 'Ask the host'}</strong></span></div><div><Icon name="calendar" size={21} /><span>Check-out<strong>{profile.checkOutTime || 'Ask the host'}</strong></span></div></div>
    {profile.address && <section><h3>Property address</h3><p>{profile.address}</p></section>}
    {profile.accessInstructions && <section><h3>Getting here</h3><p>{profile.accessInstructions}</p></section>}
    {(profile.contactPhone || profile.contactEmail) && <section><h3>Contact the campsite</h3><div className="campsite-contacts">{profile.contactPhone && <a href={'tel:' + profile.contactPhone.replace(/[^+\d]/g, '')}>{profile.contactPhone}</a>}{profile.contactEmail && <a href={'mailto:' + profile.contactEmail}>{profile.contactEmail}</a>}</div></section>}
    {profile.cancellationPolicy && <section><h3>Cancellation & changes</h3><p>{profile.cancellationPolicy}</p></section>}
  </div>;
}
