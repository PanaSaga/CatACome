import { SLOTS, SLOT_ICON } from '../tool/tools.js';
import { BREATH_MAX, GRAPPLE_RANGE, currencyText, STATION_DEPTHS, PICK_CD, CAT_CARRY_MAX } from '../data/balance.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), hp: $('hp'), breath: $('breath'), buffs: $('buffs'),
      depth: $('depth'), best: $('best'), copper: $('copper'), bank: $('bank'),
      cats: $('cats'), sonar: $('sonar'), grapple: $('grapple'),
      hotbar: $('hotbar'), scale: $('depthscale'), toasts: $('toasts'),
    };
    this.buildHotbar();
    this.tick = 0;
  }

  show() { this.el.hud.hidden = false; }

  buildHotbar() {
    this.el.hotbar.innerHTML = SLOTS.map((s, i) =>
      `<div class="slot" data-slot="${i}"><span class="n">${i + 1}</span>` +
      `<span class="ico">${SLOT_ICON[s]}</span>` +
      `<span class="lv"></span><span class="c"></span><span class="cd" style="transform:scaleY(0)"></span></div>`
    ).join('');
    this.slotEls = [...this.el.hotbar.querySelectorAll('.slot')];
  }

  toast(msg, ms = 2200) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  update() {
    const g = this.game;
    if (++this.tick % 3 !== 0) { this.updateFast(); return; }
    this.updateFast();

    const p = g.player;
    this.el.hp.textContent = '❤'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, p.maxHp - p.hp));

    const depth = Math.max(0, p.depthM);
    this.el.depth.textContent = `${depth.toFixed(1)} m`;
    this.el.best.textContent = `이번 런 최고 ${g.run.maxDepth.toFixed(1)} m`;
    this.el.copper.textContent = currencyText(g.run.copper);
    this.el.bank.textContent = `예치 ${currencyText(g.profile.bank)}`;
    this.el.cats.textContent = `🐈 ${g.run.cats.length} / ${CAT_CARRY_MAX} · 인계 ${g.run.catsDelivered}`;

    const s = g.sonar;
    const auto = s.canAuto ? (s.auto ? ' · 자동 ON' : ' · 자동 OFF') : '';
    this.el.sonar.innerHTML = `소나 Lv${s.level} <b>${s.cd > 0 ? s.cd.toFixed(1) + 's' : '준비'}</b>` +
      `<span class="sub"> 반경 ${(s.radiusTiles / 2).toFixed(0)}m${auto}</span>`;
    const gl = g.profile.upgrades.grapple;
    this.el.grapple.textContent = `갈고리 Lv${gl} · ${GRAPPLE_RANGE[gl - 1]}타일 (Shift/우클릭) · 곡괭이 등급 ${g.grade()}`;

    // 버프
    const bf = [];
    if (g.buff.t > 0) {
      bf.push(`<div class="buff">전투 버프 6등급 · 소나 +${g.buff.sonarM}m — ${g.buff.t.toFixed(0)}s</div>`);
    }
    this.el.buffs.innerHTML = bf.join('');

    // 슬롯
    this.slotEls.forEach((el, i) => {
      const name = SLOTS[i];
      el.classList.toggle('on', g.tools.slot === i);
      const lvEl = el.querySelector('.lv');
      const cEl = el.querySelector('.c');
      if (name === 'pickaxe') {
        lvEl.textContent = `${g.profile.upgrades.pickSpeed}/${g.profile.upgrades.pickRange}`;
        cEl.textContent = '';
        el.classList.remove('empty');
      } else if (name === 'potion') {
        const n = [1, 2, 3].reduce((a, k) => a + (g.run.potions[k] | 0), 0);
        lvEl.textContent = '';
        cEl.textContent = n || '';
        el.classList.toggle('empty', n === 0);
      } else {
        const n = g.run.items[name] | 0;
        lvEl.textContent = 'L' + g.profile.upgrades[name];
        cEl.textContent = n || '';
        el.classList.toggle('empty', n === 0);
      }
    });

    this.buildScale();
  }

  updateFast() {
    const g = this.game;
    const p = g.player;
    // 숨 게이지
    if (p.breath < BREATH_MAX - 0.01) {
      this.el.breath.hidden = false;
      this.el.breath.querySelector('i').style.width = `${(p.breath / BREATH_MAX) * 100}%`;
    } else this.el.breath.hidden = true;

    // 곡괭이 쿨 링
    const cdEl = this.slotEls[0].querySelector('.cd');
    const max = PICK_CD[g.profile.upgrades.pickSpeed - 1];
    cdEl.style.transform = `scaleY(${Math.max(0, g.tools.pickCd / max)})`;
  }

  buildScale() {
    const g = this.game;
    const d = Math.max(0, g.player.depthM);
    const span = 240; // 위아래 표시 범위(m)
    const html = [];
    for (const sd of STATION_DEPTHS) {
      if (Math.abs(sd - d) > span) continue;
      const t = 0.5 + (sd - d) / (span * 2);
      const known = g.run.stations.has(sd);
      html.push(`<div style="top:${(t * 100).toFixed(1)}%;color:${known ? '#fff' : 'rgba(255,255,255,0.3)'}">E${STATION_DEPTHS.indexOf(sd) + 1} ${sd}m</div>`);
    }
    this.el.scale.innerHTML = html.join('');
  }
}
