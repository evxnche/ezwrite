const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

export const BRANDING_LINE = 'ezwrite · built by evan';
export const LANDING_PAGE_HOST = 'ezwrite.evanche.xyz';
export const DEFAULT_LANDING_PAGE_URL = `https://${LANDING_PAGE_HOST}`;

export function getLandingPageUrl(): string {
  const raw = env.VITE_LANDING_PAGE_URL as string | undefined;
  const url = raw?.trim() || DEFAULT_LANDING_PAGE_URL;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

export function getLandingPageDisplayLabel(): string {
  try {
    return new URL(getLandingPageUrl()).host;
  } catch {
    return LANDING_PAGE_HOST;
  }
}

export async function copyLandingPageUrl(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(getLandingPageUrl());
    return true;
  } catch {
    return false;
  }
}
