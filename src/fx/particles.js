export class Particles {
  constructor(max = 400) { this.list = []; this.max = max; }

  spawn(x, y, n, color, opts = {}) {
    const spread = opts.spread ?? 2.2;
    const life = opts.life ?? 0.5;
    const size = opts.size ?? 3;
    const gravity = opts.gravity ?? 0.35;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) break;
      this.list.push({
        x, y,
        vx: (Math.random() - 0.5) * 2 * spread,
        vy: (Math.random() - 0.7) * 2 * spread,
        life: life * (0.6 + Math.random() * 0.8),
        t: 0, color, size, gravity,
      });
    }
  }

  ring(x, y, n, color, speed = 4) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) break;
      const a = (i / n) * Math.PI * 2;
      this.list.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.45, t: 0, color, size: 3, gravity: 0.06,
      });
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  draw(ctx, cam) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  clear() { this.list.length = 0; }
}
