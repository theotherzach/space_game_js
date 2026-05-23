# progress.md — space_game_js

Running log of changes. Newest at the top. Survives context resets.

## 2026-05-22

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
