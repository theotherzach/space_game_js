# progress.md — space_game_js

Running log of changes. Newest at the top. Survives context resets.

## 2026-05-22

### Session 1, batch 9 — read the source, rewrite to match it

User correctly called out that the prior implementation was guessing,
not porting. Decompiled `thespacegame.v83.swf` with JPEXS Free Flash
Decompiler (autoDeobfuscate enabled) — full AS2 class hierarchy at
`/tmp/v83_deob/scripts/__Packages/` and the game's main DoAction at
`/tmp/v83_deob/scripts/frame_2/DoAction.as`. Replaced the made-up
mechanics with the ones the actual game uses:

- **Energy is a flow, not a flag.** Every building stores `energy` /
  `maxEnergy`. There is a new building type — the energy generator
  (`EnergyGen`, 600 HP, max 4 energy, 200 cost) — that produces
  `3 * efficiency` per 10 ticks (efficiency 0.3 at L1). Consumers call
  `game.requestEnergy(self, needs)` which walks the consumer's
  precomputed `mines[]` (the BFS path-graph) and drains real energy
  from producers in depth order.
- **`path()` reruns** whenever the topology changes (build, sell, or
  a building finishes constructing). Mirrors `_root.path()` in source.
- **Mining is pulse-fire.** `mineRate=60`, `mineTicker += 8` per tick;
  when `mineTicker >= mineRate` AND `energy >= maxEnergy`, the miner
  drains its 1 energy, picks a random asteroid from its `_planets`
  list, draws a laser, and extracts `_mineQuantity=4`. If energy can't
  fill, the miner shows a red ring and waits. Continuous extraction
  was wrong.
- **Construction takes time and energy.**
    - Relay: every tick, request 1 energy. Got ≥ 0.5 → +2 construction.
    - Miner: every tick, request `maxEnergy - buildEnergy`, accumulate,
      consume 1 unit per construction step.
    - Energy gen (L1): every `constructionTick` (10 frames), request 1.
- **Pan + zoom**: right-click drag pans, wheel zooms 0.2–1.0, WASD
  pans, Q/E zooms. World coords are now separate from canvas pixels.
- **Costs match source**: relay 20, miner 45, energy 200, store 300,
  repair 300, laser 100, rocket 400 (was 15/40/60/150/80).
- **Position snaps to 5 px grid** (`int(x/5)*5`, matches source).
- **Removed**: tech tree, booster building, multi-mission scaffolding,
  research panel, help/mission panels — none of these exist in the
  original. They'll be replaced with per-building upgrades and the
  real `levels.as` mission data in subsequent batches.

Still to port (in order):
1. Laser turret + Rocket turret with splash damage
2. Six enemy ship types (`ship1`–`ship6`) — fighters, missile ships,
   exploders, ring ships, swarmers, mother ships
3. `buildingStore`, `buildingRepair`
4. Per-building Upgrade UI (each placed building can be upgraded 1-3x)
5. Real level data from `levels.as`

### Session 1, batch 8 — hover tooltips + endless high score

- Canvas-rendered hover tooltips for buildings, enemies, and minerals.
  Tooltip auto-flips when it would clip a canvas edge. Surfaces the live
  effective rate of miners and turrets including booster stacks and
  tech buffs (so the player can read what each building is actually
  doing right now).
- Endless high score (`bestEndlessWave`) persisted to localStorage.
  Updated on endless-mode loss; surfaced as "Best: wave N" on the
  Endless card in the mission panel.

### Session 1, batch 7 — shortcuts + endless + help + HUD counter

- Endless mode as Mission 4 — unlocks after winning M3, no goal, the
  banner stat slot becomes "Wave N · X mined".
- Keyboard shortcuts: C/D/T/L/B/X for build modes; 1/2/3/4 for speeds;
  W skip wave; R research; M mute; H help; Esc cancel-or-close.
- Help panel (`?` button or H) with three-column glossary.
- HUD "Field: X" — total remaining minerals on the map.

### Session 1, batch 6 — missions + save + end-of-mission stats

- **Three-mission campaign** with `MISSIONS` data: Outpost (1500 goal),
  Frontier (2500 goal, +15% mineral abundance and harder waves), Heart of
  the Storm (4000 goal, +30% mineral abundance, ~50% more enemies per wave).
- `reset(missionId)` accepts an explicit mission; researched set is carried
  across resets (campaign-style progression). `hardReset()` wipes everything.
- **Win/lose banner** now shows mission name + stats panel (elapsed, mined,
  kills, waves) and offers Next mission / Replay / Missions buttons.
- **Mission panel** (`#mission-panel`) modal with one card per mission, lock
  state, current marker. Reset-save link wipes localStorage.
- **localStorage save** under key `space_game_js.save.v1`. Persists on
  research purchase, mission win, and hard reset. Auto-loads on init.

### Session 1, batch 5 — bomber + booster + laser

- **Bomber enemy**: suicide-on-contact, AOE damage to all buildings in 72 px
  with linear falloff. Pulsing orange diamond. Spawns from wave 4.
- **Booster**: cyan-green node with 90 px aura. Networked miners gain +25%
  extraction per booster; turrets gain +25% damage and 25% faster fire.
  Stacks multiplicatively with tech buffs.
- **Laser turret variant**: `new Turret(x, y, "laser")` — 1.55× range,
  2.1× damage, 1.6× fire interval. Cost 150. Bullets are faster and cyan.
- Bullet damage is captured at fire time including the booster multiplier
  so in-flight rounds aren't retroactively rebuffed.

### Session 1, batch 4 — audio + tank + approach markers + skip wave

- **Audio**: `Sfx` object backed by Web Audio API. Pure oscillator+gain envelopes,
  no asset files. AudioContext initializes on first pointer-down. Hooks:
  shoot, hit, death, build, sell, wave, win, lose, research. Mute button (🔊/🔇)
  and `M` key toggle.
- **Tank enemy**: square sprite with armor X. Slow, very high HP/damage, drops
  20 minerals. Spawns from wave 3, scales 1 per 2 waves.
- **Wave preview system**: `prepareWaveSpec()` runs on reset and after each
  `spawnWave()`, computing the next wave's enemy composition and pre-rolled
  edge spawn positions. `drawApproachMarkers()` paints pulsing triangles at
  those positions in the last 3s of the countdown so you can read where the
  threat is coming from.
- **Skip-wave button**: "Send wave" in the HUD bar plus W shortcut. Only fires
  between waves. Sets `next_wave = time + 0.5` so the existing wave loop picks
  it up cleanly.

### Session 1, batch 3 — sell + particles + flashes + scout
### Session 1, batch 2 — tech tree
### Session 1, batch 1 — initial build

**Initial commit (`7e23554`)** — vanilla HTML/Canvas scaffold:
- `index.html`, `style.css`, `game.js`, `README.md`, `.gitignore`
- `Game` orchestrates the world; `Entity` base class with `Base`, `Connector`,
  `Miner`, `Turret`, `Mineral`, `Enemy`, `Bullet` subclasses
- Network propagation: BFS from base via building-to-building distance check
- Mouse-driven placement; Pause/Slow/Normal/Fast speed bar; Esc/right-click cancel
- Verified end-to-end in Chrome: networked miner extracted 48 minerals over 6s

**Tech tree (`d6671ef`)** — 3 branches × 3 tiers:
- Refactored module-level constants into `BASE_TECH` + `computeTech(researched)`.
  Entities now read `game.tech.*` instead of capturing constants at load.
- `Entity` gained `baseMaxHp` and `applyHpMult(mult)` so HP scales proportionally
  to current damage when Armor research is bought.
- `Bullet` carries its `damage` value at construction time — Power Grid buffs only
  affect freshly-fired shots, not in-flight rounds.
- Modal panel rendered from `TECH_TREE` data. Auto-pauses sim while open.
- "R" key toggles the panel. Esc closes it (then falls back to clearing placement).

**Polish batch (pending commit at end of this session)**:
- **Bug fix**: `Enemy` was shadowing the inherited `damage()` method with
  `this.damage = damage` in the constructor. Renamed to `attackDamage` so bullets
  can actually kill enemies. This was latent — never surfaced because no earlier
  test ran a bullet against an enemy.
- **Sell mode**: new build button. Click to enter, click a non-base building to
  refund 60% of its build cost. Hover shows the refund value in gold.
- **Particles**: short-lived `Particle` class with friction-decayed velocity.
  Spawned on enemy death, building death, and sell.
- **Damage flash**: each `Entity` carries a `flash` timer that ticks down. Painted
  as a faint white circle overlay during `draw()`.
- **Scout enemy**: new triangular sprite, faster and weaker than raider. Spawns
  starting wave 2, scaling with wave number.

**Verification this session**:
- Built turret, spawned wave, ran 4s of sim — turret fired 5 bullets and enemy
  took 24 HP of damage. Bullet→damage path verified post-fix.
- Sell flow: built connector for 15, sold for 9 (15 × 0.6) — refund math correct.
- Particles spawn on kill (22 in flight after a one-tick post-kill update).
- Tech tree: bought Mining I then Mining II, miner rate went 8 → 13.52 (8 × 1.3²).
- Armor I bought after placing a turret: turret maxHp 60 → 75 (×1.25), hp scaled
  proportionally. New connectors after research spawn at 31.25 maxHp (25 × 1.25).
