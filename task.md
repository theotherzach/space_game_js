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
- Building types: Connector (15), Miner (40), Turret (60), Laser turret (150), Booster (80)
- BFS power network from the base; out-of-range buildings go inert
- Mineral asteroid clusters spawn around the base each run; abundance scales per mission
- Four enemy types: Raider, Scout (wave 2+), Tank (wave 3+), Bomber (wave 4+, suicide AOE)
- Turrets carry their damage on each fired bullet so tech buffs don't retroactively boost in-flight rounds
- Damage flashes on hit, death particles for enemies and buildings, bomber AOE on contact
- Sell mode: refund 60% of build cost, hover shows the refund preview
- Speed controls (Pause/Slow/Normal/Fast); Spacebar pause; Esc cancels placement
- Skip-wave button ("Send wave" / W) collapses the countdown when the field is clear
- Approach markers: pulsing triangles on the edge in the last 3s of countdown showing where the next wave will arrive
- Audio: Web Audio oscillator SFX for build/sell/shoot/hit/death/wave/win/lose/research, mute toggle
- Boosters: aura buffs nearby networked miners (extraction) and turrets (damage + rate of fire); +25% per booster, stacks
- Tech tree: 3 branches × 3 tiers (Economy / Network / Defense), all linear within branch
  - Buying re-renders the tree, rescales HP proportionally on existing buildings, recomputes the network
  - "R" key or Research button opens a modal that auto-pauses the sim
- **Campaign**: 3 missions (Outpost / Frontier / Heart of the Storm) with escalating goals,
  starting minerals, mineral abundance, and wave intensity
- Mission panel with locked/unlocked/current state; win unlocks the next mission
- Win banner shows mission name + stats (time, minerals, kills, waves) and offers Next/Replay/Missions
- `localStorage` save (key `space_game_js.save.v1`): persists `researched` set and `unlocked` mission;
  Reset save button in the mission panel

## Known issues / gaps

- No mobile/touch input support.
- No volume control (only mute toggle).
- Mineral hover tooltips would help; right now you have to read tiny numbers near each rock.
- Turret/Miner UI doesn't surface their current boosted rate visually.
- Only 3 missions. No randomized "endless" mode.

## Open ideas (in rough priority)

1. Endless mode (mission 4) — no goal, see how many waves you survive
2. Hover tooltips on buildings showing current effective rate and boost stacks
3. Volume slider + audio mix tuning (some sounds are louder than necessary)
4. Mineral aggregate UI: total remaining minerals on map shown in HUD
5. Mobile/touch layout
6. Stretch: keyboard shortcuts for build modes (C/M/T/L/B/S)
7. Stretch: drag-place buildings (build many connectors at once)

## Notes

- All commits authored by zbriggs only. No Co-Authored-By, no Claude badges.
- Constants in `game.js` live at the top of the file in `BASE_TECH` and `COSTS`.
- New code in `game.js` should keep entities as classes with `update(dt, game)` and `draw(ctx)`.
