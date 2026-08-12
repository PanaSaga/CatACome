// 지상의 집(5개 탭) · 엘리베이터 · 인벤토리 · 랭킹 · 플래그 · 사망
// 패널이 열려 있는 동안 게임 조작은 잠기고, 항목은 전부 마우스 클릭으로 선택한다 (§2)
import {
  PRICES, SHOP_PRICE, SELL_RATE, POTION, FLAG, GRAPPLE_RANGE, SONAR,
  PICK_CD, HP_LEVELS, clinicCost, clinicCap, bankFeeRate, currencyText, M_PER_TILE,
} from '../data/balance.js';
import { fetchLeaderboard, moderate, BACKEND, SEASON } from '../net/api.js';

const UPGRADES = [
  { key: 'pickSpeed', name: '곡괭이 속도', max: 5, detail: (lv) => `스윙 쿨 ${PICK_CD[lv - 1]}s` },
  { key: 'pickRange', name: '곡괭이 범위', max: 5, detail: (lv) => `Lv${lv} — 흙 ${lv}×${lv}` },
  { key: 'sonar', name: '소나', max: 5, detail: (lv) => `반경 ${(SONAR[lv - 1].r * M_PER_TILE)}m · 쿨 ${SONAR[lv - 1].cd}s${lv >= 3 ? ' · 자동' : ''}` },
  { key: 'grapple', name: '갈고리', max: 4, detail: (lv) => `사거리 ${GRAPPLE_RANGE[lv - 1]}타일` },
  { key: 'bomb', name: '폭탄', max: 5, detail: (lv) => `Lv${lv}` },
  { key: 'drill', name: '드릴', max: 5, detail: (lv) => `Lv${lv}` },
  { key: 'laser', name: '레이저', max: 5, detail: (lv) => `Lv${lv}` },
  { key: 'flag', name: '플래그', max: 5, detail: (lv) => `버프 ${FLAG.buffSec[lv - 1] / 60}분 · 소나 +${FLAG.sonarBonusM[lv - 1]}m` },
  { key: 'maxHp', name: '최대 HP', max: 3, detail: (lv) => `HP ${HP_LEVELS[lv - 1]}` },
];

const SHOP_ITEMS = [
  { key: 'bomb', name: '폭탄' },
  { key: 'drill', name: '드릴' },
  { key: 'laser', name: '레이저' },
  { key: 'flag', name: '플래그' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Panels {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('modal');
    this.kind = null;
    this.houseTab = 'upgrade';
    this.boardTab = 'depth';
    this.station = null;
  }

  get open() { return this.kind !== null; }

  close() {
    this.kind = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.game.input.locked = false;
    this.game.input.clearHolds();
  }

  render(kind, html) {
    this.kind = kind;
    this.game.input.locked = true;
    this.game.input.clearHolds();
    this.root.hidden = false;
    this.root.innerHTML = html;
    this.root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
  }

  // ── 지상의 집 ─────────────────────────────────────────────────
  openHouse(tab) {
    if (tab) this.houseTab = tab;
    const g = this.game;
    const tabs = [
      ['upgrade', '업그레이드'], ['shop', '상점'], ['clinic', '의료소'],
      ['bank', '은행'], ['elevator', '엘리베이터'],
    ];
    this.render('house', `
      <div class="panel">
        <header>
          <h2>지상의 집</h2>
          <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${this.houseTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        </header>
        <div class="body" id="houseBody"></div>
        <footer>
          <span class="dim">휴대 <b class="gold">${currencyText(g.run.copper)}</b> · 예치 <b>${currencyText(g.profile.bank)}</b> · 곡괭이 등급 ${g.grade()}</span>
          <button data-close class="ghost">닫기 (Esc)</button>
        </footer>
      </div>`);
    this.root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.openHouse(b.dataset.tab)));
    this.renderHouseBody();
  }

  renderHouseBody() {
    const body = document.getElementById('houseBody');
    if (!body) return;
    const fn = {
      upgrade: () => this.bodyUpgrade(),
      shop: () => this.bodyShop(),
      clinic: () => this.bodyClinic(),
      bank: () => this.bodyBank(),
      elevator: () => this.bodyElevator(),
    }[this.houseTab];
    body.innerHTML = fn();
    this.wireHouseBody(body);
  }

  bodyUpgrade() {
    const g = this.game;
    return `<table><thead><tr><th>항목</th><th>현재</th><th class="num">다음 비용</th><th></th></tr></thead><tbody>` +
      UPGRADES.map((u) => {
        const lv = g.profile.upgrades[u.key];
        const maxed = lv >= u.max;
        const cost = maxed ? 0 : PRICES[u.key][lv - 1];
        const can = !maxed && g.run.copper >= cost;
        return `<tr><td>${u.name}<div class="tag dim">${u.detail(lv)}</div></td>` +
          `<td class="mono">Lv${lv}/${u.max}</td>` +
          `<td class="num mono">${maxed ? '—' : currencyText(cost)}</td>` +
          `<td class="num"><button class="small" data-buy="${u.key}" ${can ? '' : 'disabled'}>${maxed ? 'MAX' : '구매'}</button></td></tr>`;
      }).join('') + '</tbody></table>';
  }

  bodyShop() {
    const g = this.game;
    return `<p class="dim" style="margin-top:0">판매가 = 구매가의 50%. 회복 포션은 취급하지 않는다.</p>` +
      `<table><thead><tr><th>품목</th><th class="num">보유</th><th class="num">구매</th><th class="num">판매</th><th></th></tr></thead><tbody>` +
      SHOP_ITEMS.map((it) => {
        const have = g.run.items[it.key] | 0;
        const buy = SHOP_PRICE[it.key];
        const sell = Math.floor(buy * SELL_RATE);
        return `<tr><td>${it.name} <span class="tag dim">Lv${g.profile.upgrades[it.key]}</span></td>` +
          `<td class="num mono">${have}</td><td class="num mono">${buy}</td><td class="num mono">${sell}</td>` +
          `<td class="num">
             <button class="small" data-shopbuy="${it.key}" data-n="1" ${g.run.copper >= buy ? '' : 'disabled'}>+1</button>
             <button class="small" data-shopbuy="${it.key}" data-n="10" ${g.run.copper >= buy * 10 ? '' : 'disabled'}>+10</button>
             <button class="small" data-shopsell="${it.key}" ${have > 0 ? '' : 'disabled'}>−1</button>
           </td></tr>`;
      }).join('') + '</tbody></table>' +
      `<p class="dim">보유 포션 — ${[1, 2, 3].map((k) => `${POTION[k].name} ${g.run.potions[k] | 0}`).join(' · ')}</p>`;
  }

  bodyClinic() {
    const g = this.game;
    const grade = g.grade();
    const n = g.run.clinicUses + 1;
    const cost = clinicCost(n, grade);
    const full = g.player.hp >= g.player.maxHp;
    const can = !full && g.run.copper >= cost;
    return `<p style="margin-top:0">1회 이용 = 풀힐. 비용은 이용마다 2배로 오르고, 곡괭이 등급별 상한에서 멈춘다.</p>
      <table><tbody>
        <tr><td>현재 HP</td><td class="num mono">${g.player.hp} / ${g.player.maxHp}</td></tr>
        <tr><td>이번 런 이용 횟수</td><td class="num mono">${g.run.clinicUses}회</td></tr>
        <tr><td>${n}번째 이용 비용</td><td class="num mono gold">${currencyText(cost)}</td></tr>
        <tr><td>등급 ${grade} 상한</td><td class="num mono">${currencyText(clinicCap(grade))}</td></tr>
      </tbody></table>
      <button class="primary" data-clinic ${can ? '' : 'disabled'} style="margin-top:12px">
        ${full ? 'HP가 이미 최대다' : `치료받기 (${currencyText(cost)})`}
      </button>`;
  }

  bodyBank() {
    const g = this.game;
    const grade = g.grade();
    const fee = bankFeeRate(grade);
    return `<p style="margin-top:0">예치금은 <b>사망해도 보존</b>된다. 수수료 = 곡괭이 등급 % (지금 <b class="gold">${(fee * 100).toFixed(0)}%</b>) · 인출은 무료 · 한도 없음.</p>
      <table><tbody>
        <tr><td>휴대 재화 <span class="tag dim">사망 시 소실</span></td><td class="num mono gold">${currencyText(g.run.copper)}</td></tr>
        <tr><td>예치금</td><td class="num mono">${currencyText(g.profile.bank)}</td></tr>
      </tbody></table>
      <label style="margin-top:12px">금액<input id="bankAmt" type="number" min="1" step="1" value="${g.run.copper || 0}" /></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button data-bank="dep">예치</button>
        <button data-bank="depall" ${g.run.copper > 0 ? '' : 'disabled'}>전액 예치</button>
        <button data-bank="wd">인출</button>
        <button data-bank="wdall" ${g.profile.bank > 0 ? '' : 'disabled'}>전액 인출</button>
      </div>
      <p class="dim" id="bankPreview"></p>`;
  }

  bodyElevator() {
    const g = this.game;
    const here = g.currentPlace();
    const rows = [`<div class="row ${here === 'surface' ? 'disabled' : ''}" data-go="surface">
        <span class="grow">지상 — 집</span>
        <span class="tag">${here === 'surface' ? '← 현재 위치' : '업그레이드 · 상점 · 은행'}</span></div>`];
    const list = [...g.objects.stations].filter((s) => s.discovered).sort((a, b) => a.depthM - b.depthM);
    for (const s of list) {
      const cur = here === s.id;
      rows.push(`<div class="row ${cur ? 'disabled' : ''}" data-go="${s.id}">
        <span class="grow">E${s.index} <span class="dim mono">x ${s.x}</span></span>
        <span class="mono">−${s.depthM} m</span>
        <span class="tag">${cur ? '← 현재 위치' : s.cats ? `고양이 ${s.cats}` : ''}</span></div>`);
    }
    if (list.length === 0) rows.push('<p class="dim">아직 발견한 정거장이 없다. 사망하면 발견 기록이 초기화된다.</p>');
    return `<div class="rows" style="max-height:44vh;overflow-y:auto">${rows.join('')}</div>`;
  }

  wireHouseBody(body) {
    const g = this.game;
    body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.buy;
      const u = UPGRADES.find((x) => x.key === key);
      const lv = g.profile.upgrades[key];
      if (lv >= u.max) return;
      const cost = PRICES[key][lv - 1];
      if (g.run.copper < cost) { g.sfx.play('error'); return; }
      b.disabled = true; // 연타 중복 구매 방지 (§11-2)
      g.run.copper -= cost;
      g.profile.upgrades[key] = lv + 1;
      if (key === 'maxHp') { g.player.maxHp = HP_LEVELS[g.profile.upgrades.maxHp - 1]; g.player.heal(1); }
      g.saveProfile();
      g.sfx.play('buy');
      g.toast(`${u.name} Lv${lv + 1}`);
      this.openHouse('upgrade');
    }));

    body.querySelectorAll('[data-shopbuy]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.shopbuy;
      const n = +b.dataset.n;
      const cost = SHOP_PRICE[key] * n;
      if (g.run.copper < cost) { g.sfx.play('error'); return; }
      g.run.copper -= cost;
      g.run.items[key] = (g.run.items[key] | 0) + n;
      g.sfx.play('buy');
      this.openHouse('shop');
    }));
    body.querySelectorAll('[data-shopsell]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.shopsell;
      if ((g.run.items[key] | 0) <= 0) return;
      g.run.items[key]--;
      g.run.copper += Math.floor(SHOP_PRICE[key] * SELL_RATE);
      g.sfx.play('buy');
      this.openHouse('shop');
    }));

    const clinic = body.querySelector('[data-clinic]');
    if (clinic) clinic.addEventListener('click', () => {
      const cost = clinicCost(g.run.clinicUses + 1, g.grade());
      if (g.player.hp >= g.player.maxHp || g.run.copper < cost) { g.sfx.play('error'); return; }
      g.run.copper -= cost;
      g.run.clinicUses++;
      g.player.hp = g.player.maxHp;
      g.sfx.play('potion');
      g.toast('풀힐');
      this.openHouse('clinic');
    });

    const amtEl = body.querySelector('#bankAmt');
    body.querySelectorAll('[data-bank]').forEach((b) => b.addEventListener('click', () => {
      const mode = b.dataset.bank;
      const grade = g.grade();
      const fee = bankFeeRate(grade);
      let amt = Math.floor(+((amtEl && amtEl.value) || 0));
      if (mode === 'depall') amt = g.run.copper;
      if (mode === 'wdall') amt = g.profile.bank;
      if (!(amt > 0)) { g.sfx.play('error'); return; }
      if (mode.startsWith('dep')) {
        amt = Math.min(amt, g.run.copper);
        const cut = Math.floor(amt * fee);
        g.run.copper -= amt;
        g.profile.bank += amt - cut; // 수수료는 예치액에서 차감 (§11-2)
        g.toast(`${currencyText(amt - cut)} 예치 (수수료 ${currencyText(cut)})`);
      } else {
        amt = Math.min(amt, g.profile.bank);
        g.profile.bank -= amt;
        g.run.copper += amt;
        g.toast(`${currencyText(amt)} 인출 — 이제 사망 시 소실된다`);
      }
      g.saveProfile();
      g.sfx.play('buy');
      this.openHouse('bank');
    }));

    body.querySelectorAll('[data-go]').forEach((r) => {
      if (r.classList.contains('disabled')) return;
      r.addEventListener('click', () => {
        this.close();
        this.game.travelTo(r.dataset.go);
      });
    });
  }

  // ── 엘리베이터 (정거장에서 열 때) ─────────────────────────────
  openElevator(station) {
    const g = this.game;
    this.station = station;
    this.render('elevator', `
      <div class="panel">
        <header><h2>엘리베이터 — E${station.index} (−${station.depthM} m)</h2></header>
        <div class="body" id="houseBody"></div>
        <footer>
          <span class="dim">휴대 <b class="gold">${currencyText(g.run.copper)}</b></span>
          <button data-close class="ghost">닫기 (Esc)</button>
        </footer>
      </div>`);
    this.houseTab = 'elevator';
    this.renderHouseBody();
  }

  // ── 인벤토리 ──────────────────────────────────────────────────
  openInventory() {
    const g = this.game;
    this.render('inventory', `
      <div class="panel">
        <header><h2>인벤토리</h2></header>
        <div class="body">
          <table><tbody>
            <tr><td>휴대 재화 <span class="tag dim">사망 시 소실</span></td><td class="num mono gold">${currencyText(g.run.copper)}</td></tr>
            <tr><td>은행 예치금 <span class="tag dim">사망해도 보존</span></td><td class="num mono">${currencyText(g.profile.bank)}</td></tr>
            ${SHOP_ITEMS.map((i) => `<tr><td>${i.name} <span class="tag dim">Lv${g.profile.upgrades[i.key]}</span></td><td class="num mono">${g.run.items[i.key] | 0}</td></tr>`).join('')}
            ${[1, 2, 3].map((k) => `<tr><td>${POTION[k].name} 포션 <span class="tag dim">HP +${POTION[k].heal}</span></td><td class="num mono">${g.run.potions[k] | 0}</td></tr>`).join('')}
            <tr><td>운반 중인 고양이</td><td class="num mono">${g.run.cats.length} / 2</td></tr>
            <tr><td>이번 런 인계</td><td class="num mono">${g.run.catsDelivered}</td></tr>
            <tr><td>이번 런 최고 깊이</td><td class="num mono">${g.run.maxDepth.toFixed(1)} m</td></tr>
          </tbody></table>
        </div>
        <footer><span class="dim">시즌 ${SEASON.id} · ${BACKEND.note}</span><button data-close class="ghost">닫기 (Tab/Esc)</button></footer>
      </div>`);
  }

  // ── 랭킹 ──────────────────────────────────────────────────────
  async openLeaderboard(after) {
    const tabs = [['depth', '최고 깊이'], ['cats', '최다 구출'], ['seasonCats', '시즌 누적 구출']];
    const data = await fetchLeaderboard(this.boardTab);
    const unit = this.boardTab === 'depth' ? ' m' : '마리';
    const rows = data.top.map((r) => `<tr class="${r.token === data.me?.token ? 'me-row' : ''}">
        <td class="mono">${r.rank}</td><td>${esc(r.name || '무명')}</td><td class="num mono">${r.value}${unit}</td></tr>`).join('');
    const meRow = data.me && data.me.rank > 10
      ? `<tr class="me-row"><td class="mono">${data.me.rank}</td><td>${esc(data.me.name || '무명')}</td><td class="num mono">${data.me.value}${unit}</td></tr>`
      : '';
    this.render('board', `
      <div class="panel">
        <header><h2>랭킹</h2>
          <div class="tabs">${tabs.map(([k, n]) => `<button data-board="${k}" class="${this.boardTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        </header>
        <div class="body">
          ${data.top.length ? `<table><thead><tr><th>#</th><th>이름</th><th class="num">기록</th></tr></thead>
            <tbody>${rows}${meRow ? `<tr><td colspan="3" class="dim" style="text-align:center">⋯</td></tr>${meRow}` : ''}</tbody></table>`
        : '<p class="dim">아직 기록이 없다. 한 번 죽어야 등록된다.</p>'}
        </div>
        <footer><span class="dim">${BACKEND.note}</span>
        <button data-close class="ghost">닫기</button></footer>
      </div>`);
    this.root.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => {
      this.boardTab = b.dataset.board;
      this.openLeaderboard(after);
    }));
    this.afterBoard = after;
  }

  // ── 플래그 ────────────────────────────────────────────────────
  openFlagInput() {
    const g = this.game;
    this.render('flagInput', `
      <div class="panel" style="min-width:380px">
        <header><h2>플래그 남기기</h2></header>
        <div class="body">
          <p class="dim" style="margin-top:0">${FLAG.msgLen}자 이내. 읽는 사람은 회복 +${FLAG.heal[g.profile.upgrades.flag - 1]},
            전투 버프(6등급)와 소나 +${FLAG.sonarBonusM[g.profile.upgrades.flag - 1]}m를
            ${FLAG.buffSec[g.profile.upgrades.flag - 1] / 60}분간 받는다.</p>
          <label>메시지<input id="flagMsg" maxlength="${FLAG.msgLen}" placeholder="여기 금맥 많음" /></label>
          <div class="err" id="flagErr"></div>
        </div>
        <footer><span class="dim">보유 플래그 ${g.run.items.flag | 0}개</span>
          <span><button data-close class="ghost">취소</button>
          <button class="primary" id="flagOk">세우기</button></span></footer>
      </div>`);
    const input = document.getElementById('flagMsg');
    input.focus();
    const submit = () => {
      const res = moderate(input.value, FLAG.msgLen);
      if (!res.ok) { document.getElementById('flagErr').textContent = res.reason; return; }
      this.close();
      g.confirmFlag(res.text);
    };
    document.getElementById('flagOk').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  openFlagRead(flag, effect) {
    this.render('flagRead', `
      <div class="panel" style="min-width:360px">
        <header><h2>플래그 — ${esc(flag.owner || '무명')} <span class="tag dim">Lv${flag.level}</span></h2></header>
        <div class="body">
          <p style="font-size:17px;margin:4px 0 14px">“${esc(flag.msg)}”</p>
          ${effect
        ? `<p class="ok">HP +${effect.heal} · 전투 버프 6등급 · 소나 +${effect.sonarM}m · ${effect.sec}초</p>`
        : '<p class="dim">이 플래그의 버프는 이미 받았다. (플래그당 1회)</p>'}
        </div>
        <footer><span></span><button data-close class="primary">확인</button></footer>
      </div>`);
  }

  // ── 사망 ──────────────────────────────────────────────────────
  openDeath(s) {
    this.render('death', `
      <div class="panel" style="min-width:400px">
        <header><h2>사망 — ${esc(s.cause)}</h2></header>
        <div class="body">
          <div class="deathbox">
            <div class="dim">최고 깊이</div>
            <div class="big">${s.depth.toFixed(1)} m</div>
          </div>
          <div class="statgrid">
            <div>구출한 고양이<b>${s.cats}마리</b></div>
            <div>잃은 휴대 재화<b class="bad">${currencyText(s.lostCopper)}</b></div>
            <div>남은 예치금<b class="ok">${currencyText(s.bank)}</b></div>
            <div>플레이 시간<b>${Math.floor(s.sec / 60)}분 ${Math.floor(s.sec % 60)}초</b></div>
          </div>
          <p class="dim">잃은 것 — 휴대 재화 · 소모 아이템 · 운반 중이던 고양이 · 지형 변경분 · 정거장 발견 기록<br />
             남은 것 — 구매한 업그레이드 · 은행 예치금</p>
        </div>
        <footer>
          <button class="ghost" id="deathBoard">랭킹 보기</button>
          <button class="primary" id="deathRestart">다시 내려가기</button>
        </footer>
      </div>`);
    document.getElementById('deathRestart').addEventListener('click', () => {
      this.close();
      this.game.startRun();
    });
    document.getElementById('deathBoard').addEventListener('click', () => this.openLeaderboard('death'));
  }
}
