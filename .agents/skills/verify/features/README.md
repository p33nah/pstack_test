# pstack verification map

This directory maps the app's current user-visible behavior. Read this index before driving the app, then follow the matching feature file.

## Baseline

- Run `npm run build` and `npm run lint` from the repository root.
- Run `npm run verify`. It starts an isolated Vite process on `127.0.0.1:4173` and drives the app in headless Chromium.
- The app has no authentication, stored data, or seed requirements.
- The helper saves reports, screenshots, and server logs under `.artifacts/verify/app-shell/` and stops only the Vite process it started.

## Features

- [Open the app](./app-shell.md) covers the root page and its intentionally blank app shell.
