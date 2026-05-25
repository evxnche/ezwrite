const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

export const BRANDING_LINE = 'ezwrite · built by evan';
export const DEFAULT_LANDING_PAGE_URL = 'https://ezwrite.evanche.xyz';

export function getLandingPageUrl(): string {
  const url = env.VITE_LANDING_PAGE_URL as string | undefined;
  return url?.trim() || DEFAULT_LANDING_PAGE_URL;
}
