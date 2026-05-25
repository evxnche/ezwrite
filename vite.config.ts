import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import { execSync } from "node:child_process";

const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version?: string;
};

function getGitCommitSha(): string {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (envSha) return envSha.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version ?? "0.0.0"),
    __APP_COMMIT_SHA__: JSON.stringify(getGitCommitSha()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "favicon.ico"],
      manifest: {
        name: "ezwrite",
        short_name: "ezwrite",
        description: "A minimal writing app",
        start_url: "/",
        display: "standalone",
        background_color: "#171717",
        theme_color: "#171717",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "get-nonce": path.resolve(__dirname, "./src/shims/get-nonce.ts"),
    },
  },
});
