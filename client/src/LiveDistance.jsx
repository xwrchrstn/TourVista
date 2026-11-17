import { useEffect, useState } from 'react';
import { validRouteStart } from './route-start.js';

export function useLiveDistance(enabled) {
  const [tracking, setTracking] = useState(false);
  const [fix, setFix] = useState(null);
  const [error, setError] = useState('');

  function stop() {
    setTracking(false);
    setFix(null);
    setError('');
  }

  function start() {
    setError('');
    if (!navigator.geolocation?.watchPosition) {
      setError('Live location needs a supported browser and a secure connection.');
      return;
    }
    setTracking(true);
  }

  useEffect(() => {
    if (!enabled || !tracking) return;
    const geolocation = navigator.geolocation;
    let active = true;
    const watcher = geolocation.watchPosition(({ coords }) => {
      if (!active) return;
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      if (!validRouteStart(point)) return;
      setFix({ point, accuracy: Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : null });
      setError('');
    }, (failure) => {
      if (!active) return;
      setFix(null);
      if (failure.code === 1) {
        setTracking(false);
        setError('Allow TourVista to use your location, then start live distance again.');
      } else {
        setError('Waiting for a GPS fix. Check that location is enabled on your phone.');
      }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    return () => { active = false; geolocation.clearWatch(watcher); };
  }, [enabled, tracking]);

  return { tracking, fix, error, start, stop };
}
