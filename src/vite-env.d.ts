/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LANDING_PAGE_URL?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_COMMIT_SHA__: string;
