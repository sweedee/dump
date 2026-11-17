# Foosbots 🤖

Table football where you don't touch the rods. You build a bot — **hardware** bought with a point budget,
plus a free **brain** of tactic sliders — and watch it play rival bots. Beat the ladder to earn more points.

## The bot
- **Hardware** (1–10 each, limited by budget): Reflexes (perception lag), Rod speed, Power, Accuracy, Ball control (traps, catches, fumbles, clean pull/snake shots), Vision (spotting gaps and re-aiming).
- **Brain**: Patience, Feints, First touch (trap vs one-touch strike), Back rods (pass vs blast), Midfield (pass vs shoot), Shot aim (anywhere vs signature spot), Defence (react vs read), Back line (stack vs split).
- **Shot book**: weights for Straight / Pull / Bank / Snake + signature spot.

Built-in counters: feints beat reading defences, reading beats predictable signature shooters, pull shots beat slow reflexes,
bank shots dodge line-blockers, one-touch strikes catch defences before they're set but mishit a lot.

## Files
- `src/sim.js` — deterministic 240 Hz physics + the bot AI (no DOM; runs in node)
- `src/teams.js` — stat/tactic definitions, archetypes, ladder rivals, share codes
- `src/render.js` — canvas table (vertical on portrait phones, horizontal otherwise)
- `src/main.js` — UI: home/ladder, editor + scrimmage lab, match viewer, result screen with tips
- `tools/balance.mjs` — `npm test` / `node tools/balance.mjs [N] [all|rivals|presets]`: round-robin win matrix + per-shot-type stats
