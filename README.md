# space_game_js

A vanilla-JS reimagining of *The Space Game* (2009, Casual Collective). Top-down
RTS where you build a power network out from your base, mine asteroid fields,
and defend against waves of attackers.

## Run it

No build step. Open `index.html` in a browser, or:

```sh
python3 -m http.server 8000
open http://localhost:8000
```

## How to play

- Click a build button (Connector / Miner / Turret), then click on the map.
- Buildings light up when networked back to the base. Out-of-range = inert.
- Miners auto-pull from any mineral within range.
- Turrets shoot the nearest enemy in range.
- Right-click or Esc to cancel a placement. Spacebar pauses.
- Reach the mineral goal to win. Lose the base and it's over.

## Tech

- HTML5 Canvas
- Vanilla JS — no framework, no bundler
- One file each: `index.html`, `style.css`, `game.js`
