# task.md — space_game_js

Vanilla HTML/JS/Canvas reimagining of *The Space Game* (2009, Casual Collective).
Lives here so it survives context resets.

## Repo

- Owner: `theotherzach`
- URL: https://github.com/theotherzach/space_game_js
- Default branch: `main`
- Local: `~/Code/space_game_js`
- Dev server: `cd ~/Code/space_game_js && python3 -m http.server 8765`

## Shipped

- Top-down RTS with vanilla Canvas, no framework, no bundler
- Three building types: Connector (15), Miner (40), Turret (60)
- BFS power network from the base; out-of-range buildings go inert
- Mineral asteroid clusters spawn around the base each run
- Two enemy types: Raider (default) and Scout (faster, lower HP, spawns from wave 2)
- Turrets carry their damage on each fired bullet so tech buffs don't retroactively boost in-flight rounds
- Damage flashes on hit, death particles for both enemies and buildings
- Sell mode: refund 60% of build cost, hover shows the refund preview
- Speed controls (Pause/Slow/Normal/Fast); Spacebar pause; Esc cancels placement
- Win at 1500 collected minerals; lose if base HP hits 0
- Tech tree: 3 branches × 3 tiers (Economy / Network / Defense), all linear within branch
  - Buying re-renders the tree, rescales HP proportionally on existing buildings, recomputes the network
  - "R" key or Research button opens a modal that auto-pauses the sim

## Known issues / gaps

- Research is wiped on Restart. Not persisted across reloads either.
- Only one mission, one fixed goal value. No campaign progression.
- No save state, no settings, no audio.
- No mobile/touch input support.
- Wave timer is fixed; no "press to start next wave" button.

## Open ideas (in rough priority)

1. Persist research between Restarts in the same session, and optionally in localStorage
2. "Start next wave now" button to skip the countdown
3. More enemy types: tank (slow, high HP, high damage) and bomber (suicide AOE on base)
4. Mission select / progression with escalating goals and starting tech
5. New building types: Power Hub (range extender), Laser Turret (Tier 2 unlock from a new tech node)
6. Audio: build/sell/shoot/death/wave-start cues (single short oscillator-based blips, no assets)
7. Mineral display tweaks: highlight the cluster a hovered miner is mining
8. Visible enemy approach indicators on the edges before they enter
9. Mobile/touch layout

## Notes

- All commits authored by zbriggs only. No Co-Authored-By, no Claude badges.
- Constants in `game.js` live at the top of the file in `BASE_TECH` and `COSTS`.
- New code in `game.js` should keep entities as classes with `update(dt, game)` and `draw(ctx)`.
