// Chunk library. Every chunk is 5x5.
//   .  air        #  ground       ^  spikes
//   S  spring     P  spawn        G  goal flag
// Physics cheat-sheet: jump clears 2 tiles up (3 is too high), a running
// jump clears a 3-wide gap, springs bounce ~5 tiles.
export const CHUNKS = {
  start: ['.....', '.....', '.....', '.P...', '#####'],
  goal: ['.....', '.....', '.....', '...G.', '#####'],
  flat: ['.....', '.....', '.....', '.....', '#####'],
  spikes: ['.....', '.....', '.....', '.^^^.', '#####'],
  wall: ['.....', '..#..', '..#..', '..#..', '#####'],
  bump: ['.....', '.....', '.....', '..##.', '#####'],
  stairsUp: ['.....', '...##', '..###', '.####', '#####'],
  plateau: ['.....', '#####', '#####', '#####', '#####'],
  cliffRise: ['.....', '....#', '....#', '....#', '#####'],
  spring: ['.....', '.....', '.....', '..S..', '#####'],
  hole: ['.....', '.....', '.....', '.....', '#...#'],
  air: ['.....', '.....', '.....', '.....', '.....'],
  goalTower: ['...G.', '#####', '#####', '#####', '#####'],
  goalLeft: ['.....', '.....', '.....', '.G...', '#####'],
};

// cols/rows: grid of chunk slots. fixed: pre-placed chunks keyed "col,row".
// pieces: the tray. Every empty slot must be filled; extra pieces are decoys.
export const LEVELS = [
  {
    name: 'Snap In',
    hint: 'Tap a piece, then tap the empty slot. Then hit Play.',
    cols: 3, rows: 1,
    fixed: { '0,0': 'start', '2,0': 'goal' },
    pieces: ['flat'],
  },
  {
    name: 'Choose Wisely',
    hint: 'More pieces than slots. Some are traps.',
    cols: 3, rows: 1,
    fixed: { '0,0': 'start', '2,0': 'goal' },
    pieces: ['wall', 'hole'],
  },
  {
    name: 'Two High',
    hint: 'You can jump 2 blocks high. Not 3.',
    cols: 3, rows: 1,
    fixed: { '0,0': 'start', '2,0': 'goalTower' },
    pieces: ['cliffRise', 'spikes', 'stairsUp'],
  },
  {
    name: 'Order Matters',
    hint: 'The flag is a piece now.',
    cols: 3, rows: 1,
    fixed: { '0,0': 'start' },
    pieces: ['goalTower', 'hole', 'stairsUp'],
  },
  {
    name: 'Spring Loaded',
    hint: 'Springs bounce you about 5 blocks up.',
    cols: 3, rows: 2,
    fixed: { '0,1': 'start', '2,1': 'hole', '0,0': 'air', '2,0': 'goal' },
    pieces: ['flat', 'spring', 'wall', 'hole'],
  },
  {
    name: 'Down the Hatch',
    hint: 'Gravity is free. Climbing back up is not.',
    cols: 3, rows: 2,
    fixed: { '0,0': 'start', '0,1': 'goalLeft', '1,0': 'flat' },
    pieces: ['hole', 'flat', 'cliffRise', 'wall', 'spikes'],
  },
  {
    name: 'Grand Tour',
    hint: 'Sometimes the long way round is the only way.',
    cols: 3, rows: 2,
    fixed: { '0,1': 'start', '0,0': 'goalLeft', '1,0': 'spikes' },
    pieces: ['spring', 'hole', 'flat', 'wall', 'hole'],
  },
  {
    name: 'Patchwork',
    hint: 'Zig, zag, zig.',
    cols: 3, rows: 3,
    fixed: { '0,2': 'start', '2,0': 'goal' },
    pieces: ['spring', 'spring', 'hole', 'hole', 'flat', 'spikes', 'bump', 'wall', 'hole'],
    solution: { '1,2': 'flat', '2,2': 'spring', '2,1': 'hole', '1,1': 'bump', '0,1': 'spring', '0,0': 'hole', '1,0': 'spikes' },
  },
];
