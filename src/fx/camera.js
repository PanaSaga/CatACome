// 카메라 — 렌더는 반드시 카메라 상대 좌표로 (§7-2 #1)
export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = 960; this.h = 540;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.ox = 0; this.oy = 0;
  }

  resize(w, h) { this.w = w; this.h = h; }

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

  screenToWorld(sx, sy) {
    return { x: sx + this.x + this.ox, y: sy + this.y + this.oy };
  }
}
