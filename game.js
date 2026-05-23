// The Space Game — JS port of the 2009 Flash original by Casual Collective.
// Mechanics ported directly from the decompiled ActionScript.
// Tick model: simulation runs at 30 ticks per second to match Flash.

const W = 1024;
const H = 640;
const TPS = 30;                          // simulation ticks per second (Flash framerate)

// Build costs (from frame_2/DoAction.as build())
const COSTS = {
  relay: 20,
  miner: 45,
  energy: 200,
  store: 300,
  repair: 300,
  laser: 100,
  rocket: 400,
};
const SELL_REFUND = 0.5;     // _value tracks half the cumulative spend; full refund of _value

// Network and miner constants (all from source)
const ENERGY_RANGE = 90;      // _energyRange on every building
const MINE_RANGE = 35;        // miner _mineRange
const MINE_RATE = 60;         // ticks between possible mine pulses
const MINE_TICK_STEP = 8;     // _mineTicker increment per frame
const MINER_QUANTITY = 4;     // _mineQuantity per pulse
const MINER_MAX_ENERGY = 1;
const ENERGY_MAX = 4;         // buildingEnergy _maxEnergy
const ENERGY_EFFICIENCY = 0.3;// L1 efficiency; produces 3*eff per _tickStep cycle
const ENERGY_TICK_STEP = 10;  // generator refills every 10 ticks

const CONSTRUCTION_TARGET = 10;
const CONSTRUCTION_TICK = 10; // try to add 1 progress every N frames if energy is available

const RELAY_HP = 100;
const MINER_HP = 300;
const ENERGY_HP = 600;

// ---------- audio ----------
const SOUNDS = {
  shoot:  { type: "square",   f0: 800, f1: 220, d: 0.06, v: 0.05 },
  hit:    { type: "sawtooth", f0: 420, f1: 80,  d: 0.07, v: 0.07 },
  death:  { type: "sawtooth", f0: 280, f1: 50,  d: 0.22, v: 0.12 },
  build:  { type: "triangle", f0: 320, f1: 540, d: 0.10, v: 0.10 },
  sell:   { type: "triangle", f0: 540, f1: 220, d: 0.10, v: 0.09 },
  mining: { type: "sawtooth", f0: 240, f1: 600, d: 0.05, v: 0.04 },
  built:  { type: "sine",     f0: 700, f1: 1100,d: 0.10, v: 0.08 },
  wave:   { type: "sawtooth", f0: 140, f1: 80,  d: 0.50, v: 0.12 },
  win:    { type: "sine",     f0: 600, f1: 900, d: 0.50, v: 0.18 },
  lose:   { type: "sawtooth", f0: 200, f1: 50,  d: 0.80, v: 0.18 },
};
const Sfx = {
  ctx: null,
  enabled: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) {}
  },
  resume() { if (this.ctx?.state === "suspended") this.ctx.resume(); },
  play(name) {
    if (!this.enabled || !this.ctx) return;
    const cfg = SOUNDS[name]; if (!cfg) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = cfg.type;
    o.frequency.setValueAtTime(cfg.f0, t);
    if (cfg.f1 && cfg.f1 !== cfg.f0) o.frequency.exponentialRampToValueAtTime(cfg.f1, t + cfg.d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(cfg.v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + cfg.d + 0.02);
  },
  setEnabled(on) { this.enabled = on; },
};

// ---------- utility ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = v => Math.round(v / 5) * 5;
const fmtTime = s => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

// ---------- camera ----------
class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.scale = 1;          // 0.2 .. 1.0
    this.targetScale = 1;
  }
  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.scale + W / 2, y: (wy - this.y) * this.scale + H / 2 };
  }
  screenToWorld(sx, sy) {
    return { x: (sx - W / 2) / this.scale + this.x, y: (sy - H / 2) / this.scale + this.y };
  }
}

// ---------- entities ----------
let nextId = 1;

class Entity {
  constructor(x, y, hp) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.hp = hp; this.maxHp = hp;
    this.dead = false;
    this.flash = 0;
  }
  damage(dmg) {
    this.hp -= dmg;
    this.flash = 0.12;
    if (this.hp <= 0) this.dead = true;
  }
  tickFlash(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
  }
}

// All buildings share the construction + network behavior.
class Building extends Entity {
  constructor(x, y, type, hp, value) {
    super(x, y, hp);
    this.kind = "building";
    this.type = type;                // "relay" | "miner" | "energy" | "laser" | "rocket"
    this.energyRange = ENERGY_RANGE;
    this.value = value;              // refund amount on sell
    this.construction = 0;
    this.constructionTarget = CONSTRUCTION_TARGET;
    this.constructionStep = 0;
    this.constructionTick = CONSTRUCTION_TICK;
    this.energy = 0;
    this.maxEnergy = 1;
    this.buildEnergy = 0;            // accumulator used during construction (matches source)
    this.linked = [];                // direct neighbors (within energyRange of each other)
    this.mines = [];                 // path-sorted producers reachable [{depth, path:[node...], mine}]
    this.relayEnergy = false;        // does this building forward energy?
    this.minDepth = 99;              // assigned by path()
    this.upgradeLevel = 1;
    this.size = 10;
    this.justFinished = false;
  }
  get networked() { return this.construction >= this.constructionTarget; }
  finishConstruction() {
    this.construction = this.constructionTarget;
    this.energy = this.maxEnergy;
    this.justFinished = true;
    Sfx.play("built");
  }
}

// buildingRelay: 100 HP, range 90, forwards energy, can't generate.
class Relay extends Building {
  constructor(x, y) {
    super(x, y, "relay", RELAY_HP, COSTS.relay);
    this.size = 8;
    this.relayEnergy = true;
  }
  // source buildingRelay.tick: every frame, request 1 energy, if got>=0.5 add 2 construction
  tick(game) {
    if (this.construction < this.constructionTarget) {
      const got = game.requestEnergy(this, 1);
      if (got >= 0.5) {
        this.construction = Math.min(this.constructionTarget, this.construction + 2);
        if (this.construction >= this.constructionTarget) this.finishConstruction();
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#0c2440" : "#0a1626";
    ctx.strokeStyle = this.networked ? "#6fd1ff" : "#385570";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// buildingEnergy: 600 HP, max 4 energy, generates 3*efficiency per 10 frames.
class EnergyGen extends Building {
  constructor(x, y) {
    super(x, y, "energy", ENERGY_HP, COSTS.energy);
    this.size = 18;
    this.maxEnergy = ENERGY_MAX;
    this.efficiency = ENERGY_EFFICIENCY;
    this.tickStep = 0;
    this.relayEnergy = true;
    this.totalEnergy = 0;
  }
  // source buildingEnergy.tick: every constructionTick frames, request 1 energy to build;
  // when fully built, generate 3*efficiency every ENERGY_TICK_STEP frames.
  tick(game) {
    if (this.construction < this.constructionTarget) {
      this.constructionStep += 1;
      if (this.constructionStep >= this.constructionTick) {
        this.constructionStep = 0;
        // L1 requires external energy; higher upgrades self-fuel (source pattern)
        const got = this.upgradeLevel === 1 ? game.requestEnergy(this, 1) : 1;
        this.buildEnergy += got;
        if (this.buildEnergy >= 1) {
          this.buildEnergy -= 1;
          this.construction += 1;
          if (this.construction >= this.constructionTarget) this.finishConstruction();
        }
      }
      return;
    }
    this.tickStep += 1;
    if (this.tickStep >= ENERGY_TICK_STEP) {
      this.tickStep = 0;
      const add = 3 * this.efficiency;
      if (this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + add);
        this.totalEnergy += add;
      }
    }
  }
  draw(ctx) {
    const r = this.size;
    ctx.fillStyle = this.networked ? "#1a2e0e" : "#0e1c08";
    ctx.strokeStyle = this.networked ? "#a8e060" : "#4a6a30";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // inner core grows with stored energy
    const t = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 0;
    ctx.fillStyle = `rgba(200, 240, 120, ${0.4 + 0.5 * t})`;
    ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.45 * (0.5 + 0.5 * t), 0, Math.PI * 2); ctx.fill();
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// buildingMiner: 300 HP, mineRange 35, pulse mining, requires 1 energy per pulse, drops 4 each.
class Miner extends Building {
  constructor(x, y) {
    super(x, y, "miner", MINER_HP, COSTS.miner);
    this.size = 12;
    this.maxEnergy = MINER_MAX_ENERGY;
    this.mineRange = MINE_RANGE;
    this.mineRate = MINE_RATE;
    this.mineTicker = MINE_RATE;     // starts full so first pulse fires immediately
    this.mineQuantity = MINER_QUANTITY;
    this.totalMined = 0;
    this.minedOK = true;             // false → low-energy indicator on
    this.planets = [];               // nearby asteroids
    this.laser = null;               // {tx, ty, alpha} of last pulse, for visual
  }
  refreshPlanets(game) {
    this.planets = game.asteroids.filter(a => !a.dead && dist(this, a) < this.mineRange);
  }
  // source buildingMiner.tick: per-frame accumulate buildEnergy until enough to build,
  // then per-frame attempt to refill its own energy and pulse-fire onto an asteroid.
  tick(game) {
    if (this.construction < this.constructionTarget) {
      // every frame request up to (maxEnergy - buildEnergy)
      const need = this.maxEnergy - this.buildEnergy;
      if (need > 0) this.buildEnergy += game.requestEnergy(this, need);
      if (this.buildEnergy >= 1) {
        this.buildEnergy -= 1;
        this.construction += 1;
        if (this.construction >= this.constructionTarget) this.finishConstruction();
      }
      return;
    }
    // refill energy from network
    if (this.energy < this.maxEnergy) {
      this.energy += game.requestEnergy(this, this.maxEnergy - this.energy);
      if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
    }
    // prune mined-out asteroids
    this.planets = this.planets.filter(p => !p.dead && p.energy > 0);
    if (this.planets.length === 0) {
      this.minedOK = false;
      return;
    }
    // increment pulse timer regardless of energy state
    this.mineTicker += MINE_TICK_STEP;
    if (this.mineTicker >= this.mineRate) {
      this.mineTicker = 0;
      if (this.energy >= this.maxEnergy) {
        // FIRE: drain energy, mine a random planet
        this.energy = 0;
        const target = this.planets[Math.floor(Math.random() * this.planets.length)];
        const take = Math.min(this.mineQuantity, target.energy);
        target.energy -= take;
        if (target.energy <= 0) target.dead = true;
        this.totalMined += take;
        game.totalMined += take;
        game.minerals += take;
        this.laser = { tx: target.x, ty: target.y, alpha: 1 };
        this.minedOK = true;
        Sfx.play("mining");
      } else {
        this.minedOK = false;
      }
    }
    if (this.laser) {
      this.laser.alpha -= 0.05;
      if (this.laser.alpha <= 0) this.laser = null;
    }
  }
  draw(ctx) {
    // laser beam first so it sits under the body
    if (this.laser) {
      ctx.strokeStyle = `rgba(120, 255, 100, ${this.laser.alpha})`;
      ctx.lineWidth = 1.5 * this.upgradeLevel;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.laser.tx, this.laser.ty); ctx.stroke();
    }
    ctx.fillStyle = this.networked ? "#3d2e10" : "#241a08";
    ctx.strokeStyle = this.networked ? "#f0c14b" : "#5a4520";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f0c14b";
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    // low-energy indicator: red ring while waiting for energy
    if (this.networked && !this.minedOK) {
      ctx.strokeStyle = "rgba(255, 80, 80, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size + 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// Mineral asteroid: stores ore as ._energy, dies when depleted.
class Asteroid extends Entity {
  constructor(x, y, energy) {
    super(x, y, energy);
    this.energy = energy;
    this.maxEnergy = energy;
    this.size = 7 + Math.min(10, energy / 40);
  }
  draw(ctx) {
    const t = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 0;
    ctx.fillStyle = `rgba(120, 200, 100, ${0.3 + 0.5 * t})`;
    ctx.strokeStyle = `rgba(180, 240, 150, ${0.5 + 0.5 * t})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(220, 255, 200, 0.9)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(Math.ceil(this.energy), this.x, this.y - this.size - 4);
  }
}

// ---------- HUD drawing helpers ----------
function drawConstructionBar(ctx, b) {
  const w = (b.size || 8) * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(b.x - w / 2, b.y + (b.size || 8) + 3, w, 3);
  const t = b.constructionTarget > 0 ? b.construction / b.constructionTarget : 0;
  ctx.fillStyle = "#6fd1ff";
  ctx.fillRect(b.x - w / 2, b.y + (b.size || 8) + 3, w * t, 3);
}
function drawHpBar(ctx, e, w) {
  if (e.hp >= e.maxHp) return;
  const ratio = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(e.x - w / 2, e.y + (e.size || 8) + 8, w, 3);
  ctx.fillStyle = ratio > 0.5 ? "#6bd96b" : ratio > 0.2 ? "#f0c14b" : "#ff7466";
  ctx.fillRect(e.x - w / 2, e.y + (e.size || 8) + 8, w * ratio, 3);
}

// ---------- game ----------
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = new Camera();
    this.stars = this.makeStars(180);
    this.dragging = null;       // {sx, sy, camX, camY}
    this.placement = null;       // building type to place
    this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0, in: false };

    this.reset();

    canvas.addEventListener("mousemove", e => this.onMouseMove(e));
    canvas.addEventListener("mouseleave", () => { this.mouse.in = false; });
    canvas.addEventListener("mousedown", e => this.onMouseDown(e));
    canvas.addEventListener("mouseup", e => this.onMouseUp(e));
    canvas.addEventListener("contextmenu", e => { e.preventDefault(); this.placement = null; this.refreshBuildUI(); });
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.onWheel(e); }, { passive: false });

    document.addEventListener("keydown", e => this.onKeyDown(e));

    for (const btn of document.querySelectorAll("#speeds button[data-speed]")) {
      btn.addEventListener("click", () => { this.speed = parseFloat(btn.dataset.speed); this.refreshSpeedUI(); });
    }
    document.getElementById("restart").addEventListener("click", () => this.reset());
    const mute = document.getElementById("mute");
    if (mute) mute.addEventListener("click", () => {
      Sfx.setEnabled(!Sfx.enabled);
      mute.textContent = Sfx.enabled ? "🔊" : "🔇";
    });
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      btn.addEventListener("click", () => {
        const t = btn.dataset.build;
        this.placement = (t === "cancel" || this.placement === t) ? null : t;
        this.refreshBuildUI();
      });
    }
    // ensure audio context starts on first interaction
    const ensureAudio = () => { Sfx.init(); Sfx.resume(); };
    canvas.addEventListener("pointerdown", ensureAudio, { once: true });

    this.last = performance.now();
    this.tickAcc = 0;
    requestAnimationFrame(t => this.loop(t));
  }

  makeStars(n) {
    const s = [];
    for (let i = 0; i < n; i++) s.push({ x: rand(-W, W), y: rand(-H, H), r: rand(0.4, 1.6), a: rand(0.3, 0.85) });
    return s;
  }

  reset() {
    nextId = 1;
    this.buildings = [];
    this.asteroids = this.spawnAsteroidField();
    this.minerals = 1000;            // mission 1 starts with 1000 in source
    this.totalMined = 0;
    this.goal = 1500;
    this.time = 0;
    this.tickCount = 0;
    this.speed = 1;
    this.over = null;
    this.pathDirty = true;
    this.camera.x = 0; this.camera.y = 0; this.camera.scale = 1; this.camera.targetScale = 1;
    // place starter energy generator at origin (matches the AS2 training setup)
    const eg = new EnergyGen(0, 0);
    eg.construction = eg.constructionTarget;
    eg.energy = eg.maxEnergy;
    this.buildings.push(eg);
    this.recomputeLinks();
    this.path();
    this.refreshBuildUI();
    this.refreshSpeedUI();
    this.refreshHud();
  }

  // Generate a small asteroid field (placeholder until level data is ported).
  spawnAsteroidField() {
    const out = [];
    const clusters = 6;
    for (let c = 0; c < clusters; c++) {
      const a = (c / clusters) * Math.PI * 2 + rand(0, 0.4);
      const r0 = rand(100, 220);
      const cx = Math.cos(a) * r0;
      const cy = Math.sin(a) * r0;
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const ax = rand(0, Math.PI * 2);
        const d = rand(0, 35);
        out.push(new Asteroid(snap(cx + Math.cos(ax) * d), snap(cy + Math.sin(ax) * d), Math.floor(rand(80, 180))));
      }
    }
    return out;
  }

  // ---- input ----
  onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (W / r.width);
    const sy = (e.clientY - r.top) * (H / r.height);
    this.mouse.sx = sx; this.mouse.sy = sy;
    const w = this.camera.screenToWorld(sx, sy);
    this.mouse.wx = w.x; this.mouse.wy = w.y;
    this.mouse.in = true;

    if (this.dragging) {
      const dxScreen = sx - this.dragging.sx;
      const dyScreen = sy - this.dragging.sy;
      this.camera.x = this.dragging.camX - dxScreen / this.camera.scale;
      this.camera.y = this.dragging.camY - dyScreen / this.camera.scale;
    }
  }
  onMouseDown(e) {
    // right or middle button = pan
    if (e.button === 2 || e.button === 1) {
      this.dragging = { sx: this.mouse.sx, sy: this.mouse.sy, camX: this.camera.x, camY: this.camera.y };
      return;
    }
    // left + placement mode = build attempt
    if (e.button === 0 && this.placement) {
      const w = this.mouse;
      this.tryBuild(snap(w.wx), snap(w.wy));
      if (!e.shiftKey) {
        // single-shot placement unless shift held (mirrors AS2 shift-build chain)
      }
    }
  }
  onMouseUp() { this.dragging = null; }
  onWheel(e) {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.camera.targetScale = clamp(this.camera.targetScale * factor, 0.2, 1.0);
  }
  onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (e.key === "Escape") { this.placement = null; this.refreshBuildUI(); return; }
    if (e.key === " ") { e.preventDefault(); this.speed = this.speed === 0 ? 1 : 0; this.refreshSpeedUI(); return; }
    // build shortcuts mirror the AS2 frame_1 listener: 1=relay 2=miner 3=energy 6=laser 7=rocket
    const buildMap = { "1": "relay", "2": "miner", "3": "energy", "6": "laser", "7": "rocket" };
    if (buildMap[k]) {
      this.placement = (this.placement === buildMap[k]) ? null : buildMap[k];
      this.refreshBuildUI();
      return;
    }
    if (k === "r") this.tryRemoveUnder();
    else if (k === "q") this.camera.targetScale = clamp(this.camera.targetScale + 0.15, 0.2, 1.0);
    else if (k === "e") this.camera.targetScale = clamp(this.camera.targetScale - 0.15, 0.2, 1.0);
    else if (k === "w" || e.key === "ArrowUp")    this.camera.y -= 200 / this.camera.scale;
    else if (k === "s" || e.key === "ArrowDown")  this.camera.y += 200 / this.camera.scale;
    else if (k === "a" || e.key === "ArrowLeft")  this.camera.x -= 300 / this.camera.scale;
    else if (k === "d" || e.key === "ArrowRight") this.camera.x += 300 / this.camera.scale;
    else if (k === "m") {
      Sfx.setEnabled(!Sfx.enabled);
      const mb = document.getElementById("mute");
      if (mb) mb.textContent = Sfx.enabled ? "🔊" : "🔇";
    }
  }

  // ---- building & network ----
  tryBuild(x, y) {
    const type = this.placement;
    const cost = COSTS[type];
    if (this.minerals < cost) return;
    // overlap check (matches tempLink: building too close to another that they'd be inside each other)
    for (const b of this.buildings) {
      if (b.dead) continue;
      const d = dist({ x, y }, b);
      if (d < (b.size + 6)) return;
    }
    // miner needs an asteroid in range
    if (type === "miner") {
      const hasOre = this.asteroids.some(a => !a.dead && dist({ x, y }, a) < MINE_RANGE);
      if (!hasOre) return;
    }
    // must have at least one networkable neighbor (existing building within ENERGY_RANGE)
    if (this.buildings.length > 0) {
      const reachable = this.buildings.some(b => !b.dead && dist({ x, y }, b) <= ENERGY_RANGE);
      if (!reachable) return;
    }
    let b;
    if (type === "relay")  b = new Relay(x, y);
    else if (type === "miner")  b = new Miner(x, y);
    else if (type === "energy") b = new EnergyGen(x, y);
    else return;
    this.minerals -= cost;
    this.buildings.push(b);
    if (b instanceof Miner) b.refreshPlanets(this);
    this.recomputeLinks();
    this.path();
    this.refreshHud();
    Sfx.play("build");
  }

  tryRemoveUnder() {
    if (!this.mouse.in) return;
    let hit = null;
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (dist({ x: this.mouse.wx, y: this.mouse.wy }, b) <= b.size + 3) { hit = b; break; }
    }
    if (!hit) return;
    if (this.buildings.length <= 1) return; // never sell the last building
    this.minerals += Math.round(hit.value * SELL_REFUND);
    hit.dead = true;
    this.buildings = this.buildings.filter(b => !b.dead);
    this.recomputeLinks();
    this.path();
    this.refreshHud();
    Sfx.play("sell");
  }

  recomputeLinks() {
    for (const a of this.buildings) a.linked = [];
    for (let i = 0; i < this.buildings.length; i++) {
      const a = this.buildings[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.buildings.length; j++) {
        const b = this.buildings[j];
        if (b.dead) continue;
        if (dist(a, b) <= a.energyRange) {
          a.linked.push(b);
          b.linked.push(a);
        }
      }
    }
  }

  // BFS from every constructed energy producer; assign each consumer a
  // sorted list of `mines` = {depth, path, mine} ordered shallowest-first.
  path() {
    for (const b of this.buildings) { b.mines = []; b.minDepth = 99; }
    const producers = this.buildings.filter(b => !b.dead && b.type === "energy" && b.construction >= b.constructionTarget);
    for (const source of producers) {
      const q = [{ node: source, depth: 0, path: [] }];
      const seen = new Set([source.id]);
      while (q.length) {
        const { node, depth, path } = q.shift();
        if (node !== source) {
          node.mines.push({ depth, path: path.slice(), mine: source });
        }
        // continue BFS through relayEnergy nodes (only fully-constructed ones)
        for (const nb of node.linked) {
          if (seen.has(nb.id)) continue;
          if (nb.dead) continue;
          // travel only through constructed relays / energies, not through bare consumers
          const canTraverse = nb.relayEnergy && nb.construction >= nb.constructionTarget;
          if (!canTraverse) {
            // it's a consumer leaf — assign its `mines` entry but don't recurse
            nb.mines.push({ depth: depth + 1, path: path.concat(node), mine: source });
            seen.add(nb.id);
            continue;
          }
          seen.add(nb.id);
          q.push({ node: nb, depth: depth + 1, path: path.concat(node) });
        }
      }
    }
    // sort each consumer's mines by depth ascending (shallow first)
    for (const b of this.buildings) b.mines.sort((a, c) => a.depth - c.depth);
  }

  // Walk consumer's `mines` (shallowest first) and drain energy from producers.
  requestEnergy(node, needs) {
    if (needs <= 0) return 0;
    let got = 0;
    for (const m of node.mines) {
      const src = m.mine;
      if (!src || src.dead || src.construction < src.constructionTarget) continue;
      const take = Math.min(src.energy, needs - got);
      if (take > 0) {
        src.energy -= take;
        got += take;
      }
      if (got >= needs) break;
    }
    return got;
  }

  // ---- loop ----
  loop(t) {
    const dt_real = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    // smooth zoom toward target
    if (Math.abs(this.camera.scale - this.camera.targetScale) > 0.001) {
      this.camera.scale += (this.camera.targetScale - this.camera.scale) * Math.min(1, dt_real * 12);
    }
    // tick the sim at fixed rate, multiplied by speed
    if (!this.over) {
      this.tickAcc += dt_real * this.speed * TPS;
      while (this.tickAcc >= 1) {
        this.tick();
        this.tickAcc -= 1;
      }
    }
    this.time += dt_real * this.speed;
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  }

  tick() {
    this.tickCount += 1;
    for (const b of this.buildings) {
      if (b.dead) continue;
      b.tick(this);
      b.tickFlash(1 / TPS);
    }
    // dirty path if any building just finished construction
    let wasDirty = false;
    for (const b of this.buildings) {
      if (b.justFinished) { wasDirty = true; b.justFinished = false; }
    }
    // cull dead buildings + recompute when topology changes
    const before = this.buildings.length;
    this.buildings = this.buildings.filter(b => !b.dead);
    if (this.buildings.length !== before || wasDirty) {
      this.recomputeLinks();
      this.path();
    }
    // asteroids
    this.asteroids = this.asteroids.filter(a => !a.dead);
    // refresh miner planet lists periodically (cheap)
    if (this.tickCount % 30 === 0) {
      for (const b of this.buildings) if (b instanceof Miner) b.refreshPlanets(this);
    }
    if (this.totalMined >= this.goal) { this.over = "win"; Sfx.play("win"); }
    this.refreshHud();
  }

  // ---- drawing ----
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    // starfield (parallax-ish: scales but doesn't pan)
    for (const s of this.stars) {
      const sx = ((s.x - this.camera.x * 0.15) * this.camera.scale + W / 2 + W * 2) % W;
      const sy = ((s.y - this.camera.y * 0.15) * this.camera.scale + H / 2 + H * 2) % H;
      ctx.fillStyle = `rgba(220, 230, 255, ${s.a})`;
      ctx.fillRect(sx, sy, s.r, s.r);
    }
    // apply world transform for everything else
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.translate(-this.camera.x, -this.camera.y);

    // network lines (only between linked buildings)
    ctx.lineWidth = 1;
    for (const a of this.buildings) {
      for (const b of a.linked) {
        if (a.id < b.id) {
          const aOK = a.construction >= a.constructionTarget;
          const bOK = b.construction >= b.constructionTarget;
          ctx.strokeStyle = (aOK && bOK) ? "rgba(111, 209, 255, 0.45)" : "rgba(80, 100, 150, 0.2)";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    // asteroids
    for (const a of this.asteroids) a.draw(ctx);
    // buildings
    for (const b of this.buildings) b.draw(ctx);

    // placement preview
    if (this.placement && this.mouse.in) this.drawPlacementPreview(ctx);

    ctx.restore();
  }

  drawPlacementPreview(ctx) {
    const x = snap(this.mouse.wx), y = snap(this.mouse.wy);
    const cost = COSTS[this.placement];
    const ok = this.minerals >= cost;
    // ghost building
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ok ? "rgba(111, 209, 255, 0.85)" : "rgba(255, 116, 102, 0.85)";
    ctx.fillStyle = "rgba(111, 209, 255, 0.1)";
    const sizeByType = { relay: 8, miner: 12, energy: 18, laser: 12, rocket: 14 };
    const r = sizeByType[this.placement] || 10;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // energy range
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(111, 209, 255, 0.3)";
    ctx.beginPath(); ctx.arc(x, y, ENERGY_RANGE, 0, Math.PI * 2); ctx.stroke();
    if (this.placement === "miner") {
      ctx.strokeStyle = "rgba(240, 193, 75, 0.4)";
      ctx.beginPath(); ctx.arc(x, y, MINE_RANGE, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ---- UI ----
  refreshHud() {
    const setText = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
    setText("minerals", Math.floor(this.minerals));
    setText("goal", `${Math.floor(this.totalMined)}/${this.goal}`);
    setText("clock", fmtTime(this.time));
    setText("rate", "—");  // rate is now per-miner; HUD value placeholder
    const networked = this.buildings.filter(b => b.networked && b.type !== "energy").length;
    const cap = this.buildings.filter(b => b.networked && b.type === "energy").reduce((s, b) => s + b.maxEnergy, 0);
    setText("energy", Math.floor(this.buildings.reduce((s, b) => s + (b.type === "energy" ? b.energy : 0), 0)));
    setText("energy-max", Math.floor(cap));
    setText("mission", "1");
    setText("total-minerals", Math.floor(this.asteroids.reduce((s, a) => s + a.energy, 0)));
    // affordability
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      const t = btn.dataset.build;
      if (t === "cancel" || t === "sell") continue;
      btn.classList.toggle("disabled", this.minerals < (COSTS[t] || Infinity));
    }
  }
  refreshBuildUI() {
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      btn.classList.toggle("active", btn.dataset.build === this.placement);
    }
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = this.placement
      ? `Placing ${this.placement} — click on the map. Right-click drag to pan, wheel to zoom.`
      : `Click a building or press 1/2/3/6/7. Right-click drag to pan, wheel zooms.`;
  }
  refreshSpeedUI() {
    for (const btn of document.querySelectorAll("#speeds button[data-speed]")) {
      btn.classList.toggle("active", parseFloat(btn.dataset.speed) === this.speed);
    }
  }
}

// boot
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  window.game = new Game(canvas);
});
