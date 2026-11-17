# Foosbots 🤖

Table football where you don't touch the rods. You build a bot — **hardware** bought with a point budget,
plus a free **brain** of tactic sliders — and watch it play rival bots. Beat the ladder to earn more points.

## The bot
- **4 star ratings** (1–5 ★, from a star budget: 12 to start, +1 per ladder win): Speed (reaction + rod speed), Power, Accuracy (aim + spotting gaps), Control (traps, passes, fumbles, clean tricky shots). Each star is a big jump: 1★→5★ is roughly 15% → 85% win rate against an all-3★ bot.
- **4 game-plan choices**: Tempo (Quick/Balanced/Patient), Build-up (Pass/Mix/Blast), Striker shot (Straight/Pull/Bank/Power/Trick), Defence (React/Balanced/Read).
- Counters: Read defence shuts down Pull shots, Trick shots fool Read, Bank shots get round React. Rival game plans are shown on the ladder so you can pick a counter.
- `src/teams.js` `compile()` turns the simple card into the detailed engine parameters.

Sounds are synthesized live with WebAudio (`src/sound.js`); 🔊 toggles them.

## Files
- `src/sim.js` — deterministic 240 Hz physics + the bot AI (no DOM; runs in node)
- `src/teams.js` — stat/tactic definitions, archetypes, ladder rivals, share codes
- `src/render.js` — canvas table (vertical on portrait phones, horizontal otherwise)
- `src/main.js` — UI: home/ladder, editor + scrimmage lab, match viewer, result screen with tips
- `tools/sweep.mjs` — how much each star / option moves win rate
- `tools/counters.mjs` — striker shot vs defence matrix
- `tools/balance.mjs` — `npm test` / `node tools/balance.mjs [N] [all|rivals|presets]`: round-robin win matrix + per-shot-type stats
