# Patchwork 🧩

Build the level, then beat it. Each level is a grid of 5×5 chunks; some are locked, the rest you fill from a fixed tray of pieces (some are decoys).

- **Build:** tap a piece then a slot, or drag it. Tap a placed piece and then another slot to swap; tap it twice to send it back.
- **Play:** ◀ ▶ pad + jump button (or arrows/WASD + space). `R` restart, `B`/`Esc` rebuild.

## Files
- `src/physics.js` — deterministic 60 Hz platformer physics (shared by game + solver)
- `src/levels.js` — chunk library + level list. **Add levels here.**
- `src/solver.js` — brute-force reachability using the real physics with slightly nerfed tuning
- `tools/check-levels.mjs` — `npm test`: proves every level is solvable and counts how many layouts work
  (`node tools/check-levels.mjs 5` lists level 5's solutions)

Jump ≈ 2.5 tiles high (2-tile walls OK, 3 not), running jump clears a 3-wide gap, springs ≈ 5.7 tiles.
