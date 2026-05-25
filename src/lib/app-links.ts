const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

export const BRANDING_LINE = 'ezwrite · built by evan';

export function getLandingPageUrl(): string | undefined {
  const url = env.VITE_LANDING_PAGE_URL as string | undefined;
  return url?.trim() || undefined;
}
