import React, { useEffect, useState } from 'react';
import { AppContext, tomorrow } from './context.jsx';
import { requestApi } from './api-client.js';
import { readRoute, routeHash, publicPages, canOpenPage } from './flow.js';
import Home from './Home.jsx';
import MarketplaceHeader from './MarketplaceHeader.jsx';
import { SavedPage } from './MarketplaceUI.jsx';
import { useSavedCamps } from './SavedControls.jsx';
import { DetailsPage, ReservationPage, ConfirmationPage } from './Journey.jsx';
import AuthPage, { AccountCreated } from './AuthPages.jsx';
const AccountSettings = React.lazy(() => import('./AccountSettings.jsx'));
import { Overview, Bookings } from './Dashboards.jsx';
const Itinerary = React.lazy(() => import('./Itinerary.jsx'));
import { Units, Users, Reviews, WeatherSettings, Audit } from './Management.jsx';
const Reports = React.lazy(() => import('./Reports.jsx'));
import { OwnerListings, ListingReviews } from './Ownership.jsx';

export default function App() {
  const [session, setSession] = useState(null), [dashboard, setDashboard] = useState(null), [campsites, setCampsites] = useState([]);
  const [route, setRoute] = useState(() => readRoute(window.location.hash)), [trip, setTrip] = useState(null);
  const [origin, setOrigin] = useState({ latitude: 8.61, longitude: 124.89 }), [weights, setWeights] = useState({ price: 100 / 3, distance: 100 / 3, amenities: 100 / 3 });
  const [catalogFilters, setCatalogFilters] = useState({ search: '', minPrice: '', maxPrice: '', minRating: '0', amenities: [] }), [originSource, setOriginSource] = useState('claveria');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [created, setCreated] = useState(null);
  const { savedIds, toggle: toggleSaved } = useSavedCamps(session?.user);
  const page = route.page;
  async function api(path, options = {}) { return requestApi(path, options, { session, onSession: setSession }); }
  async function reload() {
    const current = await api('/session'); setSession(current); setTrip((value) => value || { start: current.today, end: tomorrow(current.today), partySize: 2 });
    const catalog = await api('/campsites'); setCampsites(catalog.campsites);
    if (current.user) setDashboard(await api('/dashboard')); else setDashboard(null);
    return current;
  }
  useEffect(() => { reload().catch((failure) => setError('Could not connect to TourVista. Keep the project server running. ' + failure.message)); }, []);
  useEffect(() => { const update = () => { setRoute(readRoute(window.location.hash)); window.scrollTo({ top: 0, behavior: 'instant' }); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => {
    if (!session?.user) return;
    let live = true;
    function refreshStatus() {
      if (document.visibilityState !== 'visible') return;
      api('/dashboard').then((value) => { if (live) setDashboard(value); }).catch(() => { if (live) reload().catch(() => {}); });
    }
    const timer = setInterval(refreshStatus, 15000);
    document.addEventListener('visibilitychange', refreshStatus);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', refreshStatus); };
  }, [session?.user?.id]);
  function navigate(next, id, continuation) {
    const hash = routeHash(next, id, continuation); setRoute(readRoute(hash));
    if (window.location.hash !== hash) window.location.hash = hash;
    setError(''); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function action(path, options, message = 'Saved.') {
    setError(''); setNotice('');
    try { const result = await api(path, options); if (result.csrf) setSession((value) => ({ ...value, csrf: result.csrf })); await reload(); setNotice(message); return result; }
    catch (failure) { setError(failure.message); return null; }
  }
  async function signedIn(result, kind) {
    if (kind === 'register') {
      await requestApi('/auth/logout', { method: 'POST' }, { session: { ...session, user: result.user, csrf: result.csrf }, onSession: setSession });
      await reload(); setCreated(result.user); navigate('account-created', null, route.next === 'reservation' && route.campId ? { page: 'reservation', id: route.campId } : undefined); return;
    }
    setSession((value) => ({ ...value, user: result.user, csrf: result.csrf })); setDashboard(await api('/dashboard'));
    if (result.user.role === 'tourist' && route.next === 'reservation' && route.campId) navigate('reservation', route.campId);
    else if (!publicPages.has(route.page) && canOpenPage(result.user.role, route.page)) navigate(route.page, route.id);
    else navigate(result.user.role === 'tourist' ? 'home' : 'dashboard');
  }
  async function logout() { const result = await action('/auth/logout', { method: 'POST' }, 'Signed out.'); if (result) { setOriginSource('claveria'); setOrigin({ latitude: 8.61, longitude: 124.89 }); navigate('home'); } }
  const user = session?.user, workspace = ['owner', 'admin'].includes(user?.role);
  const tabs = user?.role === 'admin' ? [['dashboard', 'Overview'], ['users', 'Accounts'], ['listings', 'Listing approvals'], ['bookings', 'Reservation overview'], ['reviews', 'Reviews'], ['reports', 'Reports'], ['weather', 'WSI settings'], ['audit', 'Audit & backup'], ['account', 'Account settings']] :
    user?.role === 'owner' ? [['dashboard', 'Host overview'], ['listings', 'My campsites'], ['units', 'Availability'], ['bookings', 'Reservation requests'], ['reports', 'Reports'], ['account', 'Account settings']] :
    [['home', 'Campsites'], ...(user ? [['dashboard', 'My dashboard'], ['bookings', 'My trips'], ['saved', 'Saved campsites'], ['itinerary', 'My itinerary'], ['account', 'Account settings']] : [])];
  const navigation = <nav className={workspace ? 'workspace-nav' : 'app-nav'} aria-label="Main navigation">{tabs.map(([key, label]) => <button key={key} className={page === key || (key === 'home' && ['details', 'reservation', 'confirmation'].includes(page)) ? 'selected' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav>;
  let content;
  if (!session || !trip) content = <div className="panel empty">{error || 'Connecting to TourVista…'}</div>;
  else if (!publicPages.has(page) && !user) content = <AuthPage kind="login" onSuccess={signedIn} />;
  else if (session.workflowVersion !== 'capstone-listings-2' && !publicPages.has(page)) content = <section className="panel empty"><h2>Load the updated TourVista service.</h2><p>The interface is ready, but the running backend is an earlier version. Restart the existing project terminal before using the updated booking and listing approval screens.</p><p>Press Ctrl+C, then run <code>npm.cmd run dev</code> from the tourvista-complete folder. Keep only one TourVista server running.</p></section>;
  else if (['account', 'verify-email', 'register', 'forgot', 'reset'].includes(page) && session.accountVersion !== 'email-accounts-1') content = <section className="panel empty"><h2>Load the updated account service.</h2><p>Restart your existing TourVista terminal with Ctrl+C, then npm.cmd run dev once. Refresh this page after the API is ready.</p></section>;
  else if (!canOpenPage(user?.role, page)) content = <section className="panel empty"><h2>This page belongs to a different workspace.</h2><button onClick={() => navigate(user ? 'dashboard' : 'home')}>Return to my workspace</button></section>;
  else if (['login', 'register', 'forgot', 'reset', 'verify-email'].includes(page)) content = <AuthPage key={page + '-' + window.location.hash} kind={page} onSuccess={signedIn} />;
  else if (page === 'account-created') content = <AccountCreated user={created} />;
  else if (page === 'account') content = <React.Suspense fallback={<p>Loading account settings…</p>}><AccountSettings /></React.Suspense>;
  else if (page === 'home') content = <Home />;
  else if (page === 'saved') content = <SavedPage />;
  else if (page === 'details') content = <DetailsPage key={route.id} />;
  else if (page === 'reservation') content = <ReservationPage key={route.id} />;
  else if (page === 'confirmation') content = <ConfirmationPage />;
  else if (page === 'dashboard') content = <Overview />;
  else if (page === 'bookings') content = <Bookings />;
  else if (page === 'itinerary' && user?.role === 'tourist') content = <React.Suspense fallback={<p>Loading your itinerary…</p>}><Itinerary /></React.Suspense>;
  else if (page === 'listings' && workspace) content = user.role === 'admin' ? <ListingReviews /> : <OwnerListings />;
  else if (page === 'units' && user?.role === 'owner') content = <Units />;
  else if (page === 'reports' && workspace) content = <React.Suspense fallback={<p className="tool-loading">Preparing your activity report…</p>}><Reports /></React.Suspense>;
  else if (page === 'users' && user?.role === 'admin') content = <Users />;
  else if (page === 'reviews' && user?.role === 'admin') content = <Reviews />;
  else if (page === 'weather' && user?.role === 'admin') content = <WeatherSettings />;
  else if (page === 'audit' && user?.role === 'admin') content = <Audit />;
  else content = <section className="panel empty"><h2>This page is unavailable for your account.</h2><button onClick={() => navigate(user ? 'dashboard' : 'home')}>Return to your starting page</button></section>;
  return <AppContext.Provider value={{ session, dashboard, campsites, api, action, reload, navigate, route, trip, setTrip, catalogFilters, setCatalogFilters, origin, setOrigin, originSource, setOriginSource, weights, setWeights, setError, setNotice, savedIds, toggleSaved }}>
    <MarketplaceHeader logout={logout} />
    {!workspace && user && !['home', 'details', 'reservation', 'confirmation'].includes(page) && navigation}<div className={workspace ? 'workspace-shell' : ''}>{workspace && <aside className="workspace-rail"><p className="eyebrow">{user.role === 'admin' ? 'System management' : 'Campsite workspace'}</p>{navigation}<div className="rail-bottom"><button onClick={() => navigate('home')}>Visitor homepage ↗</button><button onClick={() => navigate('home')}>Browse campsites</button><button onClick={logout}>Sign out</button></div></aside>}
      <main className="app-main">{session?.mode === 'demo' && <div className="demo-banner">Demonstration listings · campsite locations and check-in boundaries are illustrative.</div>}{session && session.workflowVersion !== 'capstone-listings-2' && <p className="notice-box">The website interface has updated. Restart the existing TourVista terminal with Ctrl+C, then run npm.cmd run dev once to load the full campsite editor and review service.</p>}{error && <p className="error" role="alert">{error}<button className="dismiss" aria-label="Dismiss error" onClick={() => setError('')}>×</button></p>}{notice && <p className="success" role="status">{notice}</p>}{user?.role === 'owner' && !user.verified && <p className="notice-box">You can prepare a listing now. Submit ownership evidence from My campsites; it becomes public after administrator approval.</p>}{user && user.emailVerificationRequired && !user.emailVerified && ['reservation', 'listings', 'dashboard'].includes(page) && <p className="notice-box">{user.emailVerificationRequired ? 'Confirm your email before booking or submitting a campsite for review.' : 'You can now confirm your email in Account settings. Existing account access is preserved.'} <button onClick={() => navigate('account')}>Account settings</button></p>}{content}</main></div>
    <footer className="site-footer"><div><strong>TourVista</strong><p>Discover Claveria. Compare your options.<br />Plan a stay that fits your priorities.</p></div><div><strong>Plan your trip</strong><button onClick={() => navigate('home')}>Campsites</button><button onClick={() => navigate(user ? 'bookings' : 'login')}>Your reservations</button></div><div><strong>Before you travel</strong><p>Weather suitability and routes support your planning.<br />Follow campsite instructions and official advisories.</p><a href="https://www.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer">PAGASA advisories ↗</a></div></footer>
  </AppContext.Provider>;
}
