// The Space Game (JS port) — vanilla canvas, no deps.
// Top-down RTS: build a network from your base to mineral fields, mine, defend.

const W = 1024;
const H = 640;

const COSTS = { connector: 15, miner: 40, turret: 60 };
const CONNECT_RANGE = 170;     // building-to-building network range
const MINE_RANGE = 110;        // miner-to-mineral pickup range
const TURRET_RANGE = 180;
const TURRET_DAMAGE = 12;
const TURRET_FIRE_INTERVAL = 0.55; // seconds
const MINER_RATE = 8;          // minerals/sec from one miner on a node
const BASE_HP = 200;
const TURRET_HP = 60;
const MINER_HP = 35;
const CONNECTOR_HP = 25;
const STARTING_MINERALS = 60;
const GOAL = 1500;

// ---------- utility ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fmtTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

// ---------- entity types ----------
let nextId = 1;

class Entity {
  constructor(x, y, hp) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.dead = false;
  }
  damage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) this.dead = true;
  }
}

class Base extends Entity {
  constructor(x, y) { super(x, y, BASE_HP); this.radius = 22; this.kind = "base"; this.networked = true; }
  draw(ctx) {
    drawGlow(ctx, this.x, this.y, this.radius + 8, "#6fd1ff", 0.25);
    ctx.fillStyle = "#0a1a30";
    ctx.strokeStyle = "#6fd1ff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6fd1ff";
    ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
    drawHpBar(ctx, this, 30);
  }
}

class Connector extends Entity {
  constructor(x, y) { super(x, y, CONNECTOR_HP); this.radius = 8; this.kind = "connector"; this.networked = false; }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#3a6b9d" : "#2a3550";
    ctx.strokeStyle = this.networked ? "#6fd1ff" : "#4a5878";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

class Miner extends Entity {
  constructor(x, y) {
    super(x, y, MINER_HP);
    this.radius = 10;
    this.kind = "miner";
    this.networked = false;
    this.target = null; // mineral
    this.cooldown = 0;
  }
  update(dt, game) {
    if (!this.networked) return;
    if (!this.target || this.target.dead || dist(this, this.target) > MINE_RANGE) {
      this.target = null;
      let best = Infinity;
      for (const m of game.minerals) {
        if (m.dead) continue;
        const d = dist(this, m);
        if (d < MINE_RANGE && d < best) { best = d; this.target = m; }
      }
    }
    if (this.target) {
      const amt = MINER_RATE * dt;
      const taken = this.target.extract(amt);
      game.minerals_collected += taken;
      game.recent_mined += taken;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#3d2e10" : "#241a08";
    ctx.strokeStyle = this.networked ? "#f0c14b" : "#5a4520";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // drill bit
    ctx.fillStyle = "#f0c14b";
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    // extraction beam
    if (this.networked && this.target) {
      ctx.strokeStyle = "rgba(240, 193, 75, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.target.x, this.target.y); ctx.stroke();
    }
  }
}

class Turret extends Entity {
  constructor(x, y) {
    super(x, y, TURRET_HP);
    this.radius = 11;
    this.kind = "turret";
    this.networked = false;
    this.cooldown = 0;
    this.aimAngle = 0;
  }
  update(dt, game) {
    if (!this.networked) return;
    this.cooldown -= dt;
    // find nearest enemy in range
    let target = null, best = Infinity;
    for (const e of game.enemies) {
      const d = dist(this, e);
      if (d < TURRET_RANGE && d < best) { target = e; best = d; }
    }
    if (target) {
      this.aimAngle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.cooldown <= 0) {
        game.bullets.push(new Bullet(this.x, this.y, target));
        this.cooldown = TURRET_FIRE_INTERVAL;
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.networked ? "#2c1313" : "#1a0a0a";
    ctx.strokeStyle = this.networked ? "#ff7466" : "#683838";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // barrel
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = this.networked ? "#ff7466" : "#683838";
    ctx.fillRect(0, -2, 13, 4);
    ctx.restore();
  }
}

class Mineral extends Entity {
  constructor(x, y, amount) {
    super(x, y, amount); // hp doubles as remaining mineral amount
    this.amount = amount;
    this.radius = 7 + Math.min(10, amount / 40);
    this.kind = "mineral";
  }
  extract(amt) {
    const taken = Math.min(amt, this.amount);
    this.amount -= taken;
    this.hp = this.amount;
    if (this.amount <= 0) this.dead = true;
    return taken;
  }
  draw(ctx) {
    const t = this.amount / this.maxHp;
    ctx.fillStyle = `rgba(120, 200, 100, ${0.3 + 0.5 * t})`;
    ctx.strokeStyle = `rgba(180, 240, 150, ${0.5 + 0.5 * t})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(220, 255, 200, 0.9)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(Math.ceil(this.amount), this.x, this.y - this.radius - 4);
  }
}

class Enemy extends Entity {
  constructor(x, y, hp, speed, damage, value) {
    super(x, y, hp);
    this.radius = 7;
    this.kind = "enemy";
    this.speed = speed;
    this.damage = damage;
    this.value = value;
    this.attackCd = 0;
    this.target = null;
  }
  update(dt, game) {
    // pick a target: nearest networked building, else base
    if (!this.target || this.target.dead) {
      let best = Infinity, t = game.base;
      for (const b of game.buildings) {
        if (b.dead) continue;
        const d = dist(this, b);
        if (d < best) { best = d; t = b; }
      }
      this.target = t;
    }
    const t = this.target;
    const d = dist(this, t);
    const desired = (t.radius || 0) + this.radius + 1;
    if (d > desired) {
      const vx = (t.x - this.x) / d * this.speed * dt;
      const vy = (t.y - this.y) / d * this.speed * dt;
      this.x += vx;
      this.y += vy;
    } else {
      this.attackCd -= dt;
      if (this.attackCd <= 0) {
        t.damage(this.damage);
        this.attackCd = 0.6;
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = "#7a1818";
    ctx.strokeStyle = "#ff5d4d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.x + this.radius, this.y);
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawHpBar(ctx, this, 11);
  }
}

class Bullet {
  constructor(x, y, target) {
    this.x = x; this.y = y;
    this.target = target;
    this.speed = 520;
    this.dead = false;
  }
  update(dt) {
    if (this.target.dead) { this.dead = true; return; }
    const d = dist(this, this.target);
    if (d < 6) {
      this.target.damage(TURRET_DAMAGE);
      this.dead = true;
      return;
    }
    this.x += (this.target.x - this.x) / d * this.speed * dt;
    this.y += (this.target.y - this.y) / d * this.speed * dt;
  }
  draw(ctx) {
    ctx.fillStyle = "#ffd66f";
    ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- drawing helpers ----------
function drawGlow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(111, 209, 255, ${alpha})`);
  g.addColorStop(1, "rgba(111, 209, 255, 0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function drawHpBar(ctx, e, w) {
  if (e.hp >= e.maxHp) return;
  const ratio = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(e.x - w / 2, e.y + e.radius + 4, w, 3);
  ctx.fillStyle = ratio > 0.5 ? "#6bd96b" : ratio > 0.2 ? "#f0c14b" : "#ff7466";
  ctx.fillRect(e.x - w / 2, e.y + e.radius + 4, w * ratio, 3);
}

// ---------- starfield (cosmetic) ----------
function makeStars(n) {
  const s = [];
  for (let i = 0; i < n; i++) s.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.2, a: Math.random() * 0.5 + 0.3 });
  return s;
}

// ---------- game ----------
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.stars = makeStars(180);

    this.reset();

    // input
    this.placement = null;     // currently-selected build kind
    this.mouse = { x: 0, y: 0, in: false };

    canvas.addEventListener("mousemove", e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (W / r.width);
      this.mouse.y = (e.clientY - r.top) * (H / r.height);
      this.mouse.in = true;
    });
    canvas.addEventListener("mouseleave", () => { this.mouse.in = false; });
    canvas.addEventListener("click", e => this.onClick(e));
    canvas.addEventListener("contextmenu", e => { e.preventDefault(); this.placement = null; this.refreshBuildUI(); });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { this.placement = null; this.refreshBuildUI(); }
      if (e.key === " ") { this.speed = this.speed === 0 ? 1 : 0; this.refreshSpeedUI(); }
    });

    for (const btn of document.querySelectorAll("#speeds button[data-speed]")) {
      btn.addEventListener("click", () => {
        this.speed = parseFloat(btn.dataset.speed);
        this.refreshSpeedUI();
      });
    }
    document.getElementById("restart").addEventListener("click", () => this.reset());

    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.build;
        this.placement = (kind === "cancel" || this.placement === kind) ? null : kind;
        this.refreshBuildUI();
      });
    }

    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  reset() {
    nextId = 1;
    this.base = new Base(W / 2, H / 2);
    this.buildings = [this.base];          // base + connectors + miners + turrets
    this.minerals = this.spawnMinerals();
    this.enemies = [];
    this.bullets = [];
    this.minerals_stored = STARTING_MINERALS;
    this.minerals_collected = 0;
    this.recent_mined = 0;
    this.rate_window = [];                  // [t, amount] last few seconds
    this.time = 0;
    this.speed = 1;
    this.next_wave = 22;                    // first wave at ~22s in
    this.wave_number = 0;
    this.over = null;                       // "win" | "lose" | null
    this.refreshBuildUI();
    this.refreshSpeedUI();
    this.hideBanner();
  }

  spawnMinerals() {
    const out = [];
    const clusters = 6 + Math.floor(Math.random() * 3);
    for (let c = 0; c < clusters; c++) {
      // angle around base, varying distance
      const angle = (c / clusters) * Math.PI * 2 + Math.random() * 0.6;
      const dist0 = rand(160, 320);
      const cx = W / 2 + Math.cos(angle) * dist0;
      const cy = H / 2 + Math.sin(angle) * dist0;
      const nodes = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < nodes; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 45;
        const x = clamp(cx + Math.cos(a) * d, 30, W - 30);
        const y = clamp(cy + Math.sin(a) * d, 30, H - 30);
        out.push(new Mineral(x, y, Math.floor(rand(70, 180))));
      }
    }
    return out;
  }

  onClick(e) {
    if (this.over) return;
    if (!this.placement) return;
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const y = (e.clientY - r.top) * (H / r.height);
    this.tryBuild(x, y);
  }

  tryBuild(x, y) {
    const kind = this.placement;
    const cost = COSTS[kind];
    if (this.minerals_stored < cost) return;
    // no overlap with existing building
    for (const b of this.buildings) if (dist({ x, y }, b) < (b.radius || 6) + 12) return;
    // no overlap with mineral
    for (const m of this.minerals) if (!m.dead && dist({ x, y }, m) < m.radius + 8) return;
    let b;
    if (kind === "connector") b = new Connector(x, y);
    else if (kind === "miner") b = new Miner(x, y);
    else if (kind === "turret") b = new Turret(x, y);
    if (!b) return;
    this.minerals_stored -= cost;
    this.buildings.push(b);
    this.recomputeNetwork();
    this.refreshBuildUI();
  }

  recomputeNetwork() {
    // BFS from base; a building is networked if reachable via building-to-building <= CONNECT_RANGE
    for (const b of this.buildings) b.networked = false;
    this.base.networked = true;
    const q = [this.base];
    while (q.length) {
      const cur = q.shift();
      for (const other of this.buildings) {
        if (other.networked || other.dead) continue;
        if (dist(cur, other) <= CONNECT_RANGE) { other.networked = true; q.push(other); }
      }
    }
  }

  spawnWave() {
    this.wave_number += 1;
    const n = 2 + this.wave_number;
    const hp = 18 + this.wave_number * 8;
    const speed = 30 + this.wave_number * 2;
    for (let i = 0; i < n; i++) {
      // spawn from a random edge
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = Math.random() * W; y = -10; }
      else if (edge === 1) { x = W + 10; y = Math.random() * H; }
      else if (edge === 2) { x = Math.random() * W; y = H + 10; }
      else { x = -10; y = Math.random() * H; }
      this.enemies.push(new Enemy(x, y, hp, speed, 4 + this.wave_number, 6));
    }
    this.next_wave = this.time + 20 + this.wave_number * 4;
  }

  loop(t) {
    const dt_real = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const dt = dt_real * this.speed;

    if (!this.over && dt > 0) this.update(dt);
    this.draw();

    requestAnimationFrame(tt => this.loop(tt));
  }

  update(dt) {
    this.time += dt;

    // building updates
    for (const b of this.buildings) if (b.update) b.update(dt, this);

    // bullets
    for (const b of this.bullets) b.update(dt);
    this.bullets = this.bullets.filter(b => !b.dead);

    // waves
    if (this.time >= this.next_wave) this.spawnWave();

    // enemies
    for (const e of this.enemies) e.update(dt, this);

    // cleanup deaths -> grant minerals for kills
    const alive = [];
    for (const e of this.enemies) {
      if (e.dead) this.minerals_stored += e.value;
      else alive.push(e);
    }
    this.enemies = alive;

    // building deaths break network
    const before = this.buildings.length;
    this.buildings = this.buildings.filter(b => !b.dead);
    if (this.buildings.length !== before) this.recomputeNetwork();

    // dead minerals
    this.minerals = this.minerals.filter(m => !m.dead);

    // rate tracking
    this.rate_window.push([this.time, this.recent_mined]);
    this.recent_mined = 0;
    while (this.rate_window.length && this.time - this.rate_window[0][0] > 5) this.rate_window.shift();

    // win / lose
    if (this.base.dead) this.endGame("lose");
    if (this.minerals_collected >= GOAL) this.endGame("win");

    this.refreshHud();
  }

  endGame(state) {
    this.over = state;
    this.showBanner(state === "win" ? "Mission complete" : "Base destroyed", state);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // stars
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(220, 230, 255, ${s.a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // network lines (under everything)
    ctx.lineWidth = 1.2;
    for (let i = 0; i < this.buildings.length; i++) {
      const a = this.buildings[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.buildings.length; j++) {
        const b = this.buildings[j];
        if (b.dead) continue;
        if (dist(a, b) <= CONNECT_RANGE) {
          const lit = a.networked && b.networked;
          ctx.strokeStyle = lit ? "rgba(111, 209, 255, 0.45)" : "rgba(80, 100, 150, 0.18)";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // minerals
    for (const m of this.minerals) m.draw(ctx);
    // buildings
    for (const b of this.buildings) b.draw(ctx);
    // enemies
    for (const e of this.enemies) e.draw(ctx);
    // bullets
    for (const b of this.bullets) b.draw(ctx);

    // placement preview
    if (this.placement && this.mouse.in) this.drawPlacementPreview(ctx);

    // wave countdown
    if (!this.over && this.enemies.length === 0) {
      const t = Math.max(0, this.next_wave - this.time);
      ctx.fillStyle = "rgba(255, 220, 120, 0.75)";
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Next wave in ${t.toFixed(1)}s`, W / 2, 22);
    }
  }

  drawPlacementPreview(ctx) {
    const kind = this.placement;
    const cost = COSTS[kind];
    const x = this.mouse.x, y = this.mouse.y;
    const affordable = this.minerals_stored >= cost;
    let r = 10;
    if (kind === "connector") r = 8;
    if (kind === "miner") r = 10;
    if (kind === "turret") r = 11;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = affordable ? "rgba(111, 209, 255, 0.8)" : "rgba(255, 116, 102, 0.8)";
    ctx.fillStyle = "rgba(111, 209, 255, 0.1)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // show ranges
    ctx.setLineDash([4, 4]);
    if (kind === "connector") {
      ctx.strokeStyle = "rgba(111, 209, 255, 0.25)";
      ctx.beginPath(); ctx.arc(x, y, CONNECT_RANGE, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === "miner") {
      ctx.strokeStyle = "rgba(240, 193, 75, 0.3)";
      ctx.beginPath(); ctx.arc(x, y, MINE_RANGE, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === "turret") {
      ctx.strokeStyle = "rgba(255, 116, 102, 0.3)";
      ctx.beginPath(); ctx.arc(x, y, TURRET_RANGE, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ---------- ui ----------
  refreshHud() {
    document.getElementById("minerals").textContent = Math.floor(this.minerals_stored);
    const window_amt = this.rate_window.reduce((s, e) => s + e[1], 0);
    const rate = window_amt / Math.max(0.5, Math.min(5, this.time)) * 60;
    document.getElementById("rate").textContent = Math.round(rate);
    const networked_count = this.buildings.filter(b => b.networked && b.kind !== "base").length;
    document.getElementById("energy").textContent = networked_count;
    document.getElementById("energy-max").textContent = this.buildings.length - 1;
    document.getElementById("clock").textContent = fmtTime(this.time);
    document.getElementById("goal").textContent = `${Math.floor(this.minerals_collected)}/${GOAL}`;
    // also update build button affordability tinting
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      const kind = btn.dataset.build;
      if (kind === "cancel") continue;
      btn.classList.toggle("disabled", this.minerals_stored < COSTS[kind]);
    }
  }
  refreshBuildUI() {
    for (const btn of document.querySelectorAll("#build button[data-build]")) {
      btn.classList.toggle("active", btn.dataset.build === this.placement);
    }
    document.getElementById("hint").textContent = this.placement
      ? `Placing ${this.placement} — click on the map, or press Esc to cancel.`
      : `Click a building to start placing. Then click on the map.`;
  }
  refreshSpeedUI() {
    for (const btn of document.querySelectorAll("#speeds button[data-speed]")) {
      btn.classList.toggle("active", parseFloat(btn.dataset.speed) === this.speed);
    }
  }
  showBanner(text, kind) {
    const b = document.getElementById("banner");
    b.classList.remove("hidden", "win", "lose");
    b.classList.add(kind);
    document.getElementById("banner-text").textContent = text;
  }
  hideBanner() {
    document.getElementById("banner").classList.add("hidden");
  }
}

// boot
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  window.game = new Game(canvas);
});
