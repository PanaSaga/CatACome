// 소나 5단계 (§3-3). Lv1 흰 링만 · Lv2 색 구분 · Lv3 정거장 화살표 + 자동 토글 · Lv5 거리 병기
import {
  SONAR, SONAR_WAVE_TIME, SONAR_MOLE_PULL, SONAR_COLOR, TILE, M_PER_TILE,
  MARK_R, MARK_SPREAD, MARK_RINGS, MARK_PULSE_T,
} from '../data/balance.js';

const ENEMY_MARK_LIFE = 4;

export class Sonar {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.t = 0; // 표기 링 위상
    this.auto = false;
    this.waves = [];
    this.revealed = new Map(); // 정적 대상 — 런 동안 유지
    this.enemyMarks = [];      // 적 — 스냅샷, 서서히 사라짐
  }

  get level() { return this.game.profile.upgrades.sonar; }
  get spec() { return SONAR[this.level - 1]; }
  /** 플래그 소나 버프가 반경에 임시 가산된다 (§3-4) */
  get radiusTiles() { return this.spec.r + this.game.buffSonarTiles(); }
  get canAuto() { return this.level >= 3; }

  update(dt, input) {
    this.cd = Math.max(0, this.cd - dt);
    this.t += dt;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.waves[i].t += dt;
      if (this.waves[i].t > SONAR_WAVE_TIME + 0.35) this.waves.splice(i, 1);
      else this.scanWave(this.waves[i]);
    }
    for (let i = this.enemyMarks.length - 1; i >= 0; i--) {
      this.enemyMarks[i].t -= dt;
      if (this.enemyMarks[i].t <= 0) this.enemyMarks.splice(i, 1);
    }

    if (input.pressed('r')) {
      if (this.canAuto) {
        this.auto = !this.auto;
        this.game.toast(`자동 소나 ${this.auto ? 'ON' : 'OFF'}`);
      } else this.fire();
    }
    if (this.canAuto && this.auto && this.cd <= 0 && !this.game.player.dead) this.fire();
  }

  fire() {
    if (this.cd > 0 || this.game.player.dead) return false;
    this.cd = this.spec.cd;
    const p = this.game.player;
    this.waves.push({ x: p.eyeX, y: p.eyeY, t: 0, r: this.radiusTiles * TILE, hit: new Set() });
    this.game.sfx.play('sonar');
    // 소나는 큰 소리다 — 두더지가 3타일 접근 (§3-3)
    this.game.enemies.onNoise(SONAR_MOLE_PULL);
    return true;
  }

  scanWave(w) {
    const frontier = w.r * Math.min(1, w.t / SONAR_WAVE_TIME);
    for (const t of this.game.sonarTargets()) {
      if (w.hit.has(t.id)) continue;
      const d = Math.hypot(t.x - w.x, t.y - w.y);
      if (d > frontier || d > w.r) continue;
      w.hit.add(t.id);
      if (t.kind === 'enemy') {
        this.enemyMarks.push({ x: t.x, y: t.y, kind: 'enemy', t: ENEMY_MARK_LIFE });
        this.game.sfx.play('pingEnemy');
      } else {
        this.revealed.set(t.id, { x: t.x, y: t.y, kind: t.kind });
        this.game.sfx.play(
          t.kind === 'cat' ? 'pingCat' : t.kind === 'station' ? 'pingStation'
            : t.kind === 'corpse' ? 'pingCorpse' : 'pingChest'
        );
        if (t.kind === 'station') this.game.discoverStation(t.ref);
      }
    }
  }

  /** 이미 사라진 대상의 표시를 정리 */
  prune(validIds) {
    for (const id of [...this.revealed.keys()]) if (!validIds.has(id)) this.revealed.delete(id);
  }

  draw(ctx, cam) {
    // 파면
    for (const w of this.waves) {
      const r = w.r * Math.min(1, w.t / SONAR_WAVE_TIME);
      const a = Math.max(0, 1 - w.t / (SONAR_WAVE_TIME + 0.35));
      ctx.strokeStyle = `rgba(150,230,255,${0.5 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w.x - cam.x, w.y - cam.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const colored = this.level >= 2;
    /**
     * 감지된 대상 표기 — 위치를 정확히 알려주는 핵 + 그 자리에서 최대 5배까지
     * 퍼져 나가는 링 여러 겹(초음파). 링은 계속 반복돼 파묻힌 대상이 어디 있는지
     * 멀리서도 눈에 잡힌다.
     */
    const mark = (x, y, kind, alpha = 1) => {
      const col = colored ? (SONAR_COLOR[kind] || '#fff') : '#ffffff';
      const sx = x - cam.x, sy = y - cam.y;
      // 퍼지는 링
      ctx.strokeStyle = col;
      for (let i = 0; i < MARK_RINGS; i++) {
        const p = ((this.t / MARK_PULSE_T) + i / MARK_RINGS) % 1;
        ctx.globalAlpha = alpha * 0.55 * (1 - p);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, MARK_R * (1 + p * (MARK_SPREAD - 1)), 0, Math.PI * 2);
        ctx.stroke();
      }
      // 핵
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, MARK_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.arc(sx, sy, MARK_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    for (const m of this.revealed.values()) mark(m.x, m.y, m.kind);
    for (const m of this.enemyMarks) mark(m.x, m.y, 'enemy', Math.min(1, m.t / 1.2));

    // Lv3+ 정거장 방향 화살표 · Lv5 거리 병기
    if (this.level >= 3) this.drawStationArrow(ctx, cam);
    ctx.lineWidth = 1;
  }

  drawStationArrow(ctx, cam) {
    const p = this.game.player;
    let best = null, bd = Infinity;
    for (const m of this.revealed.values()) {
      if (m.kind !== 'station') continue;
      const d = Math.hypot(m.x - p.eyeX, m.y - p.eyeY);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return;
    const cx = this.game.camera.w / 2, cy = this.game.camera.h / 2;
    const ang = Math.atan2(best.y - p.eyeY, best.x - p.eyeX);
    const rr = 96;
    const ax = cx + Math.cos(ang) * rr, ay = cy + Math.sin(ang) * rr;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (this.level >= 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round((bd / TILE) * M_PER_TILE)}m`, ax, ay + 20);
      ctx.textAlign = 'left';
    }
  }
}
