# dump 🗑️

Dumb ideas, vibecoded in bed. Every folder in `apps/` is a tiny prototype; together they ship as one GitHub Pages site with a gallery.

**Site:** https://sweedee.github.io/dump/ · **Branch previews:** https://sweedee.github.io/dump/preview/

## How it works
- `apps/<slug>/index.html` → `https://sweedee.github.io/dump/<slug>/`. Plain HTML/JS, no build.
- `meta.json` in each app powers the gallery card.
- Pushing **any branch** deploys it: the default branch goes to the site root, other branches go to `/preview/<branch>/`. So you can try a phone session's work without merging. Deleting a branch removes its preview.
- Apps can define `npm test` (run in CI before deploy) or opt into a `build` step.

```sh
npm run new -- my-idea "My Idea" 🦆   # scaffold
npm run dev                          # build + serve on :8080
npm test                             # run app checks
```

## One-time setup
Settings → Pages → **Build and deployment** → Source: *Deploy from a branch* → `gh-pages` / `(root)`.
(The `gh-pages` branch appears after the first workflow run.)

## Prototypes
- **[Patchwork](apps/patchwork/)** 🧩 — assemble the platformer level from a fixed set of pieces, then beat it. Includes a solver that uses the real game physics to prove each level is beatable (`apps/patchwork/tools/check-levels.mjs`).
