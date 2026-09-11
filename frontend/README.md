# LEOS renderer

React 18, TypeScript, Vite, Mantine, Zustand, and TanStack Query form the LEOS
desktop renderer. Inside Electron, `installDesktopTransport.ts` maps the typed
request client onto the sandboxed preload bridge. Browser development may use
an explicitly configured HTTP test server, but production has no HTTP backend.

```powershell
npm install
npm run dev
npm run typecheck
npm run build
```

The production output is `frontend/dist`; Electron Builder copies it to the
packaged `resources/renderer` directory. The renderer has no Node integration
and never opens SQLite directly.
