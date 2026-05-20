const PREFIX = 'ezwrite-img-';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
