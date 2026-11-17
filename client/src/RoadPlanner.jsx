import React from 'react';
const ArrivalPlanner = React.lazy(() => import('./ArrivalPlanner.jsx'));
export default function RoadPlanner(props) {
  return <React.Suspense fallback={<p className="tool-loading">Preparing the map and arrival planner…</p>}><ArrivalPlanner {...props} /></React.Suspense>;
}
