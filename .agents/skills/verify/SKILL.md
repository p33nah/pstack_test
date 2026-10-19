---
name: verify
description: Verify the pstack React web app in a browser after changes to its startup or app shell.
---

# Verify the pstack web app

## Launch

Install the project dependencies with `npm install`. Install the browser once with `npx playwright install chromium --only-shell`. Then run `npm run build`, `npm run lint`, and `npm run verify` from the repository root.

`npm run verify` starts Vite at `http://127.0.0.1:4173/`. The helper prints `[verify] ready` after the page responds, runs the Doctor check, opens the page in headless Chromium, and stops the Vite process it started. It refuses to use a port that another process owns. The app has no data store, seed data, or authentication.

## Doctor

The helper checks that its Vite process is still running, that the process owns port 4173, and that the page serves the `pstack` title and `/src/main.tsx` entry point. A build runs before verification. Authentication does not apply. If Doctor fails, read the Vite log path printed by the helper and do not treat the run as verified.

## Drive

Use `npm run verify` to open the root page in Chromium. The helper verifies the HTTP response, document title, empty `#root`, empty visible body, and absence of browser console and page errors. The only current user entry point is `http://127.0.0.1:4173/`.

## Evidence

The helper records the navigation action and observed page state in `.artifacts/verify/app-shell/<run-id>.json`. It saves a full-page screenshot beside the report and the Vite output in `<run-id>.server.log`. The artifacts are ignored by Git and remain after the server stops.

Accept a proof only when the report shows status `200`, title `pstack`, one empty app root, no visible body text, and no console or page errors. The screenshot must show the resulting blank page. Do not replace this user path with a direct component render.

## Cleanup

The helper closes Chromium and stops only the Vite process it started, by its process handle. It leaves the screenshot, report, and server log in `.artifacts/verify/app-shell/`. If the helper is interrupted, rerun `npm run verify`; it will refuse to start if another process still owns port 4173.

## Helpers

The browser driver is `scripts/verify-app.mjs`. Run it with `npm run verify` from the repository root.
