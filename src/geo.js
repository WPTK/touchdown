// Map projection shared by the data scripts and the browser: spherical azimuthal equidistant centred on a point (Snyder, Map
// Projections, eq. 22-1 to 22-5). x is NM east, y is NM north; distance and bearing from the centre are exact on the
// sphere. Elevation is not part of it. docs/data.md describes it.
export const EARTH_RADIUS_NM = 6371.0088 / 1.852; // IUGG mean radius in km / 1.852 km per NM

const round = (n, places) => (n === null ? null : Math.round(n * 10 ** places) / 10 ** places);

export function makeProjection(lat0, lon0) {
  const p0 = (lat0 * Math.PI) / 180;
  const l0 = (lon0 * Math.PI) / 180;
  return (lat, lon) => {
    const p = (lat * Math.PI) / 180;
    const dl = (lon * Math.PI) / 180 - l0;
    const cosC = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
    const c = Math.acos(Math.min(1, Math.max(-1, cosC)));
    const k = c < 1e-12 ? 1 : c / Math.sin(c);
    return {
      xNm: round(EARTH_RADIUS_NM * k * Math.cos(p) * Math.sin(dl), 4),
      yNm: round(EARTH_RADIUS_NM * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)), 4),
    };
  };
}


// The inverse (Snyder eq. 20-14 to 20-15): NM east and north of the centre back to latitude and longitude in degrees.
export function makeInverse(lat0, lon0) {
  const p0 = (lat0 * Math.PI) / 180;
  const l0 = (lon0 * Math.PI) / 180;
  return (xNm, yNm) => {
    const rho = Math.hypot(xNm, yNm);
    if (rho < 1e-12) return { lat: lat0, lon: lon0 };
    const c = rho / EARTH_RADIUS_NM;
    const p = Math.asin(Math.cos(c) * Math.sin(p0) + (yNm * Math.sin(c) * Math.cos(p0)) / rho);
    const l = l0 + Math.atan2(xNm * Math.sin(c), rho * Math.cos(p0) * Math.cos(c) - yNm * Math.sin(p0) * Math.sin(c));
    return { lat: (p * 180) / Math.PI, lon: (l * 180) / Math.PI };
  };
}
