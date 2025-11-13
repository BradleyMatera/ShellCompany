# ShellCompany Local UI

Local admin UI scaffold for ShellCompany. Built with Next.js 16 (App Router), TypeScript, Tailwind, and NextUI. Designed to run locally during development using `bun`.

Quick start (from repository root):

```bash
# install dependencies for the UI
cd local-ui
# using bun: install packages
bun install

# run dev server (Bun will run the script)
bun run dev
```

App will run at `http://localhost:3002` by default and talks to the backend API at `http://localhost:3001` (make sure the server is running).

Build & static export (creates `docs/`):

```bash
cd local-ui
bun run build
```

Notes:
- This is a minimal scaffold. Expand components and pages to match the tool UI you want.
- For a desktop binary, we can wrap this with Electron or Tauri in a follow-up.
