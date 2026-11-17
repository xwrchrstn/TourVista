import React, { useEffect, useState } from 'react';
import { useApp } from './context.jsx';
import { loadSaved, saveSaved, savedKey } from './marketplace.js';
import Icon from './Icons.jsx';

export function useSavedCamps(user) {
  const key = savedKey(user), [snapshot, setSnapshot] = useState({ key: null, ids: [] });
  useEffect(() => { let ids = []; try { ids = loadSaved(window.localStorage, key); } catch {} setSnapshot({ key, ids }); }, [key]);
  const savedIds = snapshot.key === key ? snapshot.ids : [];
  function toggle(id) {
    if (!key || !Number.isSafeInteger(id) || id <= 0) return false;
    const ids = savedIds.includes(id) ? savedIds.filter((value) => value !== id) : [...savedIds, id].slice(-100);
    let stored = false; try { stored = saveSaved(window.localStorage, key, ids); } catch { /* Some browsers restrict local storage. Keep the current session usable. */ }
    setSnapshot({ key, ids }); return stored;
  }
  return { savedIds, toggle };
}
export function SaveButton({ camp, compact = false }) {
  const { session, savedIds, toggleSaved, navigate, setNotice } = useApp();
  if (session.user && session.user.role !== 'tourist') return null;
  const saved = savedIds.includes(camp.id);
  return <button className={'save-camp ' + (compact ? 'save-camp-compact' : '') + (saved ? ' is-saved' : '')} type="button" aria-label={`${saved ? 'Unsave' : 'Save'} ${camp.name}`} aria-pressed={saved} onClick={() => {
    if (!session.user) { navigate('login'); setNotice('Sign in as a tourist to keep a list of your favourite campsites.'); return; }
    const stored = toggleSaved(camp.id); if (!stored) setNotice('Your saved list is available for this session. Browser storage is unavailable.');
  }}><Icon name="heart" size={compact ? 23 : 19} filled={saved} />{!compact && <span>{saved ? 'Saved' : 'Save'}</span>}</button>;
}
