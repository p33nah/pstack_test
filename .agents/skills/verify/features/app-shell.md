# Open the app

The root page opens the pstack app. Its canvas is intentionally blank until the first app feature is added.

## Sub-features

- `app-open` opens the root page and renders the empty app shell without browser errors.

## How to get to it (user POV)

- Open `http://127.0.0.1:4173/` in a browser during a verification run.

## Driving it with Playwright

Preconditions:

- `npm install` has completed.
- Chromium is installed with `npx playwright install chromium --only-shell`.
- Port 4173 is free. `npm run verify` refuses to use a port owned by another process.

- **Open the app.** Run `npm run verify`. The helper opens the root page and reports status `200` with title `pstack`.
- **Check the shell.** The helper verifies that `#root` exists and has no child elements or text, the visible page has no text, and the browser reports no console or page errors.
- **Keep the proof.** Read the run's JSON report and screenshot under `.artifacts/verify/app-shell/`. The report records the navigation action and resulting page state.

## Gotchas

- A blank page is the current expected result. Any visible text or child under `#root` means this feature map needs an update.
- The helper uses port 4173 and exits if another process owns it. Do not drive a server started outside the current verification run.
- The helper retains evidence after it stops the Vite process.
