# task.md — space_game_js

Vanilla HTML/JS/Canvas reimagining of *The Space Game* (2009, Casual Collective).
Lives here so it survives context resets.

## Repo

- Owner: `theotherzach`
- URL: https://github.com/theotherzach/space_game_js
- Default branch: `main`
- Local: `~/Code/space_game_js`
- Dev server: `cd ~/Code/space_game_js && python3 -m http.server 8765`

## Shipped (faithful port from decompiled source)

- Vanilla HTML / Canvas / JS, no framework, no bundler
- Source decompiled with JPEXS at `/tmp/v83_deob/` — class hierarchy in
  `__Packages/` and main game loop in `frame_2/DoAction.as`
- **Energy graph**: per-building `energy` / `maxEnergy`; `requestEnergy(node, needs)`
  walks `node.mines[]` (precomputed BFS paths from energy producers) draining
  energy from producers in depth order. Matches `_root.requestEnergy()` exactly.
- **Energy generator** (`EnergyGen`): 600 HP, max 4 energy, 200 cost.
  Generates `3 * efficiency` per 10 ticks (efficiency 0.3 at L1).
- **Miner**: 300 HP, 45 cost, pulse-mines on a 60-tick clock with
  `mineTicker += 8/tick`. When timer fires AND energy ≥ maxEnergy, drains
  energy to 0, picks random asteroid from `_planets`, draws a laser, takes
  `mineQuantity=4`. Red ring while waiting for energy. Continuous extraction
  was wrong — this is what the source does.
- **Relay**: 100 HP, 20 cost, range 90. Network-only, forwards energy.
- **Construction takes time and energy.** Each building type's port matches
  source: relay adds +2 per energy received per frame; miner accumulates
  energy in `buildEnergy` and spends 1 per construction step; energy gen L1
  needs external energy via the `constructionTick=10` gate.
- **Pan + zoom**: right-click drag pans the camera, mouse wheel zooms
  (0.2–1.0), WASD pans, Q/E zoom.
- **Build cost match source**: relay 20, miner 45, energy 200, store 300,
  repair 300, laser 100, rocket 400.
- **5 px grid snap** on placement (matches `int(x/5)*5` in source).
- Speed controls (Pause / Slow / Normal / Fast), Space pauses, R sells the
  building under the cursor.
- Web Audio SFX for shoot, hit, death, build, sell, mining, built, wave,
  win, lose.

## Remaining port work (in order)

1. **Laser turret + Rocket turret.** `buildingLaser.as` and
   `buildingRocket.as`. Rocket has splash, fire rate 1 per ~unknown,
   damage 450, splash radius 40. Laser has continuous beam mechanic.
2. **Six enemy ship types** from `ship1.as` … `ship6.as`:
   fighters / missile ships / exploders / ring ships / swarmers /
   mother ships. Each has its own AI in source.
3. **`buildingStore`** (storage) and **`buildingRepair`** (repairs
   damaged adjacent buildings).
4. **Per-building Upgrade UI.** Each placed building has `_upgrades`
   remaining and an `upgrade()` method that bumps level (1→2→3), HP,
   damage, etc. Source pattern is: click building → side panel shows
   upgrade button → click to spend minerals → costs scale per type.
5. **Real `levels.as` mission data.** Source has 12+ missions starting
   with two tutorials (mining basics, defense basics). Each mission
   sets which buildings are buildable, places starter buildings via
   `autoPlace`, and lays out asteroid fields at scripted positions.

## Decompile workflow

Source is at `/tmp/v83_deob/`. To re-export with deobfuscation:

```
/opt/homebrew/opt/openjdk/bin/java \
  -jar /tmp/ffdec/FFDec.app/Contents/Resources/ffdec.jar \
  -config autoDeobfuscate=true,autoDeobfuscateIdentifiers=true \
  -export script /tmp/v83_deob \
  ~/Downloads/space-game/extracted/content/storage.cloud.casualcollective.com/zones/pub/100/thespacegame.v83.swf
```

`__Packages/<class>.as` files are the cleanest source-of-truth.
Cross-reference with `frame_2/DoAction.as` for root-level functions
(`requestEnergy`, `path`, `tempLink`, `fire`, `splash`, `build`).

## Notes

- All commits authored by zbriggs only. No Co-Authored-By, no Claude badges.
- Constants in `game.js` live at the top of the file in `BASE_TECH` and `COSTS`.
- New code in `game.js` should keep entities as classes with `update(dt, game)` and `draw(ctx)`.
