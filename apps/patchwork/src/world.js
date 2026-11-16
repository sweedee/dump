import { PH } from './physics.js';

export const CHUNK = 5;

// level: { cols, rows, fixed: { "c,r": chunkName } }
// placement: { "c,r": pieceIndex } (indices into level.pieces)
// chunks: { name: [5 strings of 5 chars] }
export function buildWorld(level, placement, chunks) {
  const w = level.cols * CHUNK, h = level.rows * CHUNK;
  const tiles = new Array(w * h).fill('.');
  let spawn = null;
  for (let r = 0; r < level.rows; r++)
    for (let c = 0; c < level.cols; c++) {
      const key = `${c},${r}`;
      let name = level.fixed[key];
      if (!name && placement[key] != null) name = level.pieces[placement[key]];
      if (!name) continue;
      const rows = chunks[name];
      if (!rows) throw new Error(`unknown chunk "${name}"`);
      for (let y = 0; y < CHUNK; y++)
        for (let x = 0; x < CHUNK; x++) {
          let ch = rows[y][x];
          const wx = c * CHUNK + x, wy = r * CHUNK + y;
          if (ch === 'P') {
            spawn = { x: wx + 0.2, y: wy + 1 - PH - 1e-4 };
            ch = '.';
          }
          tiles[wy * w + wx] = ch;
        }
    }
  return { w, h, tiles, spawn, get: (x, y) => tiles[y * w + x] };
}

export const slotKeys = (level) => {
  const out = [];
  for (let r = 0; r < level.rows; r++)
    for (let c = 0; c < level.cols; c++) if (!level.fixed[`${c},${r}`]) out.push(`${c},${r}`);
  return out;
};
