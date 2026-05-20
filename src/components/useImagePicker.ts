export function useImagePicker() {
  async function pickImage(): Promise<{ dataUrl: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result as string });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      // Some browsers fire 'cancel' instead of onChange with no files
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  return { pickImage };
}
