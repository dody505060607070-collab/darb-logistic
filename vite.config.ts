// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // exceljs is loaded on demand; pre-bundling it at startup avoids a mid-session dependency reload
  // that leaves the page with two React copies ("Cannot read properties of null (reading 'useState')").
  vite:{optimizeDeps:{include:['exceljs']},plugins:[VitePWA({strategies:'generateSW',filename:'sw.js',injectRegister:null,registerType:'autoUpdate',manifest:false,devOptions:{enabled:false},workbox:{globPatterns:['**/*.{js,css,png,jpg,woff2}'],navigateFallback:null,runtimeCaching:[{urlPattern:({request,url})=>request.mode==='navigate'&&url.origin===self.location.origin&&!url.pathname.startsWith('/~oauth')&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/_serverFn/'),handler:'NetworkFirst',options:{cacheName:'shitaa-pages',networkTimeoutSeconds:8,expiration:{maxEntries:20,maxAgeSeconds:86400}}},{urlPattern:({url})=>url.origin===self.location.origin&&/\/assets\/.*[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2)$/.test(url.pathname),handler:'CacheFirst',options:{cacheName:'shitaa-hashed-assets',expiration:{maxEntries:100,maxAgeSeconds:2592000}}}]}})]},
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
