export function validRouteStart(point) {
  return Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}

export function readDeviceStart(geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error('Location is unavailable on this device. Set your start on the map.'));
      return;
    }
    geolocation.getCurrentPosition(({ coords }) => {
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      if (!validRouteStart(point)) {
        reject(new Error('Your device did not return a usable location. Set your start on the map.'));
        return;
      }
      const accuracy = Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : null;
      resolve({ point, accuracy });
    }, () => {
      reject(new Error('TourVista could not get your location. Allow location access or set your start on the map.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
