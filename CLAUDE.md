# dump — phone-vibecoded prototypes

A monorepo of tiny prototypes, all published as ONE GitHub Pages site.
The owner usually works from their phone, so optimise for: small diffs,
zero build steps, mobile-first UI, and always pushing so a preview URL exists.

## Layout
- `apps/<slug>/` — one prototype per folder. Must contain `index.html`. Published at `/<slug>/`.
- `apps/<slug>/meta.json` — gallery card: `title`, `emoji`, `description`, `date` (YYYY-MM-DD), `tags`, optional `hidden: true`.
- `apps/_template/` — copied by `npm run new`. Folders starting with `_` are never published.
- `scripts/` — `build.mjs` (assembles `_site/` + gallery), `serve.mjs` (local dev), `test.mjs` (runs each app's `npm test`), `deploy.sh` (CI only).

## Adding a prototype
1. `npm run new -- <slug> "Title" 🦆`  (or copy `apps/_template` by hand)
2. Write plain HTML/CSS/JS (ES modules via `<script type="module">`). No bundler, no npm deps by default.
   CDN imports are fine (e.g. `https://cdn.jsdelivr.net/npm/<pkg>@<exact-version>/+esm`).
3. Use only **relative** paths (`./src/x.js`, `../` for the gallery). The site lives under `/<repo>/` and under `/<repo>/preview/<branch>/`.
4. Optional: an `apps/<slug>/package.json` with a `"test"` script runs in CI before deploy (failing test = no deploy).
   A `"build"` script opts that app into a build step: CI runs it and publishes `dist/` (or `meta.outDir`).

## Conventions
- Mobile first: `viewport-fit=cover`, safe-area insets, `100dvh`, big touch targets, `touch-action: none` on game surfaces. Should also work with a keyboard on desktop.
- Wrap `localStorage` in try/catch and prefix keys with the app slug.
- Keep each app self-contained; don't import across apps.

## Deploying
Push any branch → GitHub Action builds and publishes to the `gh-pages` branch:
- default branch → `https://sweedee.github.io/dump/`
- other branches → `https://sweedee.github.io/dump/preview/<branch-slug>/` (slug = branch lowercased, non-alphanumerics → `-`)
After pushing, tell the user the preview link for the app they're working on.

## Local check
`npm test && npm run build` (or `npm run dev` → http://localhost:8080).
