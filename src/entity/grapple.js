// 갈고리 — 진자 스윙 도구가 아니라 즉시 견인 구제 수단 (§3-5)
import { TILE, GRAPPLE_RANGE, GRAPPLE_REEL_SPEED } from '../data/balance.js';
import { isSolidMat } from '../world/tiles.js';

const ARRIVE = TILE * 1.8;

export class Grapple {
  constructor(game) {
    this.game = game;
    this.clear();
  }

  clear() {
    this.reeling = false;
    this.hanging = false;
    this.anchor = null;
    this.anchorTile = null;
    this.ropeLen = 0;
    this.missT = 0;
    this.missDir = null;
    this.wasHeld = false;
  }

  get active() { return this.reeling || this.hanging; }
  get range() { return GRAPPLE_RANGE[this.game.profile.upgrades.grapple - 1] * TILE; }

  release() {
    this.reeling = false;
    this.hanging = false;
    this.anchor = null;
    this.anchorTile = null;
  }

  fire(world, dirX, dirY) {
    const ox = this.game.player.eyeX, oy = this.game.player.eyeY;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len, ny = dirY / len;
    const max = this.range;
    for (let d = 4; d <= max; d += 2) {
      const px = ox + nx * d, py = oy + ny * d;
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (isSolidMat(world.mat(tx, ty))) {
        this.anchorTile = { x: tx, y: ty };
        this.anchor = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        this.reeling = true;
        this.hanging = false;
        // 부착 즉시 효과 적용 — 도착을 기다리지 않는다 (§3-5)
        this.game.player.onGrappleAttach();
        this.game.sfx.play('grapple');
        return true;
      }
    }
    // 허공 — 로프만 뻗었다 돌아오는 연출
    this.missT = 0.28;
    this.missDir = { x: nx, y: ny, len: max };
    this.game.sfx.play('grappleMiss');
    return false;
  }

  preUpdate(dt, world, input) {
    this.missT = Math.max(0, this.missT - dt);
    const p = this.game.player;
    const held = input.grappleHeld();

    if (p.dead || p.buried > 0) { this.release(); this.wasHeld = held; return; }

    if (held && !this.wasHeld) {
      const aim = this.game.aim;
      this.fire(world, aim.dx, aim.dy);
    }
    if (!held && this.active) this.release();

    // Space로 해제 + 상승
    if (this.active && input.pressed(' ')) {
      this.release();
      p.vy = -7.05;
      p.airJumps = p.airJumpsMax;
      this.wasHeld = held;
      return;
    }

    if (this.reeling && this.anchor) {
      const dx = this.anchor.x - p.eyeX, dy = this.anchor.y - p.eyeY;
      const d = Math.hypot(dx, dy);
      if (d <= ARRIVE) {
        this.reeling = false;
        this.hanging = true;
        this.ropeLen = Math.max(TILE * 1.2, d);
      } else {
        p.vx = (dx / d) * GRAPPLE_REEL_SPEED;
        p.vy = (dy / d) * GRAPPLE_REEL_SPEED;
      }
    }
    this.wasHeld = held;
  }

  postUpdate(world) {
    const p = this.game.player;
    if (!this.active) return;

    // 앵커 타일이 파괴되면 즉시 해제 (§11-2)
    if (this.anchorTile && !isSolidMat(world.mat(this.anchorTile.x, this.anchorTile.y))) {
      this.release();
      return;
    }

    if (this.reeling) {
      // 벽에 막히면 그 자리에서 도착 처리
      if (p.vx === 0 && p.vy === 0) {
        const d = Math.hypot(this.anchor.x - p.eyeX, this.anchor.y - p.eyeY);
        this.reeling = false;
        this.hanging = true;
        this.ropeLen = Math.max(TILE * 1.2, d);
      }
      return;
    }

    if (this.hanging) {
      const dx = p.eyeX - this.anchor.x, dy = p.eyeY - this.anchor.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > this.ropeLen) {
        const nx = dx / d, ny = dy / d;
        const corr = d - this.ropeLen;
        p.x -= nx * corr;
        p.y -= ny * corr;
        const vn = p.vx * nx + p.vy * ny;
        p.vx -= vn * nx;
        p.vy -= vn * ny;
        p.vx *= 0.985;
      }
      p.fallAccum = 0;
    }
  }

  draw(ctx, cam) {
    const p = this.game.player;
    const ox = Math.round(p.eyeX - cam.x), oy = Math.round(p.eyeY - cam.y);
    ctx.lineWidth = 2;
    if (this.active && this.anchor) {
      ctx.strokeStyle = '#d8cba8';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(Math.round(this.anchor.x - cam.x), Math.round(this.anchor.y - cam.y));
      ctx.stroke();
      ctx.fillStyle = '#f0e6c8';
      ctx.fillRect(Math.round(this.anchor.x - cam.x) - 3, Math.round(this.anchor.y - cam.y) - 3, 6, 6);
    } else if (this.missT > 0 && this.missDir) {
      const t = this.missT / 0.28;
      const l = this.missDir.len * Math.sin(t * Math.PI);
      ctx.strokeStyle = 'rgba(216,203,168,0.7)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + this.missDir.x * l, oy + this.missDir.y * l);
      ctx.stroke();
    }
  }
}
