// 입력 — 홀드/엣지 구분, DPR·창 크기 무관 마우스 환산 (§11-1 함정 6)
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.just = new Set();
    this.mouse = { x: 0, y: 0 };
    this.btn = [false, false, false];
    this.btnJust = [false, false, false];
    this.wheel = 0;
    this.locked = false; // 패널이 열려 있으면 게임 조작 잠금 (§2)

    addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      this.just.add(k);
    });
    addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    // 창 포커스 상실 — 모든 홀드 입력 해제 (§11-2)
    addEventListener('blur', () => this.clearHolds());

    canvas.addEventListener('mousemove', (e) => this.setMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(e);
      if (!this.btn[e.button]) this.btnJust[e.button] = true;
      this.btn[e.button] = true;
    });
    addEventListener('mouseup', (e) => { this.btn[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  setMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  clearHolds() {
    this.keys.clear();
    this.btn = [false, false, false];
  }

  down(k) { return !this.locked && this.keys.has(k); }
  pressed(k) { return !this.locked && this.just.has(k); }
  /** 잠금 상태에서도 읽어야 하는 키 (Esc 등) */
  pressedRaw(k) { return this.just.has(k); }

  mouseDown(b = 0) { return !this.locked && this.btn[b]; }
  mouseClicked(b = 0) { return !this.locked && this.btnJust[b]; }

  /** Shift 또는 우클릭 홀드 (§2) */
  grappleHeld() { return !this.locked && (this.keys.has('Shift') || this.btn[2]); }

  takeWheel() { const w = this.locked ? 0 : this.wheel; this.wheel = 0; return w; }

  endStep() {
    this.just.clear();
    this.btnJust = [false, false, false];
  }
}
