import { useEffect, useState } from 'react';
import { logoUrl, logoFallback, onLogoChanged } from '../utils/logo.js';

// Company logo: renders the custom logo served by the backend when one has been
// uploaded from Settings, otherwise falls back to the bundled default asset.
export default function CompanyLogo({ className, alt, style }) {
  const [url, setUrl] = useState(logoUrl());
  const [failed, setFailed] = useState(false);

  useEffect(() => onLogoChanged(() => { setUrl(logoUrl()); setFailed(false); }), []);

  if (failed) {
    return <img src={logoFallback} alt={alt} className={className} style={style} />;
  }
  return <img src={url} alt={alt} className={className} style={style} onError={() => setFailed(true)} />;
}