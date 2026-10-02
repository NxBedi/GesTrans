import logoFallback from '../assets/logo.png';

const BASE = '/api';
const KEY = 'ams_logo_version';
let version = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) || 0 : 0);
const listeners = new Set();

function persistVersion() {
  try { localStorage.setItem(KEY, String(version)); } catch { /* storage unavailable */ }
}

export function logoUrl() {
  return `${BASE}/settings/logo?v=${version}`;
}

export function bumpLogo() {
  version += 1;
  persistVersion();
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener error */ }
  });
}

export function onLogoChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { logoFallback };