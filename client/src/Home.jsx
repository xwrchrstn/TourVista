import React, { useEffect, useRef, useState } from 'react';
import { useApp, Field, money } from './context.jsx';
import { CampCard } from './CampComponents.jsx';
import { Modal } from './MarketplaceUI.jsx';
import Icon from './Icons.jsx';
import { emptyFilters, quickFilters, quickFilterActive, applyQuickFilter } from './marketplace.js';

function Filters({ initial, apply, close }) {
  const { session } = useApp(), [draft, setDraft] = useState({ ...initial, amenities: [...initial.amenities] });
  const change = (patch) => setDraft((value) => ({ ...value, ...patch }));
  return <Modal title="Filters" close={close} className="filters-modal"><form onSubmit={(event) => { event.preventDefault(); apply(draft); close(); }}><div className="filter-sections"><section><h3>Nightly price</h3><p>Price per reservable unit, per night.</p><div className="two-fields"><Field label="Minimum price (₱)" type="number" min="0" max={draft.maxPrice || '1000000'} placeholder="No minimum" value={draft.minPrice} onChange={(event) => change({ minPrice: event.target.value })} /><Field label="Maximum price (₱)" type="number" min={draft.minPrice || '0'} max="1000000" placeholder="No maximum" value={draft.maxPrice} onChange={(event) => change({ maxPrice: event.target.value })} /></div></section>
      <section><h3>Guest ratings</h3><p>Ratings come from visible reviews of completed stays.</p><Field label="Minimum review rating"><select value={draft.minRating} onChange={(event) => change({ minRating: event.target.value })}>{[['0', 'All ratings, including unreviewed'], ['3', '3 stars & above'], ['4', '4 stars & above'], ['4.5', '4.5 stars & above'], ['5', '5 stars']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></section>
      <section><h3>What this place offers</h3><div className="filter-amenities">{session.amenities.map((item) => <label className="amenity-choice" key={item}><span>{item}</span><input type="checkbox" checked={draft.amenities.includes(item)} onChange={(event) => change({ amenities: event.target.checked ? [...draft.amenities, item] : draft.amenities.filter((value) => value !== item) })} /></label>)}</div></section></div>
      <div className="filter-dialog-footer"><button type="button" className="text-action" onClick={() => setDraft({ ...emptyFilters, search: initial.search, amenities: [] })}>Clear filters</button><button className="primary compact" type="submit">Show matching campsites</button></div>
    </form></Modal>;
}
export default function Home() {
  const { api, campsites, catalogFilters, setCatalogFilters } = useApp();
  const resultsHeading = useRef(null);
  const [search, setSearch] = useState(catalogFilters.search), [rows, setRows] = useState([]), [filterOpen, setFilterOpen] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [sort, setSort] = useState('price'), [page, setPage] = useState(1);
  useEffect(() => { setSearch(catalogFilters.search); }, [catalogFilters.search]);
  useEffect(() => {
    let live = true; setBusy(true); setError(''); setPage(1);
    api('/campsites?' + new URLSearchParams({ ...catalogFilters, amenities: catalogFilters.amenities.join(',') }))
      .then((result) => { if (live) setRows(result.campsites); })
      .catch((failure) => { if (live) { setRows([]); setError(failure.message); } })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [catalogFilters, campsites]);
  const ordered = [...rows].sort(sort === 'rating' ? (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.id - b.id : sort === 'price-desc' ? (a, b) => b.price - a.price || a.id - b.id : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.price - b.price || a.id - b.id);
  const pages = Math.max(1, Math.ceil(ordered.length / 12));
  const filterCount = (catalogFilters.minPrice || catalogFilters.maxPrice ? 1 : 0) + (Number(catalogFilters.minRating) > 0 ? 1 : 0) + catalogFilters.amenities.length;
  const hasFilters = Boolean(filterCount || catalogFilters.search);
  function clearFilters() { setCatalogFilters({ ...emptyFilters, amenities: [] }); setSearch(''); }
  function submitSearch(event) {
    event.preventDefault();
    setCatalogFilters({ ...catalogFilters, search: search.trim() });
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start' });
  }
  return <section className="market-catalog">
    <header className="claveria-hero">
      <div className="claveria-hero-copy">
        <p className="claveria-region"><Icon name="pin" size={17} /> Misamis Oriental, Philippines</p>
        <h1>Go camping<br />in Claveria.</h1>
        <p>Find a campsite, check your dates, and plan the drive.</p>
      </div>
      <a className="claveria-photo-credit" href="https://commons.wikimedia.org/wiki/File:Mt._Sumagaya_Landscape.jpg" target="_blank" rel="noreferrer">Mt. Sumagaya · Theglennpalacio</a>
    </header>
    <form className="catalog-find" role="search" onSubmit={submitSearch}>
      <label className="catalog-query"><Icon name="search" size={22} /><input type="search" aria-label="Search campsites" placeholder="Find a campsite" value={search} maxLength="120" onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy}>Search</button>
      <button type="button" className="filter-trigger" onClick={() => setFilterOpen(true)}><Icon name="filters" size={19} />Filters{filterCount > 0 && <span>{filterCount}</span>}</button>
    </form>
    <div className="market-browse-toolbar"><div className="quick-filters" aria-label="Quick filters">{quickFilters.map((item) => <button key={item.id} aria-pressed={quickFilterActive(catalogFilters, item.id)} className={quickFilterActive(catalogFilters, item.id) ? 'active' : ''} onClick={() => setCatalogFilters(applyQuickFilter(catalogFilters, item.id))}><Icon name={item.icon} size={17} /><span>{item.name}</span></button>)}</div></div>
    {hasFilters && <div className="applied-filters" aria-label="Applied search filters">{catalogFilters.search && <span>“{catalogFilters.search}”</span>}{(catalogFilters.minPrice || catalogFilters.maxPrice) && <span>{catalogFilters.minPrice ? money(Number(catalogFilters.minPrice)) : 'Any minimum'} – {catalogFilters.maxPrice ? money(Number(catalogFilters.maxPrice)) : 'Any maximum'}</span>}{Number(catalogFilters.minRating) > 0 && <span>★ {catalogFilters.minRating} & up</span>}{catalogFilters.amenities.map((item) => <span key={item}>{item}</span>)}<button className="text-action" onClick={() => { setCatalogFilters({ ...emptyFilters, amenities: [] }); setSearch(''); }}>Clear all</button></div>}
    <div className="market-results-heading" ref={resultsHeading} tabIndex={-1}>
      <h2>{hasFilters ? 'Search results' : 'Campsites in Claveria'}</h2>
      <p aria-live="polite">{busy ? 'Loading campsites…' : `${rows.length} ${rows.length === 1 ? 'campsite' : 'campsites'}`}</p>
      {rows.length > 0 && <label className="market-sort"><span>Sort by</span><select aria-label="Sort campsites" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="price">Lowest price</option><option value="price-desc">Highest price</option><option value="rating">Top rated</option><option value="name">Campsite name</option></select></label>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}{!busy && !error && !rows.length && <div className="saved-empty catalog-empty"><Icon name={hasFilters ? 'search' : 'tent'} size={32} /><h3>{hasFilters ? 'No campsites match your filters' : 'No campsites published yet'}</h3><p>{hasFilters ? 'Try a different search or change the price, rating, and amenity filters.' : 'Campsites appear here after TourVista approves the owner’s listing.'}</p>{hasFilters && <button onClick={clearFilters}>Clear search and filters</button>}</div>}
    <div className={'market-grid' + (busy ? ' is-loading' : '')} data-count={ordered.length} aria-busy={busy}>{ordered.slice((page - 1) * 12, page * 12).map((camp) => <CampCard key={camp.id} camp={camp} />)}</div>
    {pages > 1 && <nav className="pagination" aria-label="Campsite result pages"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {pages}</span><button disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button></nav>}
    {filterOpen && <Filters initial={catalogFilters} close={() => setFilterOpen(false)} apply={setCatalogFilters} />}
  </section>;
}
