// 플레이어 물리 · HP · 낙하 · 액체
import { MAT, isSolidMat, matOf } from '../world/tiles.js';
import { TILE, FALL_STEPS, INVULN, BREATH_MAX, DROWN_GRACE, LAVA_TICK, M_PER_TILE } from '../data/balance.js';

const EPS = 0.01;
// 충돌 상자를 좌우 1px씩 안쪽으로 줄인다. 플레이어 폭이 타일 폭과 정확히 같으면
// 1px만 걸친 옆 열이 지지대가 되어, 발밑 타일을 부숴도 떨어지지 않는다 (§11-1 함정 2 변종).
const COL_INSET = 1;
// 중력을 낮춰 점프·낙하를 느리게 했다. 3배 확대에서는 화면상 이동 속도도
// 3배라, 계획서 값(0.55)에 점프 1.3배를 얹으니 한 칸 블록에 올라서기가 어려웠다.
// 높이는 유지하고 속도만 줄이는 쪽으로 잡았다 (h = v²/2g).
export const GRAVITY = 0.32;
export const TERMINAL = 9;
export const JUMP_V = -6.8;         // 1단 ≈ 4.5타일 · 상승 0.35초 (예전 6.0타일 · 0.31초)
export const AIR_JUMP_V = -6.0;     // 이단 누적 ≈ 8타일
export const GRAPPLE_KICK_V = -6.2; // 갈고리 해제 상승
export const RUN_SPEED = 2.6;
/** 공중 가속. 낮으면 발판에 맞춰 내려서기가 어렵다 */
const AIR_CONTROL = 0.28;
const GROUND_CONTROL = 0.35;
const SWING_TIME = 0.24;

function boxSolid(world, x, y, w, h) {
  const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - EPS) / TILE);
  const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolidMat(world.mat(tx, ty))) return true;
    }
  }
  return false;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.w = TILE;
    this.h = TILE * 2;
    this.maxHp = 3;
    this.reset(0, -TILE * 3);
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.airJumps = 1;
    this.airJumpsMax = 1;
    this.fallAccum = 0;
    this.facing = 1;
    this.hp = this.maxHp ?? 3;
    this.invuln = 0;
    this.breath = BREATH_MAX;
    this.drownGrace = DROWN_GRACE;
    this.burn = 0;
    this.wasInLava = false;
    this.inWater = false;
    this.inLava = false;
    this.submerged = false;
    this.buried = 0;
    this.jumpLock = 0;
    this.swingT = 0;
    this.swingAng = 0;
    this.suppressJump = false;
    this.dead = false;
  }

  /** 곡괭이를 휘두른 순간 — 조준 방향으로 호를 그린다 */
  swingPick(dx, dy) {
    this.swingT = SWING_TIME;
    this.swingAng = Math.atan2(dy, dx);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  /** 조준 원점 = 눈높이 (§11-1 함정 5) */
  get eyeX() { return this.x + this.w / 2; }
  get eyeY() { return this.y + 8; }
  get tileX() { return Math.floor(this.cx / TILE); }
  get tileY() { return Math.floor(this.cy / TILE); }
  get depthM() { return (this.y + this.h) / TILE * M_PER_TILE; }

  liquidAt(world, px, py) {
    return matOf(world.get(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  sampleLiquids(world) {
    // inWater = 머리·중심·발 중 하나라도 액체 (§11-1 함정 4)
    const head = this.liquidAt(world, this.cx, this.y + 4);
    const mid = this.liquidAt(world, this.cx, this.cy);
    const feet = this.liquidAt(world, this.cx, this.y + this.h - 2);
    const anyWater = [head, mid, feet].includes(MAT.WATER);
    const anyLava = [head, mid, feet].includes(MAT.LAVA);
    this.inWater = anyWater;
    this.inLava = anyLava;
    this.inLiquid = anyWater || anyLava;
    this.submerged = head === MAT.WATER;
  }

  damage(n, cause, ignoreInvuln = false) {
    if (this.dead) return false;
    if (this.game.inSafeZone()) return false;
    if (!ignoreInvuln && this.invuln > 0) return false;
    this.hp -= n;
    if (!ignoreInvuln) this.invuln = INVULN;
    this.game.onDamaged(n, cause);
    if (this.hp <= 0) { this.hp = 0; this.game.killPlayer(cause); return true; }
    return true;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  jump() {
    if (this.buried > 0 || this.jumpLock > 0) return;
    if (this.inLiquid) return; // 액체 안에서는 점프 불가 (부력만)
    if (this.onGround) {
      this.vy = JUMP_V;
      this.onGround = false;
      this.game.sfx.play('jump');
    } else if (this.airJumps > 0) {
      this.airJumps--;
      this.vy = AIR_JUMP_V;
      this.fallAccum = 0; // 리셋 ④ 공중 점프
      this.game.sfx.play('jump', 1.2);
    }
  }

  /** 갈고리 부착 시 호출 — 리셋 ③ */
  onGrappleAttach() {
    this.airJumps = this.airJumpsMax;
    this.fallAccum = 0;
  }

  update(dt, world, input) {
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.sampleLiquids(world);

    // ── 매몰 ────────────────────────────────────────────────────
    if (this.buried > 0) {
      this.vx = 0; this.vy = 0;
      return;
    }

    const speedMul = this.inLava ? 0.4 : this.inWater ? 0.6 : 1;
    if (!this.game.grapple.reeling) {
      let want = 0;
      if (input.down('a')) want -= 1;
      if (input.down('d')) want += 1;
      const target = want * RUN_SPEED * speedMul;
      this.vx += (target - this.vx) * (this.onGround ? GROUND_CONTROL : AIR_CONTROL);
      if (Math.abs(this.vx) < 0.02) this.vx = 0;
    }

    // ── 중력 · 부력 ─────────────────────────────────────────────
    if (this.game.grapple.reeling) {
      // 견인 중에는 갈고리가 속도를 지배한다
    } else if (this.inLiquid) {
      const term = this.inLava ? 1.4 : 2.2;
      this.vy = Math.min(this.vy + GRAVITY * 0.35, term);
      if (this.inLava) this.vy = Math.min(this.vy, 0.9); // 용암은 가라앉지 않는다
      if (input.pressed(' ')) this.vy = this.inLava ? -2.2 : -2.6;
      this.fallAccum = 0; // 리셋 ② 수면 진입
    } else {
      this.vy = Math.min(this.vy + GRAVITY, TERMINAL);
    }

    // 갈고리가 이번 프레임의 Space를 이미 해제+상승으로 썼으면 공중 점프를
    // 겹쳐 쓰지 않는다. 그래야 갈고리에서 뛰어내린 뒤에도 이단점프가 남는다.
    if (input.pressed(' ') && !this.suppressJump) this.jump();
    this.suppressJump = false;

    // ── 이동 (스윕 · 스냅은 이동 후 좌표 기준 §11-1 함정 2) ─────
    this.moveAxis(world, 'x');
    const wasFalling = this.vy > 0;
    if (wasFalling && !this.inLiquid && !this.game.grapple.reeling) this.fallAccum += this.vy;
    const landed = this.moveAxis(world, 'y');

    if (landed === 'floor') {
      const tiles = this.fallAccum / TILE;
      this.fallAccum = 0;
      this.airJumps = this.airJumpsMax; // 리셋 ① 착지
      if (!this.onGround) this.game.sfx.play('land');
      this.onGround = true;
      let dmg = 0;
      for (const s of FALL_STEPS) if (tiles >= s.tiles) dmg = s.dmg;
      if (dmg > 0) {
        this.jumpLock = 0.4; // 착지 경직
        this.damage(dmg, '낙하');
      }
    } else if (landed === 'ceil') {
      this.vy = 0;
      this.onGround = false;
    } else {
      // 발밑이 사라졌는지 확인
      if (this.onGround && !this.solidBox(world, this.x, this.y + 1)) this.onGround = false;
    }

    this.snapToGrid(world);

    // ── 숨 · 화상 ───────────────────────────────────────────────
    if (this.submerged) {
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = 0;
        this.drownGrace -= dt;
        if (this.drownGrace <= 0) {
          this.drownGrace = 1;
          this.damage(1, '익사', true); // 무적 무시 (§11-2)
        }
      }
    } else {
      this.drownGrace = DROWN_GRACE;
      if (this.breath < BREATH_MAX) this.breath = Math.min(BREATH_MAX, this.breath + BREATH_MAX / 2 * dt);
    }

    if (this.inLava) {
      if (!this.wasInLava) { this.burn = LAVA_TICK; this.wasInLava = true; } // 닿는 순간 1회 즉시 피해
      this.burn += dt;
      if (this.burn >= LAVA_TICK) {
        this.burn = 0;
        this.damage(1, '화상', true);
      }
    } else { this.burn = 0; this.wasInLava = false; }

    // 월드 좌우 경계
    const limitPx = 399 * TILE;
    if (this.x < -limitPx) { this.x = -limitPx; this.vx = 0; }
    if (this.x > limitPx) { this.x = limitPx; this.vx = 0; }
  }

  /** 충돌 판정 — 좌우를 COL_INSET만큼 줄인 상자로 검사한다 */
  solidBox(world, x, y) {
    return boxSolid(world, x + COL_INSET, y, this.w - COL_INSET * 2, this.h);
  }

  /**
   * 지면에서 완전히 멈췄을 때 타일 격자에 미세 정렬한다.
   * 3px 미만만 당기므로 눈에 띄지 않고, 발밑을 수직으로 파 내려가는 것이 확실해진다.
   */
  snapToGrid(world) {
    if (!this.onGround || this.vx !== 0) return;
    if (this.game.grapple.active) return;
    const aligned = Math.round(this.x / TILE) * TILE;
    if (aligned === this.x || Math.abs(aligned - this.x) >= 3.5) return;
    if (!this.solidBox(world, aligned, this.y)) this.x = aligned;
  }

  /** @returns {'floor'|'ceil'|'wall'|null} */
  moveAxis(world, axis) {
    let remaining = axis === 'x' ? this.vx : this.vy;
    if (remaining === 0) return null;
    const sign = Math.sign(remaining);
    const inner = this.w - COL_INSET; // 오른쪽 충돌 면까지의 거리
    let hit = null;
    while (remaining !== 0) {
      const step = Math.abs(remaining) > 1 ? sign : remaining;
      if (axis === 'x') {
        const nx = this.x + step;
        if (this.solidBox(world, nx, this.y)) {
          this.x = sign > 0
            ? Math.floor((nx + inner - EPS) / TILE) * TILE - inner
            : (Math.floor((nx + COL_INSET) / TILE) + 1) * TILE - COL_INSET;
          this.vx = 0;
          hit = 'wall';
          break;
        }
        this.x = nx;
      } else {
        const ny = this.y + step;
        if (this.solidBox(world, this.x, ny)) {
          if (sign > 0) {
            this.y = Math.floor((ny + this.h - EPS) / TILE) * TILE - this.h;
            hit = 'floor';
          } else {
            this.y = (Math.floor(ny / TILE) + 1) * TILE;
            hit = 'ceil';
          }
          this.vy = 0;
          break;
        }
        this.y = ny;
      }
      remaining -= step;
    }
    return hit;
  }

  draw(ctx, cam) {
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    // 몸
    ctx.fillStyle = '#e8e3d8';
    ctx.fillRect(sx + 2, sy + 12, 12, 18);
    ctx.fillStyle = '#c9552f';
    ctx.fillRect(sx + 2, sy + 20, 12, 5);
    // 머리
    ctx.fillStyle = '#f2d9b8';
    ctx.fillRect(sx + 3, sy + 2, 10, 11);
    // 헬멧
    ctx.fillStyle = '#f0b429';
    ctx.fillRect(sx + 2, sy, 12, 5);
    // 눈 (눈높이 y+8)
    ctx.fillStyle = '#20202a';
    const ex = this.facing > 0 ? sx + 9 : sx + 4;
    ctx.fillRect(ex, sy + 7, 2, 2);
    // 발
    ctx.fillStyle = '#3a2f28';
    ctx.fillRect(sx + 2, sy + 30, 5, 2);
    ctx.fillRect(sx + 9, sy + 30, 5, 2);
    if (this.swingT > 0) this.drawPickaxe(ctx, sx, sy);
    ctx.globalAlpha = 1;

    if (this.buried > 0) {
      ctx.fillStyle = 'rgba(181,151,92,0.85)';
      ctx.fillRect(sx - 4, sy - 4, this.w + 8, this.h + 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('좌클릭 연타!', sx - 18, sy - 8);
    }
  }

  /**
   * 조준 방향을 중심으로 곡괭이가 위에서 아래로 호를 그린다.
   * 진행도 0 → 1 동안 −0.9rad에서 +0.5rad까지 훑고, 뒤쪽 절반은 빠르게 복귀한다.
   */
  drawPickaxe(ctx, sx, sy) {
    const t = 1 - this.swingT / SWING_TIME; // 0 = 시작, 1 = 끝
    const ease = t < 0.55 ? t / 0.55 : 1 - (t - 0.55) / 0.45 * 0.35;
    const ang = this.swingAng - 0.9 + ease * 1.4;
    ctx.save();
    ctx.translate(sx + 8, sy + 14); // 어깨
    ctx.rotate(ang);
    // 자루
    ctx.fillStyle = '#8a5a3c';
    ctx.fillRect(0, -1, 15, 3);
    // 머리 (ㄱ자)
    ctx.fillStyle = '#c9ccd8';
    ctx.fillRect(13, -6, 4, 10);
    ctx.fillRect(9, -6, 8, 3);
    ctx.restore();
  }
}
