import React from 'react';
import { Field } from './context.jsx';

export function RouteOptions({ mode, onChange }) {
  return <>
    <Field label="Route type">
      <select value={mode} onChange={(event) => onChange(event.target.value)}>
        <option value="driving">Recommended driving route</option>
        <option value="local">Local Dijkstra route (Claveria)</option>
      </select>
    </Field>
    <p className="tool-caption">
      {mode === 'driving'
        ? 'When you preview a driving route, TourVista sends the starting and destination coordinates to the OSRM routing service. The public service logs route requests.'
        : 'The local Dijkstra preview calculates the shortest route in TourVista’s Claveria road graph.'}
    </p>
  </>;
}

export function DrivingSource({ source }) {
  return <p className="tool-caption">
    Route by {source} using OpenStreetMap data. Driving time is an estimate.{' '}
    <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map issue</a>
  </p>;
}
