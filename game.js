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
const LASER_HP = 200;
const ROCKET_HP = 500;

// Laser turret (subType 0 / standard, from buildingLaser.as)
const LASER_DAMAGE = 30;
const LASER_RANGE = 90;
const LASER_FIRE_START = 5;
const LASER_FIRE_COOLDOWN = 20;
const LASER_ENERGY_NEEDED = 2;

// Rocket turret (from buildingRocket.as)
const ROCKET_DAMAGE = 450;
const ROCKET_SPLASH = 40;
const ROCKET_RANGE = 400;
const ROCKET_FIRE_GAP = 200;            // _fireStep set on attack lock
const ROCKET_MAX_ENERGY = 1;
const ROCKET_PER_SHOT_COST = 5;         // _root.charge(5) on each launch
const ROCKET_TRAVEL_SPEED = 6;          // px per tick

// Ship (enemy) baseline — values from ship1.as for fighter; others tune per-class
const SHIP_FIGHTER_HP = 100;
const SHIP_FIGHTER_DAMAGE = 8;

// Mission data, ported from `levels.as`. Source uses level 1-2 as tutorials
// and levels 3-5 as the full campaign. We ship 3-5 as missions 1-3.
const LEVELS = [
  { id: 1, name: "Easy Mode",   minerals: 1000, goal: 15000, asteroids: 50, fieldScale: 400, waveDelayMult: 75, hpBase: 10, countCap: 40,  damageDiv: 9 },
  { id: 2, name: "Normal Mode", minerals: 1200, goal: 30000, asteroids: 60, fieldScale: 500, waveDelayMult: 70, hpBase: 10, countCap: 100, damageDiv: 8 },
  { id: 3, name: "Hard Mode",   minerals: 2000, goal: 40000, asteroids: 80, fieldScale: 600, waveDelayMult: 70, hpBase: 10, countCap: 100, damageDiv: 8, countMul: 8, countOffset: 7 },
  { id: 4, name: "Madness!",    minerals: 2500, goal: 40000, asteroids: 85, fieldScale: 650, waveDelayMult: 45, hpBase: 10, countCap: 100, damageDiv: 6, countMul: 10, countOffset: 7, damageCap: 8 },
  // Survivor levels: goal=0 (no win), accelerating waves with shrinking gap
  { id: 5, name: "Survivor: Gentle",  minerals: 2000, goal: 0, asteroids: 60, fieldScale: 600, hpBase: 10, countCap: 100, damageDiv: 8, survivor: { startDelay: 80, gap: 70, minGap: 25 }, endless: true },
  { id: 6, name: "Survivor: Bring it",minerals: 2000, goal: 0, asteroids: 70, fieldScale: 650, hpBase: 10, countCap: 100, damageDiv: 8, survivor: { startDelay: 70, gap: 65, minGap: 20 }, endless: true },
  { id: 7, name: "Survivor: No Hope", minerals: 2000, goal: 0, asteroids: 80, fieldScale: 700, hpBase: 10, countCap: 100, damageDiv: 7, survivor: { startDelay: 60, gap: 60, minGap: 18 }, endless: true },
  // Speed Miner: small field, goal = total field energy, no enemies
  { id: 8, name: "Speed Miner", minerals: 2000, goal: 0, asteroids: 25, fieldScale: 200, peaceful: true, computeGoalFromField: true },
  // Sandbox: lots of minerals, no enemies, no goal
  { id: 9, name: "Sandbox",     minerals: 99999, goal: 0, asteroids: 80, fieldScale: 600, peaceful: true, endless: true },
];

// Map source ship_type integer (1-6) to my SHIP_STATS keys.
const SHIP_KIND_BY_SUBTYPE = ["fighter", "fighter", "missile", "exploder", "ring", "swarmer", "mother"];

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
  // Per-building upgrade — subclass overrides applyUpgrade().
  // Source pattern: upgrade increases _targetConstruction so the building
  // briefly returns to construction state before the new level kicks in.
  canUpgrade(game) {
    return this.upgradesRemaining > 0
      && this.construction >= this.constructionTarget
      && game.minerals >= this.upgradeCost;
  }
  doUpgrade(game) {
    if (!this.canUpgrade(game)) return false;
    game.minerals -= this.upgradeCost;
    this.value += this.upgradeCost / 2;
    this.upgradesRemaining -= 1;
    this.upgradeLevel += 1;
    this.applyUpgrade();
    this.constructionTarget += 5;     // mirror source: must re-build to new level
    return true;
  }
  applyUpgrade() { /* override */ }
}

// buildingRelay: 100 HP, range 90, forwards energy, can't generate.
class Relay extends Building {
  constructor(x, y) {
    super(x, y, "relay", RELAY_HP, COSTS.relay);
    this.size = 8;
    this.relayEnergy = true;
    this.upgradesRemaining = 0;       // source: relay can't be upgraded
    this.upgradeCost = 0;
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
    this.upgradesRemaining = 2;       // source: 2 upgrades, $200 each
    this.upgradeCost = 200;
  }
  applyUpgrade() {
    // matches buildingEnergy.upgrade(): +5 maxEnergy, +200 HP, eff 0.7→1.0
    this.maxEnergy += 5;
    this.hp += 200;
    this.maxHp += 200;
    this.efficiency = this.upgradeLevel === 2 ? 0.7 : 1.0;
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
    this.mineTicker = MINE_RATE;
    this.mineQuantity = MINER_QUANTITY;
    this.totalMined = 0;
    this.minedOK = true;
    this.planets = [];
    this.laser = null;
    this.upgradesRemaining = 1;        // source: 1 upgrade at $100
    this.upgradeCost = 100;
  }
  applyUpgrade() {
    // matches buildingMiner.upgrade(): mineQuantity 4→10, +200 HP
    this.mineQuantity = 10;
    this.hp += 200;
    this.maxHp += 200;
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
        // throttle mining sound: only play if it hasn't fired recently across the whole game
        if (!game.lastMiningSfx || game.tickCount - game.lastMiningSfx > 8) {
          Sfx.play("mining");
          game.lastMiningSfx = game.tickCount;
        }
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

// buildingLaser (subType 0 / standard turret).
// Ports `_fireStart`/`_fireCooldown` cooldown cycle + `_energyNeeded` buffer.
class LaserTurret extends Building {
  constructor(x, y) {
    super(x, y, "laser", LASER_HP, COSTS.laser);
    this.size = 14;
    this.fireRange = LASER_RANGE;
    this.fireStart = LASER_FIRE_START;
    this.fireCooldown = LASER_FIRE_COOLDOWN;
    this.fireStep = 0;
    this.energyNeeded = LASER_ENERGY_NEEDED;
    this.maxEnergy = this.energyNeeded;  // we keep a small energy buffer
    this.attackDamage = LASER_DAMAGE;
    this.attack = null;
    this.beam = null;
    this.tickStep = 1;
    this.constructionTick = 15;
    this.upgradesRemaining = 2;       // source: 2 standard upgrades
    this.upgradeCost = 150;           // L2 cost from source
  }
  applyUpgrade() {
    // matches buildingLaser.upgrade() L2: damage 30→42, +100 HP
    // L3: damage 42→55, +100 HP
    this.attackDamage += 12;
    this.hp += 100;
    this.maxHp += 100;
    this.upgradeCost = 300;
  }
  tick(game) {
    if (this.construction < this.constructionTarget) {
      this.constructionStep += 2;
      if (this.constructionStep >= this.constructionTick) {
        this.energy = game.requestEnergy(this, 1);
        this.constructionStep = 0;
        if (this.energy > 0) {
          this.construction += 1;
          if (this.construction >= this.constructionTarget) this.finishConstruction();
        }
      }
      return;
    }
    // standard pulse-laser pattern from source
    if (game.ships.length > 0) {
      if (this.fireStep === this.fireStart) {
        // acquire target
        let best = null, bestD = Infinity;
        for (const s of game.ships) {
          if (s.dead) continue;
          const d = dist(this, s);
          if (d <= this.fireRange && d < bestD) { best = s; bestD = d; }
        }
        this.attack = best;
        if (best) Sfx.play("shoot");
      } else if (this.fireStep < this.fireStart) {
        if (!this.attack || this.attack.dead || dist(this, this.attack) > this.fireRange) {
          this.attack = null;
          this.fireStep = this.fireCooldown;
        } else if (this.energy > 0) {
          // sustained beam: drain a fraction of energyNeeded per frame, deal damage
          const e = this.energyNeeded / 7 / this.fireStart;
          this.energy = Math.max(0, this.energy - e);
          this.attack.damage(this.attackDamage / this.fireStart);
          this.beam = { tx: this.attack.x, ty: this.attack.y, life: 2 };
        } else {
          this.fireStep = 0;
        }
        if (this.fireStep === 0) this.fireStep = this.fireCooldown;
      }
      this.fireStep -= 1;
      if (this.fireStep < 0) this.fireStep = this.fireCooldown;
    }
    // top off energy occasionally
    this.tickStep -= 1;
    if (this.tickStep <= 0) {
      this.tickStep = 1;
      if (this.energy < this.energyNeeded / 2) {
        this.energy += game.requestEnergy(this, this.energyNeeded / 2 - this.energy);
      }
    }
    if (this.beam) {
      this.beam.life -= 1;
      if (this.beam.life <= 0) this.beam = null;
    }
  }
  draw(ctx) {
    if (this.beam) {
      ctx.strokeStyle = "rgba(126, 255, 0, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.beam.tx, this.beam.ty); ctx.stroke();
    }
    ctx.fillStyle = this.networked ? "#0f2812" : "#0a1408";
    ctx.strokeStyle = this.networked ? "#7eff00" : "#3a6a18";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// buildingRocket
class RocketTurret extends Building {
  constructor(x, y) {
    super(x, y, "rocket", ROCKET_HP, COSTS.rocket);
    this.size = 14;
    this.fireRange = ROCKET_RANGE;
    this.attackDamage = ROCKET_DAMAGE;
    this.splash = ROCKET_SPLASH;
    this.rockets = 1;
    this.fireCount = 0;
    this.fireTick = 0;
    this.fireStep = 0;
    this.attack = null;
    this.maxEnergy = ROCKET_MAX_ENERGY;
    this.tickStep = 4;
    this.constructionTick = 15;
    this.upgradesRemaining = 2;
    this.upgradeCost = 500;
  }
  applyUpgrade() {
    // matches buildingRocket: +50 damage per level, +200 HP
    this.attackDamage += 50;
    this.hp += 200;
    this.maxHp += 200;
    if (this.upgradeLevel === 2) this.rockets = 2;
    if (this.upgradeLevel === 3) this.rockets = 3;
  }
  tick(game) {
    if (this.construction < this.constructionTarget) {
      this.constructionStep += 1;
      if (this.constructionStep >= this.constructionTick) {
        this.constructionStep = 0;
        this.buildEnergy += game.requestEnergy(this, 1);
        if (this.buildEnergy >= 1) {
          this.buildEnergy -= 1;
          this.construction += 1;
          if (this.construction >= this.constructionTarget) {
            this.finishConstruction();
            this.energy += 1;
          }
        }
      }
      return;
    }
    if (this.fireStep <= 0) {
      this.attack = null;
      let best = null, bestD = Infinity;
      for (const s of game.ships) {
        if (s.dead) continue;
        const d = dist(this, s);
        if (d <= this.fireRange && d < bestD) { best = s; bestD = d; }
      }
      if (best) {
        this.attack = best;
        this.fireCount = this.rockets;
        this.fireTick = 0;
        this.fireStep = ROCKET_FIRE_GAP;
      } else {
        this.fireStep = 20;
      }
    }
    if (this.fireCount > 0) {
      if (this.fireTick === 0) {
        if (this.energy >= 1) {
          // re-acquire if target died
          if (!this.attack || this.attack.dead) {
            let best = null, bestD = Infinity;
            for (const s of game.ships) {
              if (s.dead) continue;
              const d = dist(this, s);
              if (d <= this.fireRange && d < bestD) { best = s; bestD = d; }
            }
            this.attack = best;
          }
          if (this.attack && game.minerals >= ROCKET_PER_SHOT_COST) {
            this.energy -= 1;
            game.minerals -= ROCKET_PER_SHOT_COST;
            game.rockets.push(new Rocket(this.x, this.y, this.attack, this.attackDamage, this.splash));
            Sfx.play("shoot");
          }
        }
        this.fireTick = 15;
        this.fireCount -= 1;
      }
      this.fireTick -= 1;
    }
    this.fireStep -= 1;
    this.tickStep -= 1;
    if (this.tickStep <= 0) {
      this.tickStep = 4;
      if (this.energy < this.maxEnergy) {
        this.energy += game.requestEnergy(this, this.maxEnergy - this.energy);
        if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#2a1f0a" : "#150f04";
    ctx.strokeStyle = this.networked ? "#f0a060" : "#724820";
    ctx.lineWidth = 1.5;
    // body
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // launcher rails
    ctx.fillStyle = this.networked ? "#f0a060" : "#724820";
    ctx.fillRect(this.x - 5, this.y - this.size + 2, 3, this.size * 2 - 4);
    ctx.fillRect(this.x + 2, this.y - this.size + 2, 3, this.size * 2 - 4);
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

class Rocket {
  constructor(x, y, target, damage, splash) {
    this.x = x; this.y = y;
    this.target = target;
    this.damage = damage;
    this.splash = splash;
    this.dead = false;
  }
  update(game) {
    if (!this.target || this.target.dead) { this.dead = true; return; }
    const d = dist(this, this.target);
    if (d < 10) {
      this.target.damage(this.damage);
      // splash to nearby ships
      for (const s of game.ships) {
        if (s === this.target || s.dead) continue;
        const sd = dist(this, s);
        if (sd < this.splash) s.damage(this.damage * (1 - sd / this.splash));
      }
      this.dead = true;
      explode(game, this.x, this.y);
      return;
    }
    this.x += (this.target.x - this.x) / d * ROCKET_TRAVEL_SPEED;
    this.y += (this.target.y - this.y) / d * ROCKET_TRAVEL_SPEED;
  }
  draw(ctx) {
    ctx.fillStyle = "#ffd66f";
    ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fill();
    // exhaust trail
    ctx.strokeStyle = "rgba(255, 140, 60, 0.45)";
    ctx.lineWidth = 1;
    const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(a) * 8, this.y - Math.sin(a) * 8);
    ctx.stroke();
  }
}

// buildingStore — fills itself from the energy network and acts as a producer
// when other consumers request, so it's effectively a big energy buffer.
const STORE_HP = 500;
const STORE_MAX_ENERGY = 200;
class Store extends Building {
  constructor(x, y) {
    super(x, y, "store", STORE_HP, COSTS.store);
    this.size = 14;
    this.maxEnergy = STORE_MAX_ENERGY;
    this.relayEnergy = true;        // also forwards energy
    this.upgradesRemaining = 1;
    this.upgradeCost = 500;
    this.tickStep = 0;
    this.constructionTick = 10;
  }
  applyUpgrade() {
    this.maxEnergy *= 2;
    this.hp += 200;
    this.maxHp += 200;
  }
  tick(game) {
    if (this.construction < this.constructionTarget) {
      this.constructionStep += 1;
      if (this.constructionStep >= this.constructionTick) {
        this.constructionStep = 0;
        this.buildEnergy += game.requestEnergy(this, 1);
        if (this.buildEnergy >= 1) {
          this.buildEnergy -= 1;
          this.construction += 1;
          if (this.construction >= this.constructionTarget) this.finishConstruction();
        }
      }
      return;
    }
    // pull excess energy from the network until full
    this.tickStep -= 1;
    if (this.tickStep <= 0) {
      this.tickStep = 4;
      if (this.energy < this.maxEnergy) {
        this.energy += game.requestEnergy(this, this.maxEnergy - this.energy);
        if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#1b1d2c" : "#0e1018";
    ctx.strokeStyle = this.networked ? "#a0bcff" : "#3a4a72";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // fill level
    const t = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 0;
    ctx.fillStyle = `rgba(160, 188, 255, ${0.35 + 0.5 * t})`;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 0.55 * (0.4 + 0.6 * t), 0, Math.PI * 2); ctx.fill();
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// buildingRepair — heals damaged networked buildings within `repairRange`.
const REPAIR_HP = 400;
const REPAIR_RANGE = 200;
const REPAIR_TICK = 80;          // frames between heal pulses
const REPAIR_AMOUNT = 20;
class Repair extends Building {
  constructor(x, y) {
    super(x, y, "repair", REPAIR_HP, COSTS.repair);
    this.size = 12;
    this.maxEnergy = 5;
    this.repairRange = REPAIR_RANGE;
    this.upgradesRemaining = 1;
    this.upgradeCost = 150;
    this.tickStep = 0;
    this.healTimer = REPAIR_TICK;
    this.constructionTick = 15;
    this.lastHealed = null;       // for visual beam
    this.lastHealTimer = 0;
  }
  applyUpgrade() {
    this.repairRange += 50;
    this.hp += 200;
    this.maxHp += 200;
  }
  tick(game) {
    if (this.construction < this.constructionTarget) {
      this.constructionStep += 1;
      if (this.constructionStep >= this.constructionTick) {
        this.constructionStep = 0;
        this.buildEnergy += game.requestEnergy(this, 1);
        if (this.buildEnergy >= 1) {
          this.buildEnergy -= 1;
          this.construction += 1;
          if (this.construction >= this.constructionTarget) this.finishConstruction();
        }
      }
      return;
    }
    if (this.energy < this.maxEnergy) {
      this.energy += game.requestEnergy(this, this.maxEnergy - this.energy);
      if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
    }
    this.healTimer -= 1;
    if (this.healTimer <= 0 && this.energy >= 1) {
      // find most damaged neighbor inside range
      let best = null, bestRatio = 1;
      for (const b of game.buildings) {
        if (b.dead || b === this) continue;
        if (b.hp >= b.maxHp) continue;
        if (dist(this, b) > this.repairRange) continue;
        const r = b.hp / b.maxHp;
        if (r < bestRatio) { best = b; bestRatio = r; }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + REPAIR_AMOUNT);
        this.energy -= 1;
        this.lastHealed = best;
        this.lastHealTimer = 6;
      }
      this.healTimer = REPAIR_TICK;
    }
    if (this.lastHealTimer > 0) {
      this.lastHealTimer -= 1;
      if (this.lastHealTimer === 0) this.lastHealed = null;
    }
  }
  draw(ctx) {
    if (this.lastHealed && this.lastHealTimer > 0) {
      ctx.strokeStyle = `rgba(120, 255, 170, ${this.lastHealTimer / 6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.lastHealed.x, this.lastHealed.y); ctx.stroke();
    }
    ctx.fillStyle = this.networked ? "#0e2a18" : "#08140a";
    ctx.strokeStyle = this.networked ? "#78ffaa" : "#3a8260";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // cross mark
    ctx.strokeStyle = this.networked ? "#78ffaa" : "#3a8260";
    ctx.beginPath();
    ctx.moveTo(this.x - 4, this.y); ctx.lineTo(this.x + 4, this.y);
    ctx.moveTo(this.x, this.y - 4); ctx.lineTo(this.x, this.y + 4);
    ctx.stroke();
    if (this.construction < this.constructionTarget) drawConstructionBar(ctx, this);
  }
}

// Ship base (enemy). Each shipKind tunes stats and visual.
// Stats interpreted from ship1..ship6 in /tmp/v83_deob/scripts/__Packages/.
const SHIP_STATS = {
  fighter:  { hp: 100, speed: 1.1, damage: 8,   fireRange: 70,  fireGap: 50,  size: 8,  color: "#ff3030", fill: "#3a0a0a" },
  missile:  { hp:  80, speed: 0.9, damage: 6,   fireRange: 200, fireGap: 70,  size: 8,  color: "#66ff00", fill: "#1a3308" },
  exploder: { hp:  60, speed: 1.8, damage: 40,  fireRange: 0,   fireGap: 1,   size: 8,  color: "#ff6600", fill: "#33180a", suicide: true },
  ring:     { hp: 200, speed: 1.4, damage: 10,  fireRange: 60,  fireGap: 60,  size: 11, color: "#ffff00", fill: "#332e08" },
  swarmer:  { hp:  35, speed: 2.4, damage: 4,   fireRange: 70,  fireGap: 40,  size: 5,  color: "#cccccc", fill: "#222222" },
  mother:   { hp: 600, speed: 0.6, damage: 12,  fireRange: 200, fireGap: 90,  size: 22, color: "#ff00ff", fill: "#330033", spawnsSwarmers: true },
};
class Ship extends Entity {
  constructor(x, y, kind = "fighter", waveScale = 1) {
    const stats = SHIP_STATS[kind] || SHIP_STATS.fighter;
    super(x, y, stats.hp * waveScale);
    this.kind = "ship";
    this.shipKind = kind;
    this.stats = stats;
    this.size = stats.size;
    this.maxSpeed = stats.speed * (0.9 + Math.random() * 0.2);
    this.speed = this.maxSpeed;
    this.attackDamage = stats.damage * waveScale;
    this.fireRange = stats.fireRange;
    this.fireStep = stats.fireGap;
    this.fireGap = stats.fireGap;
    this.target = null;
    this.spawnedSwarmers = false;
    this.spawnCooldown = 300;     // motherships hold their swarm for ~10s after spawning
  }
  tick(game) {
    if (!this.target || this.target.dead) {
      // mother ship targets the deepest networked building; others target nearest
      let best = null, bestD = Infinity;
      for (const b of game.buildings) {
        if (b.dead) continue;
        const d = dist(this, b);
        if (d < bestD) { best = b; bestD = d; }
      }
      this.target = best;
    }
    if (!this.target) return;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (this.stats.suicide) {
      // exploder: closes distance and detonates AOE
      if (d > 12) {
        this.x += (dx / d) * this.speed;
        this.y += (dy / d) * this.speed;
      } else {
        // AOE damage to all nearby buildings
        for (const b of game.buildings) {
          if (b.dead) continue;
          const bd = dist(this, b);
          if (bd < 60) b.damage(this.attackDamage * (1 - bd / 60));
        }
        explode(game, this.x, this.y);
        this.dead = true;
        Sfx.play("death");
      }
      return;
    }
    if (this.stats.spawnsSwarmers) {
      this.spawnCooldown -= 1;
      if (this.spawnCooldown <= 0) {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          game.ships.push(new Ship(this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30, "swarmer"));
        }
        this.spawnCooldown = 300;     // every ~10 sim seconds
      }
    }
    if (d > this.fireRange) {
      this.x += (dx / d) * this.speed;
      this.y += (dy / d) * this.speed;
    } else {
      this.fireStep -= 1;
      if (this.fireStep <= 0) {
        this.target.damage(this.attackDamage);
        this.fireStep = this.fireGap;
        Sfx.play("hit");
      }
    }
  }
  draw(ctx) {
    const r = this.size;
    ctx.fillStyle = this.stats.fill;
    ctx.strokeStyle = this.stats.color;
    ctx.lineWidth = 1.5;
    if (this.shipKind === "ring") {
      // ring: outer circle with inner hollow
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    } else if (this.shipKind === "exploder") {
      // diamond + pulsing core
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - r);
      ctx.lineTo(this.x + r, this.y);
      ctx.lineTo(this.x, this.y + r);
      ctx.lineTo(this.x - r, this.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (this.shipKind === "mother") {
      // large hex
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const px = this.x + Math.cos(a) * r;
        const py = this.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // tendrils
      ctx.beginPath();
      ctx.moveTo(this.x - r * 1.4, this.y); ctx.lineTo(this.x + r * 1.4, this.y);
      ctx.moveTo(this.x, this.y - r * 1.4); ctx.lineTo(this.x, this.y + r * 1.4);
      ctx.stroke();
    } else {
      // default triangle (fighter, missile, swarmer)
      ctx.beginPath();
      ctx.moveTo(this.x + r, this.y);
      ctx.lineTo(this.x - r * 0.6, this.y - r * 0.7);
      ctx.lineTo(this.x - r * 0.6, this.y + r * 0.7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (this.hp < this.maxHp) drawHpBar(ctx, this, Math.max(14, r * 1.5));
  }
}

function explode(game, x, y) {
  // tiny particle pool — minimal effect for now
  for (let i = 0; i < 6; i++) {
    game.particles.push({ x, y, vx: rand(-60, 60), vy: rand(-60, 60), life: rand(0.3, 0.6), maxLife: 0.6 });
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
    document.getElementById("restart").addEventListener("click", () => this.reset(this.level ? this.level.id : 1));
    for (const btn of document.querySelectorAll("#missions button[data-level]")) {
      btn.addEventListener("click", () => this.reset(parseInt(btn.dataset.level, 10)));
    }
    document.getElementById("send-wave").addEventListener("click", () => this.skipToNextWave());
    const mute = document.getElementById("mute");
    if (mute) mute.addEventListener("click", () => {
      Sfx.setEnabled(!Sfx.enabled);
      mute.textContent = Sfx.enabled ? "🔊" : "🔇";
    });
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      btn.addEventListener("click", () => {
        const t = btn.dataset.build;
        this.placement = (t === "cancel" || this.placement === t) ? null : t;
        this.selected = null;
        this.refreshBuildUI();
        this.refreshSelectionPanel();
      });
    }
    document.getElementById("sel-upgrade").addEventListener("click", () => {
      if (this.selected && this.selected.doUpgrade(this)) {
        this.refreshSelectionPanel();
        this.refreshHud();
        Sfx.play("built");
      }
    });
    document.getElementById("sel-sell").addEventListener("click", () => {
      if (!this.selected) return;
      const b = this.selected;
      if (this.buildings.length <= 1) return;
      this.minerals += Math.round(b.value * SELL_REFUND);
      b.dead = true;
      this.buildings = this.buildings.filter(x => !x.dead);
      this.recomputeLinks(); this.path();
      this.selected = null;
      this.refreshHud();
      this.refreshSelectionPanel();
      Sfx.play("sell");
    });
    document.getElementById("sel-close").addEventListener("click", () => {
      this.selected = null;
      this.refreshSelectionPanel();
    });
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

  reset(levelId = 1) {
    this.level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
    nextId = 1;
    this.buildings = [];
    this.asteroids = this.genAsteroidField(this.level);
    this.ships = [];
    this.rockets = [];
    this.particles = [];
    this.energyFlashes = [];
    this.minerals = this.level.minerals;
    this.totalMined = 0;
    this.goal = this.level.computeGoalFromField
      ? this.asteroids.reduce((s, a) => s + a.energy, 0)
      : this.level.goal;
    this.time = 0;
    this.tickCount = 0;
    this.speed = 1;
    this.over = null;
    this.waveNumber = 0;
    this.waveList = this.buildWaveList(this.level);
    this.nextWaveTickIndex = 0;
    this.nextWaveAt = this.waveList[0] ? this.waveList[0].delay : 60;
    this.selected = null;
    // start zoomed out so the whole asteroid field fits, then let the user
    // zoom in. Source uses the same "start at 20%, animate to 100%" pattern;
    // I just stay at 0.4 since pan/zoom is available immediately.
    this.camera.x = 0; this.camera.y = 0;
    this.camera.scale = 0.4; this.camera.targetScale = 0.4;
    const eg = new EnergyGen(0, 0);
    eg.construction = eg.constructionTarget;
    eg.energy = eg.maxEnergy;
    this.buildings.push(eg);
    this.recomputeLinks();
    this.path();
    this.refreshBuildUI();
    this.refreshSpeedUI();
    this.refreshHud();
    this.refreshLevelLabel();
  }

  // Ported from asteroidField.genAsteroids(): a rotated ellipse where X is
  // squashed to 30% of Y, so the field forms a long band across the map.
  genAsteroidField(level) {
    const out = [];
    const fieldRot = Math.random() * Math.PI;
    for (let i = 0; i < level.asteroids; i++) {
      const a = Math.random() * Math.PI * 2;
      const ax = Math.cos(a) * (50 + Math.random() * level.fieldScale * 2.5) * 0.3;
      const ay = Math.sin(a) * (50 + Math.random() * level.fieldScale * 2.5);
      const cx = ax * Math.cos(fieldRot) - ay * Math.sin(fieldRot);
      const cy = ax * Math.sin(fieldRot) + ay * Math.cos(fieldRot);
      const size = 1 + Math.floor(Math.random() * 21);
      const energy = (5 + size) * 52;     // source formula
      out.push(new Asteroid(snap(cx), snap(cy), energy));
    }
    return out;
  }

  // Wave generator ports the Easy/Normal/Hard formulas from levels.as.
  // Each wave = { delay (ticks from sim start), kind, count, hp, damage, angle }.
  // Wave list ported from `levels.as`. Easy/Normal/Hard/Madness use a
  // round-based scheme where each round of 6 slots shares one absolute
  // delay. Survivor modes use cumulative timing with a shrinking gap.
  buildWaveList(level) {
    if (level.peaceful) return [];           // sandbox / speed miner
    const list = [];
    const isSurvivor = !!level.survivor;
    const survivor = level.survivor || {};
    let w = 1, slot = 1;
    let acc = survivor.startDelay || 0;
    let gap = survivor.gap || 0;
    const maxW = isSurvivor ? 120 : (level.id === 4 ? 100 : 50);
    while (w < maxW) {
      let count;
      if (level.countMul) count = (level.countOffset || 0) + w * level.countMul;
      else if (level.id === 2) count = w * 6;
      else count = w * 5;
      if (count > level.countCap) count = level.countCap;
      let damage = Math.floor(0.8 + w / level.damageDiv);
      if (level.damageCap && damage > level.damageCap) damage = level.damageCap;
      if (!level.damageCap) damage = Math.min(6, damage);
      let hp = w * level.hpBase;
      if (slot === 2) { count = count / 1.5; hp = hp * 2; }
      if (slot === 3) { count = count / 2;   hp = hp * 2; }
      if (slot === 4) { count = count / 2;   hp = hp / 2; }
      if (slot === 5) {
        if (level.id === 3 || level.id === 4) count /= 1.8;
        else if (level.id === 2) count /= 2;
        else count /= 3;
        hp = 20;
      }
      if (slot === 6) {
        if (level.id === 3 || level.id === 4) { count = 8; hp = 360; }
        else if (level.id === 2) { count = 5; hp = 180; }
        else { count = 3; hp = 90; }
      }
      const delay = isSurvivor ? acc : (w * (level.waveDelayMult || 70) + 10);
      list.push({
        delay,
        kind: SHIP_KIND_BY_SUBTYPE[slot] || "fighter",
        count: Math.max(1, Math.floor(count)),
        hp,
        damage,
        angle: Math.random() * Math.PI * 2,
      });
      if (isSurvivor) {
        acc += gap;
        if (gap > (survivor.minGap || 20)) gap -= 1;
      }
      slot += 1;
      if (slot > 6) { slot = 1; w += 1; }
    }
    return list;
  }

  // Bring the next wave forward. No-op if no more waves or game over.
  skipToNextWave() {
    if (this.over) return;
    const next = this.waveList[this.nextWaveTickIndex];
    if (!next) return;
    // shift all remaining waves so the next one fires in 0.5s
    const offset = next.delay - (this.time + 0.5);
    if (offset <= 0) return;
    for (let i = this.nextWaveTickIndex; i < this.waveList.length; i++) {
      this.waveList[i].delay -= offset;
    }
  }

  // Pop the next wave-list entry, spawn its ships at the level's spawn radius.
  spawnWave() {
    if (this.nextWaveTickIndex >= this.waveList.length) return;
    const entry = this.waveList[this.nextWaveTickIndex];
    this.waveNumber += 1;
    const spawnR = this.level.fieldScale + 200;
    for (let i = 0; i < entry.count; i++) {
      const a = entry.angle + (i - entry.count / 2) * 0.06;
      const sx = Math.cos(a) * spawnR;
      const sy = Math.sin(a) * spawnR;
      const s = new Ship(sx, sy, entry.kind);
      // override HP and damage from the wave entry (source formula values)
      s.maxHp = entry.hp;
      s.hp = entry.hp;
      s.attackDamage = entry.damage;
      this.ships.push(s);
    }
    this.nextWaveTickIndex += 1;
    this.nextWaveAt = this.waveList[this.nextWaveTickIndex]
      ? this.waveList[this.nextWaveTickIndex].delay
      : Infinity;
    Sfx.play("wave");
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
    if (e.button !== 0) return;
    // click on minimap → jump camera to that world position
    const mw = 180, mh = 120;
    const mxOrig = W - mw - 10, myOrig = H - mh - 10;
    if (this.mouse.sx >= mxOrig && this.mouse.sx <= mxOrig + mw
      && this.mouse.sy >= myOrig && this.mouse.sy <= myOrig + mh) {
      const fieldScale = this.level?.fieldScale || 600;
      const worldHalfWidth = fieldScale * 1.1;
      const worldHalfHeight = fieldScale * 2.5 * 1.1;
      const scale = Math.min(mw / (worldHalfWidth * 2), mh / (worldHalfHeight * 2));
      this.camera.x = (this.mouse.sx - (mxOrig + mw / 2)) / scale;
      this.camera.y = (this.mouse.sy - (myOrig + mh / 2)) / scale;
      return;
    }
    // placement mode = build attempt
    if (this.placement) {
      const w = this.mouse;
      this.tryBuild(snap(w.wx), snap(w.wy));
      return;
    }
    // otherwise: select the building under the cursor (or clear)
    let hit = null;
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (dist({ x: this.mouse.wx, y: this.mouse.wy }, b) <= b.size + 3) { hit = b; break; }
    }
    this.selected = hit;
    this.refreshSelectionPanel();
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
    const buildMap = { "1": "relay", "2": "miner", "3": "energy", "4": "store", "5": "repair", "6": "laser", "7": "rocket" };
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
    else if (k === "v") this.skipToNextWave();
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
    else if (type === "laser")  b = new LaserTurret(x, y);
    else if (type === "rocket") b = new RocketTurret(x, y);
    else if (type === "store")  b = new Store(x, y);
    else if (type === "repair") b = new Repair(x, y);
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

  // BFS from every constructed energy producer (energy gens AND filled stores);
  // assign each consumer a sorted list of `mines` ordered shallowest-first.
  path() {
    for (const b of this.buildings) { b.mines = []; b.minDepth = 99; }
    // Energy gens AND stores serve as producers; stores fall back to producing
    // from their buffer (requestEnergy checks `src.energy > 0` per drain).
    const producers = this.buildings.filter(b => !b.dead
      && (b.type === "energy" || b.type === "store")
      && b.construction >= b.constructionTarget);
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
  // Records the path taken so the next draw() can briefly render it (source
  // does this via `mcRelayLines.createEmptyMovieClip` in requestEnergy).
  requestEnergy(node, needs) {
    if (needs <= 0) return 0;
    let got = 0;
    let drawnFor = null;
    for (const m of node.mines) {
      const src = m.mine;
      if (!src || src.dead || src.construction < src.constructionTarget) continue;
      if (src.energy <= 0) continue;
      const take = Math.min(src.energy, needs - got);
      if (take > 0) {
        src.energy -= take;
        got += take;
        if (!drawnFor) drawnFor = m;     // remember the path used
      }
      if (got >= needs) break;
    }
    if (drawnFor && this.energyFlashes) {
      this.energyFlashes.push({
        from: node, path: drawnFor.path, source: drawnFor.mine, life: 4,
      });
    }
    return got;
  }

  // ---- loop ----
  loop(t) {
    const dt_real = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (Math.abs(this.camera.scale - this.camera.targetScale) > 0.001) {
      this.camera.scale += (this.camera.targetScale - this.camera.scale) * Math.min(1, dt_real * 12);
    }
    if (!this.over) {
      this.tickAcc += dt_real * this.speed * TPS;
      while (this.tickAcc >= 1) {
        this.tick();
        this.tickAcc -= 1;
      }
    }
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  }

  tick() {
    this.tickCount += 1;
    this.time += 1 / TPS;
    for (const b of this.buildings) {
      if (b.dead) continue;
      b.tick(this);
      b.tickFlash(1 / TPS);
    }
    // ships
    for (const s of this.ships) { if (!s.dead) s.tick(this); }
    // rockets
    for (const r of this.rockets) r.update(this);
    this.rockets = this.rockets.filter(r => !r.dead);
    // particles
    for (const p of this.particles) {
      p.x += p.vx / TPS; p.y += p.vy / TPS;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= 1 / TPS;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    // energy-flow flashes
    for (const f of this.energyFlashes) f.life -= 1;
    this.energyFlashes = this.energyFlashes.filter(f => f.life > 0);
    // wave timer — fire every entry whose delay has elapsed (mirrors how
    // the source rapidly dispatches the 6 same-delay slots in a round)
    while (!this.over
      && this.nextWaveTickIndex < this.waveList.length
      && this.time >= this.waveList[this.nextWaveTickIndex].delay) {
      this.spawnWave();
    }
    // dirty path if any building just finished construction
    let wasDirty = false;
    for (const b of this.buildings) {
      if (b.justFinished) { wasDirty = true; b.justFinished = false; }
    }
    // cull dead ships + buildings
    for (const s of this.ships) if (s.dead) explode(this, s.x, s.y);
    this.ships = this.ships.filter(s => !s.dead);
    const before = this.buildings.length;
    for (const b of this.buildings) {
      if (b.dead) { explode(this, b.x, b.y); explode(this, b.x, b.y); }
    }
    this.buildings = this.buildings.filter(b => !b.dead);
    if (this.buildings.length !== before || wasDirty) {
      this.recomputeLinks();
      this.path();
    }
    this.asteroids = this.asteroids.filter(a => !a.dead);
    if (this.tickCount % 30 === 0) {
      for (const b of this.buildings) if (b instanceof Miner) b.refreshPlanets(this);
    }
    // win / lose
    if (this.goal > 0 && this.totalMined >= this.goal) { this.over = "win"; Sfx.play("win"); }
    if (this.buildings.length === 0) { this.over = "lose"; Sfx.play("lose"); }
    // if the selected building died, clear selection
    if (this.selected && this.selected.dead) this.selected = null;
    this.refreshHud();
    if (this.selected) this.refreshSelectionPanel();
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
    // ships
    for (const s of this.ships) if (!s.dead) s.draw(ctx);
    // rockets
    for (const r of this.rockets) r.draw(ctx);
    // particles
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ff8844";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // energy-flow flashes: source renders these briefly when a consumer pulls
    for (const f of this.energyFlashes) {
      ctx.globalAlpha = clamp(f.life / 4, 0, 1);
      ctx.strokeStyle = "#4dd6ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.from.x, f.from.y);
      for (const n of f.path) ctx.lineTo(n.x + rand(-2, 2), n.y + rand(-2, 2));
      ctx.lineTo(f.source.x, f.source.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // placement preview
    if (this.placement && this.mouse.in) this.drawPlacementPreview(ctx);

    // selection indicator
    if (this.selected && !this.selected.dead) {
      const b = this.selected;
      ctx.strokeStyle = "rgba(111, 209, 255, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size + 6, 0, Math.PI * 2); ctx.stroke();
      // fire/energy ranges where relevant
      ctx.strokeStyle = "rgba(111, 209, 255, 0.2)";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.energyRange, 0, Math.PI * 2); ctx.stroke();
      if (b.type === "laser" || b.type === "rocket") {
        ctx.strokeStyle = "rgba(255, 116, 102, 0.3)";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.fireRange, 0, Math.PI * 2); ctx.stroke();
      }
      if (b.type === "miner") {
        ctx.strokeStyle = "rgba(240, 193, 75, 0.3)";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.mineRange, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();

    // wave countdown text overlay (in screen space)
    const next = this.waveList?.[this.nextWaveTickIndex];
    if (!this.over && next) {
      const t = Math.max(0, next.delay - this.time);
      const imminent = t < 5;
      ctx.fillStyle = imminent ? "rgba(255, 116, 102, 0.95)" : "rgba(255, 220, 120, 0.75)";
      ctx.font = imminent ? "bold 14px monospace" : "13px monospace";
      ctx.textAlign = "center";
      const tag = imminent ? "INCOMING" : "Next";
      ctx.fillText(`${tag}: ${next.count}× ${next.kind} in ${t.toFixed(1)}s — V to send`, W / 2, 22);
    }
    if (this.over) {
      ctx.fillStyle = this.over === "win" ? "rgba(107, 217, 107, 0.95)" : "rgba(255, 116, 102, 0.95)";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.over === "win" ? "MISSION COMPLETE" : "BASE DESTROYED", W / 2, H / 2);
    }

    this.drawMinimap(ctx);
  }

  // Minimap in the bottom-right showing the asteroid field, buildings, and
  // ships at a fixed world scale. Mirrors the source's `mcMinimap`.
  drawMinimap(ctx) {
    const mw = 180, mh = 120;
    const mx = W - mw - 10, my = H - mh - 10;
    // Choose a scale that fits the asteroid field plus some margin
    const fieldScale = this.level?.fieldScale || 600;
    const worldHalfWidth = fieldScale * 1.1;
    const worldHalfHeight = fieldScale * 2.5 * 1.1;
    const scale = Math.min(mw / (worldHalfWidth * 2), mh / (worldHalfHeight * 2));
    // background
    ctx.fillStyle = "rgba(2, 3, 10, 0.85)";
    ctx.strokeStyle = "rgba(111, 209, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);
    const toMini = (x, y) => ({ x: mx + mw / 2 + x * scale, y: my + mh / 2 + y * scale });
    // asteroids
    for (const a of this.asteroids) {
      const p = toMini(a.x, a.y);
      ctx.fillStyle = "rgba(140, 220, 110, 0.85)";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    // buildings
    for (const b of this.buildings) {
      const p = toMini(b.x, b.y);
      const color = b.type === "energy" ? "#a8e060"
        : b.type === "miner" ? "#f0c14b"
        : b.type === "laser" ? "#7eff00"
        : b.type === "rocket" ? "#f0a060"
        : b.type === "store" ? "#a0bcff"
        : b.type === "repair" ? "#78ffaa"
        : "#6fd1ff";
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    // ships
    for (const s of this.ships) {
      const p = toMini(s.x, s.y);
      ctx.fillStyle = "#ff4040";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    // viewport rect
    const half = { x: (W / 2) / this.camera.scale, y: (H / 2) / this.camera.scale };
    const vp1 = toMini(this.camera.x - half.x, this.camera.y - half.y);
    const vp2 = toMini(this.camera.x + half.x, this.camera.y + half.y);
    ctx.strokeStyle = "rgba(111, 209, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y);
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
    } else if (this.placement === "laser") {
      ctx.strokeStyle = "rgba(126, 255, 0, 0.4)";
      ctx.beginPath(); ctx.arc(x, y, LASER_RANGE, 0, Math.PI * 2); ctx.stroke();
    } else if (this.placement === "rocket") {
      ctx.strokeStyle = "rgba(240, 160, 96, 0.4)";
      ctx.beginPath(); ctx.arc(x, y, ROCKET_RANGE, 0, Math.PI * 2); ctx.stroke();
    } else if (this.placement === "repair") {
      ctx.strokeStyle = "rgba(120, 255, 170, 0.4)";
      ctx.beginPath(); ctx.arc(x, y, REPAIR_RANGE, 0, Math.PI * 2); ctx.stroke();
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
  refreshLevelLabel() {
    const ml = document.getElementById("mission-label");
    if (ml && this.level) ml.textContent = this.level.name;
    const me = document.getElementById("mission");
    if (me && this.level) me.textContent = this.level.id;
  }
  refreshSelectionPanel() {
    const panel = document.getElementById("selection");
    if (!panel) return;
    const b = this.selected;
    if (!b || b.dead) { panel.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    const name = b.type === "energy" ? "Energy Generator"
      : b.type === "miner" ? "Miner"
      : b.type === "relay" ? "Relay"
      : b.type === "laser" ? "Laser Turret"
      : b.type === "rocket" ? "Rocket Turret"
      : b.type === "store" ? "Store"
      : b.type === "repair" ? "Repair Bay"
      : b.type;
    const stats = [];
    stats.push(`HP ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}`);
    stats.push(`Level ${b.upgradeLevel}`);
    if (b.type === "miner") stats.push(`Mines ${b.mineQuantity} per pulse`);
    if (b.type === "energy") stats.push(`Output ${(3 * b.efficiency).toFixed(2)}/tick · cap ${b.maxEnergy}`);
    if (b.type === "laser") stats.push(`Dmg ${b.attackDamage.toFixed(0)} · range ${b.fireRange}`);
    if (b.type === "rocket") stats.push(`Dmg ${b.attackDamage.toFixed(0)} · ×${b.rockets} per burst`);
    if (b.type === "store") stats.push(`Buffer ${b.energy.toFixed(0)}/${b.maxEnergy}`);
    if (b.type === "repair") stats.push(`Range ${b.repairRange} · +${REPAIR_AMOUNT} HP per pulse`);
    panel.querySelector("#sel-name").textContent = name;
    panel.querySelector("#sel-stats").textContent = stats.join(" · ");
    const btn = panel.querySelector("#sel-upgrade");
    const sellBtn = panel.querySelector("#sel-sell");
    if (b.upgradesRemaining > 0) {
      btn.style.display = "";
      btn.disabled = !b.canUpgrade(this);
      btn.textContent = `Upgrade for ${b.upgradeCost} min.`;
    } else {
      btn.style.display = "none";
    }
    sellBtn.textContent = `Sell (refund ${Math.round(b.value * SELL_REFUND)})`;
  }
}

// boot
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  window.game = new Game(canvas);
});
