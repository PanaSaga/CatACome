// 카메라 — 렌더는 반드시 카메라 상대 좌표로 (§7-2 #1)
// w·h는 캔버스 픽셀이 아니라 "보이는 월드 영역"의 크기다. 확대 배율은 렌더에서
// ctx 변환으로 한 번만 걸고, 카메라·컬링·조준은 전부 월드 단위로 계산한다.
import { ZOOM } from '../data/balance.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = 960 / ZOOM; this.h = 540 / ZOOM;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.ox = 0; this.oy = 0;
  }

  resize(w, h) { this.w = w / ZOOM; this.h = h / ZOOM; }

  shake(mag, sec) {
    if (mag > this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; this.shakeT = sec; }
  }

  follow(target, dt, snap = false) {
    const tx = target.cx - this.w / 2;
    const ty = target.cy - this.h / 2;
    if (snap) { this.x = tx; this.y = ty; }
    else {
      const k = 1 - Math.pow(0.001, dt);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeT / 0.3);
      this.ox = (Math.random() - 0.5) * 2 * m;
      this.oy = (Math.random() - 0.5) * 2 * m;
      if (this.shakeT <= 0) { this.ox = 0; this.oy = 0; this.shakeMag = 0; }
    } else { this.ox = 0; this.oy = 0; }
  }

  /** 렌더에 쓰는 실효 좌표 (셰이크 포함) */
  get view() { return { x: this.x + this.ox, y: this.y + this.oy, w: this.w, h: this.h }; }

  /** 캔버스 픽셀 → 월드 좌표 (확대 배율 반영) */
  screenToWorld(sx, sy) {
    return { x: sx / ZOOM + this.x + this.ox, y: sy / ZOOM + this.y + this.oy };
  }
}
