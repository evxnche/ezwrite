import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'ezwrite-install-hint';

const isIosSafari = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isStandalone = (navigator as { standalone?: boolean }).standalone === true;
  const isSafari = /safari/i.test(ua) && !/crios|fxios|opios|chrome/i.test(ua);
  return isIos && isSafari && !isStandalone;
};

const InstallHint: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!isIosSafari()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const show = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(show);
  }, []);

  useEffect(() => {
    if (!visible) return;
    localStorage.setItem(STORAGE_KEY, '1');
    const fade = setTimeout(() => setFading(true), 5000);
    const hide = setTimeout(() => setVisible(false), 5800);
    return () => { clearTimeout(fade); clearTimeout(hide); };
  }, [visible]);

  const dismiss = () => { setFading(true); setTimeout(() => setVisible(false), 800); };

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      className="fixed bottom-10 left-0 right-0 flex justify-center z-40 pointer-events-none"
    >
      <div
        className={`pointer-events-auto flex items-center gap-1.5 bg-popover text-popover-foreground font-mono text-xs px-3 py-2 rounded-xl border border-border shadow-md lowercase transition-opacity duration-700 ${fading ? 'opacity-0' : 'opacity-90 animate-fade-in'}`}
      >
        <span className="text-muted-foreground">tap</span>
        <span className="text-foreground">⎙</span>
        <span className="text-muted-foreground">→ add to home screen</span>
      </div>
    </div>
  );
};

export default InstallHint;
