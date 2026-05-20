const PREFIX = 'ezwrite-img-';

// Resize anything whose longest edge exceeds this, re-encode as JPEG.
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;
// Skip the resize/re-encode work for already-small dataUrls.
const SMALL_ENOUGH = 500_000;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Decode the image, fit it inside MAX_DIM x MAX_DIM, re-encode as JPEG.
// Falls back to the original dataUrl if anything goes wrong.
export function processImageForStorage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w0, naturalHeight: h0 } = img;
      if (!w0 || !h0) { resolve(dataUrl); return; }
      const longest = Math.max(w0, h0);
      const needsResize = longest > MAX_DIM;
      if (!needsResize && dataUrl.length < SMALL_ENOUGH) {
        resolve(dataUrl);
        return;
      }
      const scale = needsResize ? MAX_DIM / longest : 1;
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function saveImage(dataUrl: string): string {
  const id = generateId();
  try {
    localStorage.setItem(PREFIX + id, dataUrl);
  } catch {
    // storage full — silently skip
  }
  return id;
}

export function loadImage(id: string): string | null {
  return localStorage.getItem(PREFIX + id);
}

export function deleteImage(id: string): void {
  localStorage.removeItem(PREFIX + id);
}

// Sweep — delete localStorage image entries not referenced by any provided content.
// Caller passes every page of every project (and scratchpads) so cross-project photos
// aren't accidentally collected. Safe to call on app load.
export function gcOrphanImages(allContent: string[]): void {
  const liveIds = new Set<string>();
  for (const c of allContent) {
    if (!c) continue;
    for (const line of c.split('\n')) {
      const m = line.match(/^polaroid::([^|]+)/);
      if (m) liveIds.add(m[1]);
    }
  }
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const id = key.slice(PREFIX.length);
    if (!liveIds.has(id)) toDelete.push(key);
  }
  for (const k of toDelete) localStorage.removeItem(k);
}
