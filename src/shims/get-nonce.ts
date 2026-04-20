type NoncedWindow = Window & typeof globalThis & {
  __webpack_nonce__?: string;
};

export function getNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const metaNonce = document
    .querySelector('meta[property="csp-nonce"], meta[name="csp-nonce"]')
    ?.getAttribute('content');

  if (metaNonce) return metaNonce;

  if (typeof window === 'undefined') return undefined;
  return (window as NoncedWindow).__webpack_nonce__;
}
