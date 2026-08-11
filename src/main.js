// CAT A COME — 런 상태 머신 · 고정 타임스텝 루프
import {
  TILE, DT, M_PER_TILE, HP_LEVELS, START_BOMBS, BG_STOPS, SKY, SKY_LOW, FLAG,
} from './data/balance.js';
import { World } from './world/world.js';
import { TUT_SPAWNS, TUT_HINTS } from './world/tutorial.js';
import { Player } from './entity/player.js';
import { Grapple } from './entity/grapple.js';
import { Enemies } from './entity/enemies.js';
import { Objects, HOUSE, SURFACE_SPAWN } from './entity/objects.js';
import { Tools } from './tool/tools.js';
import { Sonar } from './tool/sonar.js';
import { Camera } from './fx/camera.js';
import { Particles } from './fx/particles.js';
import { Sfx } from './fx/sfx.js';
import { Input } from './core/input.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import {
  loadProfile, saveProfile, submitRun, postFlag, moderateName, SEASON, BACKEND,
} from './net/api.js';

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function bgColorAt(m) {
  const s = BG_STOPS;
  if (m <= s[0].m) return s[0].c;
  for (let i = 1; i < s.length; i++) {
    if (m <= s[i].m) {
      const t = (m - s[i - 1].m) / (s[i].m - s[i - 1].m);
      return s[i - 1].c.map((v, k) => Math.round(v + (s[i].c[k] - v) * t));
    }
  }
  return s[s.length - 1].c;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input(this.canvas);
    this.camera = new Camera();
    this.particles = new Particles();
    this.sfx = new Sfx();
    this.aim = { x: 0, y: 0, dx: 1, dy: 0 };
    this.buff = { t: 0, sonarM: 0 };
    this.flash = 0;
    this.safeReturnT = 0;
    this.acc = 0;
    this.lastTs = 0;
    this.paused = true;
    addEventListener('resize', () => this.resize());
  }

  async boot() {
    this.profile = await loadProfile();
    this.world = new World(SEASON.seed);
    this.player = new Player(this);
    this.grapple = new Grapple(this);
    this.enemies = new Enemies(this);
    this.objects = new Objects(this);
    this.tools = new Tools(this);
    this.sonar = new Sonar(this);
    this.hud = new Hud(this);
    this.panels = new Panels(this);
    this.resetRunState();
    this.resize();

    document.getElementById('backendNote').textContent =
      `${BACKEND.note} · 시즌 ${SEASON.id} (시드 ${SEASON.seed})`;
    const nameInput = document.getElementById('nameInput');
    nameInput.value = this.profile.name || '';
    const start = () => {
      const res = moderateName(nameInput.value);
      if (!res.ok) { document.getElementById('nameErr').textContent = res.reason; return; }
      this.profile.name = res.text;
      this.saveProfile();
      document.getElementById('start').hidden = true;
      this.hud.show();
      this.sfx.resume();
      this.startRun();
    };
    document.getElementById('startBtn').addEventListener('click', start);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    document.getElementById('boardBtn').addEventListener('click', () => this.panels.openLeaderboard('start'));

    this.installDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = Math.floor(innerWidth), h = Math.floor(innerHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.camera.resize(w, h);
  }

  saveProfile() { saveProfile(this.profile); }

  // ── 런 ─────────────────────────────────────────────────────────
  resetRunState() {
    this.run = {
      copper: 0,
      items: { bomb: START_BOMBS, drill: 0, laser: 0, flag: 0 },
      potions: { 1: 0, 2: 0, 3: 0 },
      cats: [],
      maxDepth: 0,
      catsDelivered: 0,
      clinicUses: 0,
      stations: new Set(),
      startedAt: performance.now(),
    };
  }

  startRun() {
    this.resetRunState();
    this.world.reset();
    this.enemies.reset();
    this.objects.reset();
    this.sonar.reset();
    this.tools.reset();
    this.particles.clear();
    this.buff = { t: 0, sonarM: 0 };

    this.player.maxHp = HP_LEVELS[this.profile.upgrades.maxHp - 1];
    this.player.reset(SURFACE_SPAWN.x * TILE, SURFACE_SPAWN.y * TILE);
    this.player.hp = this.player.maxHp;
    this.grapple.clear();

    // 튜토리얼 고정 배치
    this.objects.addTutorialContent(TUT_SPAWNS);
    for (const s of TUT_SPAWNS.bat) this.enemies.make('bat', s.x, s.y);
    for (const s of TUT_SPAWNS.mole) this.enemies.make('mole', s.x, s.y);

    this.world.onBreak = null;
    this.camera.follow(this.player, 0, true);
    this.paused = false;
    this.toast(`${this.profile.name} — 내려간다. 폭탄 ${START_BOMBS}개.`, 3000);
  }

  killPlayer(cause) {
    if (this.player.dead) return;
    this.player.dead = true;
    this.grapple.release();
    this.run.cats = [];
    this.sfx.play('death');
    this.camera.shake(10, 0.5);
    const sec = (performance.now() - this.run.startedAt) / 1000;
    const summary = {
      cause: cause || '사망',
      depth: this.run.maxDepth,
      cats: this.run.catsDelivered,
      lostCopper: this.run.copper,
      bank: this.profile.bank,
      sec,
    };
    this.profile.bestDepth = Math.max(this.profile.bestDepth, Math.round(this.run.maxDepth));
    this.profile.bestCats = Math.max(this.profile.bestCats, this.run.catsDelivered);
    this.profile.seasonCats += this.run.catsDelivered;
    this.saveProfile();
    submitRun({ name: this.profile.name, depth: this.run.maxDepth, cats: this.run.catsDelivered });
    setTimeout(() => this.panels.openDeath(summary), 700);
  }

  onDamaged(n, cause) {
    this.sfx.play(cause === '화상' ? 'burn' : 'hurt');
    this.camera.shake(4, 0.12);
    this.flash = 0.22;
  }

  gainCopper(n) { this.run.copper += n; }

  toast(msg, ms) { this.hud.toast(msg, ms); }

  // ── 등급 · 버프 ────────────────────────────────────────────────
  grade() { return Math.min(this.profile.upgrades.pickSpeed, this.profile.upgrades.pickRange); }
  /** 전투 판정에만 쓰는 등급 — 플래그 버프 시 6 (§3-1) */
  effGrade() { return this.buff.t > 0 ? 6 : this.grade(); }
  itemLevel(name) { return this.buff.t > 0 ? 6 : this.profile.upgrades[name]; }
  buffSonarTiles() { return this.buff.t > 0 ? this.buff.sonarM / M_PER_TILE : 0; }

  inSafeZone() {
    // 지상 전역과 집 안은 안전지대 (§5-5)
    return this.player.y + this.player.h <= 0 || this.objects.nearHouse();
  }

  // ── 상호작용 ───────────────────────────────────────────────────
  currentPlace() {
    if (this.player.y + this.player.h <= TILE * 2 && this.objects.nearHouse()) return 'surface';
    const st = this.objects.nearestStation(6);
    return st ? st.id : null;
  }

  openHouse() {
    this.objects.deliverCats(null);
    this.panels.openHouse();
  }

  openElevator(st) {
    this.discoverStation(st);
    this.objects.deliverCats(st);
    if (st.index === 1 && !this.profile.tutorialDone) {
      this.profile.tutorialDone = true;
      this.saveProfile();
    }
    this.panels.openElevator(st);
  }

  discoverStation(s) {
    if (!s || s.discovered) return;
    s.discovered = true;
    this.run.stations.add(s.depthM);
    this.toast(`E${s.index} 정거장 발견 (−${s.depthM}m)`);
    this.sfx.play('pingStation');
  }

  travelTo(dest) {
    this.sfx.play('elevator');
    if (dest === 'surface') {
      // 지상 복귀는 이동일 뿐 — HP·숨은 회복시키지 않는다 (회복은 의료소·포션만)
      const hp = this.player.hp;
      const breath = this.player.breath;
      this.player.reset(SURFACE_SPAWN.x * TILE, SURFACE_SPAWN.y * TILE);
      this.player.hp = hp;
      this.player.breath = breath;
    } else {
      const st = this.objects.stations.find((s) => s.id === dest);
      if (!st) return;
      this.player.x = st.x * TILE;
      this.player.y = (st.y - 2) * TILE;
      this.player.vx = 0; this.player.vy = 0;
      this.player.fallAccum = 0;
    }
    this.grapple.release();
    this.camera.follow(this.player, 0, true);
  }

  requestFlagPlacement() {
    if ((this.run.items.flag | 0) <= 0) { this.sfx.play('error'); this.toast('플래그가 없다'); return; }
    this.panels.openFlagInput();
  }

  confirmFlag(text) {
    const f = this.objects.placeFlag(text);
    if (f) postFlag({ x: f.x, y: f.y, msg: f.msg, level: f.level, owner: f.owner, season: SEASON.id });
  }

  readFlag(f) {
    // 플래그당 계정당 1회만 버프·회복 (§6-3)
    if (this.objects.readFlags.has(f.id)) { this.panels.openFlagRead(f, null); return; }
    this.objects.readFlags.add(f.id);
    const lv = f.level;
    const heal = FLAG.heal[lv - 1];
    const sec = FLAG.buffSec[lv - 1];
    const sonarM = FLAG.sonarBonusM[lv - 1];
    this.player.heal(heal);
    this.buff = { t: sec, sonarM };
    this.sfx.play('buff');
    this.panels.openFlagRead(f, { heal, sec, sonarM });
  }

  tutorialSafeReturn() {
    if (this.safeReturnT > 0) return;
    this.safeReturnT = 0.8;
    this.player.safeReturn();
    this.toast('안전지대 — 발판으로 복귀', 1400);
  }

  sonarTargets() {
    return [...this.objects.targets(), ...this.enemies.targets()];
  }

  // ── 루프 ───────────────────────────────────────────────────────
  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.lastTs) this.lastTs = ts;
    // 탭 비활성 후 복귀 시 dt 폭주를 막는다 (§11-2)
    const dtMs = Math.min(100, ts - this.lastTs);
    this.lastTs = ts;
    this.acc += dtMs / 1000;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.step(DT);
      this.acc -= DT;
      steps++;
    }
    if (steps >= 5) this.acc = 0;
    this.render();
  }

  step(dt) {
    const input = this.input;
    if (this.paused) { input.endStep(); return; }

    // Esc / Tab — 패널
    if (input.pressedRaw('Escape') && this.panels.open) this.panels.close();
    if (input.pressedRaw('Tab')) {
      if (this.panels.kind === 'inventory') this.panels.close();
      else if (!this.panels.open) this.panels.openInventory();
    }

    // 조준 (커서 방향이 곧 바라보는 방향)
    const v = this.camera.view;
    this.aim.x = input.mouse.x + v.x;
    this.aim.y = input.mouse.y + v.y;
    this.aim.dx = this.aim.x - this.player.eyeX;
    this.aim.dy = this.aim.y - this.player.eyeY;
    if (!this.player.dead) this.player.facing = this.aim.dx >= 0 ? 1 : -1;

    this.safeReturnT = Math.max(0, this.safeReturnT - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.buff.t > 0) {
      this.buff.t = Math.max(0, this.buff.t - dt);
      if (this.buff.t === 0) this.toast('플래그 버프 종료');
    }

    if (!this.panels.open) {
      this.grapple.preUpdate(dt, this.world, input);
      this.player.update(dt, this.world, input);
      this.grapple.postUpdate(this.world);
      this.tools.update(dt, this.world, input);
      this.tools.checkDynamiteContact();
      this.sonar.update(dt, input);
      this.enemies.update(dt, this.world);
      this.objects.update(dt);
      this.world.updateFalling(dt, (tx, ty, f, moving) => { if (!moving) this.onSandLand(tx, ty); });
      if (input.pressed('e')) this.objects.interact();
      this.handleDebugKeys(input);
    }

    this.particles.update(dt);
    this.camera.follow(this.player, dt);
    this.sfx.setUnderwater(this.player.submerged);

    const d = Math.max(0, this.player.depthM);
    if (d > this.run.maxDepth) this.run.maxDepth = d;
    this.sonar.prune(this.objects.validIds());

    input.endStep();
  }

  onSandLand(tx, ty) {
    const p = this.player;
    const px0 = Math.floor(p.x / TILE), px1 = Math.floor((p.x + p.w - 1) / TILE);
    const py0 = Math.floor(p.y / TILE), py1 = Math.floor((p.y + p.h - 1) / TILE);
    const overlaps = tx >= px0 && tx <= px1 && ty >= py0 - 1 && ty <= py1;
    if (!overlaps) return;
    let above = 0;
    for (let k = 1; k <= 4; k++) if (this.world.isSolid(p.tileX, py0 - k)) above++;
    this.particles.spawn(tx * TILE + 8, ty * TILE + 8, 6, '#b5975c', { spread: 2, life: 0.4 });
    if (above >= 2) {
      // 매몰 — 이동 불가, 좌클릭 연타로 탈출 (§4-2)
      if (p.buried <= 0) {
        p.buried = 8;
        p.damage(1, '매몰');
        this.toast('매몰됐다! 좌클릭 연타로 탈출');
      }
    }
  }

  // ── 렌더 ───────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    const cam = this.camera.view;
    this.drawBackground(ctx, cam);
    this.world.draw(ctx, cam);
    this.objects.draw(ctx, cam);
    this.enemies.draw(ctx, cam);
    this.tools.draw(ctx, cam);
    this.grapple.draw(ctx, cam);
    if (!this.player.dead) this.player.draw(ctx, cam);
    this.particles.draw(ctx, cam);
    this.sonar.draw(ctx, cam);
    this.drawOverlays(ctx, cam);
    if (!this.paused) this.hud.update();
    this.updateHint();
  }

  drawBackground(ctx, cam) {
    const w = cam.w, h = cam.h;
    const groundY = 0 - cam.y;
    if (groundY > 0) {
      const g1 = ctx.createLinearGradient(0, 0, 0, Math.min(h, groundY));
      g1.addColorStop(0, SKY);
      g1.addColorStop(1, SKY_LOW);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, Math.min(h, groundY));
      // 구름 몇 조각
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 5; i++) {
        const cxp = ((i * 337 - cam.x * 0.25) % (w + 300)) - 150;
        const cyp = 40 + i * 37 - cam.y * 0.12;
        if (cyp > groundY - 10) continue;
        ctx.fillRect(cxp, cyp, 70, 14);
        ctx.fillRect(cxp + 16, cyp - 10, 42, 14);
      }
    }
    if (groundY < h) {
      const y0 = Math.max(0, groundY);
      const m0 = Math.max(0, ((cam.y + y0) / TILE) * M_PER_TILE);
      const m1 = Math.max(0, ((cam.y + h) / TILE) * M_PER_TILE);
      const g2 = ctx.createLinearGradient(0, y0, 0, h);
      g2.addColorStop(0, rgb(bgColorAt(m0)));
      g2.addColorStop(1, rgb(bgColorAt(m1)));
      ctx.fillStyle = g2;
      ctx.fillRect(0, y0, w, h - y0);
    }
  }

  drawOverlays(ctx, cam) {
    // 피격 플래시
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, cam.w, cam.h);
    }
    // 숨 5초 남으면 비네팅
    const p = this.player;
    if (p.submerged && p.breath < 5) {
      const a = (1 - p.breath / 5) * 0.6;
      const g = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * 0.25, cam.w / 2, cam.h / 2, cam.h * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(10,30,60,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cam.w, cam.h);
    }
    if (p.inLava) {
      ctx.fillStyle = 'rgba(255,90,20,0.18)';
      ctx.fillRect(0, 0, cam.w, cam.h);
    }
    if (p.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, cam.w, cam.h);
    }
  }

  updateHint() {
    if (this.paused) return;
    const d = this.player.depthM;
    if (this.profile.tutorialDone || d > 52) { this.hud.hint(null); return; }
    let cur = null;
    for (const h of TUT_HINTS) if (d >= h.m - 1) cur = h;
    this.hud.hint(cur ? cur.text : null);
  }

  // ── 디버그 (§8-1) ──────────────────────────────────────────────
  handleDebugKeys(input) {
    const u = this.profile.upgrades;
    if (input.pressed('[')) { u.pickRange = Math.max(1, u.pickRange - 1); this.toast(`범위 Lv${u.pickRange}`); }
    if (input.pressed(']')) { u.pickRange = Math.min(5, u.pickRange + 1); this.toast(`범위 Lv${u.pickRange}`); }
    if (input.pressed('-')) { u.pickSpeed = Math.max(1, u.pickSpeed - 1); this.toast(`속도 Lv${u.pickSpeed}`); }
    if (input.pressed('=')) { u.pickSpeed = Math.min(5, u.pickSpeed + 1); this.toast(`속도 Lv${u.pickSpeed}`); }
    if (input.pressed(',')) { u.grapple = Math.max(1, u.grapple - 1); this.toast(`갈고리 Lv${u.grapple}`); }
    if (input.pressed('.')) { u.grapple = Math.min(4, u.grapple + 1); this.toast(`갈고리 Lv${u.grapple}`); }
    if (input.pressed(';')) { u.sonar = Math.max(1, u.sonar - 1); this.toast(`소나 Lv${u.sonar}`); }
    if (input.pressed("'")) { u.sonar = Math.min(5, u.sonar + 1); this.toast(`소나 Lv${u.sonar}`); }
  }

  teleportToDepth(m) {
    this.player.x = 0;
    this.player.y = (m / M_PER_TILE) * TILE;
    this.player.vx = 0; this.player.vy = 0;
    this.player.fallAccum = 0;
    // 발밑 공간 확보
    const tx = this.player.tileX, ty = Math.floor(this.player.y / TILE);
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) this.world.set(tx + dx, ty + dy, 0);
    this.camera.follow(this.player, 0, true);
  }

  installDebug() {
    window.__game = {
      game: this,
      run: (n = 1) => { for (let i = 0; i < n; i++) this.step(DT); },
      render: () => this.render(),
      teleportToDepth: (m) => this.teleportToDepth(m),
      aimAt: (tx, ty) => {
        this.aim.x = tx * TILE + 8;
        this.aim.y = ty * TILE + 8;
        this.aim.dx = this.aim.x - this.player.eyeX;
        this.aim.dy = this.aim.y - this.player.eyeY;
        this.player.facing = this.aim.dx >= 0 ? 1 : -1;
      },
      shot: (w = 640, h = 360) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
      },
      state: () => ({
        depth: this.player.depthM, hp: this.player.hp, copper: this.run.copper,
        bank: this.profile.bank, enemies: this.enemies.list.length,
        chests: this.objects.chests.length, cats: this.objects.cats.length,
        grade: this.grade(), buff: this.buff.t,
      }),
    };
  }
}

const game = new Game();
game.boot();
