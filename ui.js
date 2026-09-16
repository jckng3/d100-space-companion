/* ============================================================
   D100 Space Companion — ui.js
   Tabbed SPA. All interaction via inline onclick (innerHTML-safe).
   Tabs: Dice | Captain | Ship | Away | Space | Port | Tables | Galaxy
   ============================================================ */

let G = loadState() || saveState(defaultState());
let currentTab = 'dice';

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
function commit() { saveState(G); }
function addLog(text) { G = pushLog(G, text); commit(); }

/* ---------- tabs ---------- */
const TABS = [
  ['dice', '🎲 Dice'], ['captain', '🧑‍🚀 Captain'], ['ship', '🚀 Ship'],
  ['away', '🛸 Away Mission'], ['space', '⚔️ Space Combat'], ['port', '🏗️ Port'],
  ['tables', '📋 Tables'], ['galaxy', '🌌 Galaxy']
];
function renderTabs() {
  $('tabs').innerHTML = TABS.map(([id, label]) =>
    `<button class="${currentTab === id ? 'on' : ''}" onclick="switchTab('${id}')">${label}</button>`).join('');
}
function switchTab(id) { currentTab = id; renderTabs(); renderView(); window.scrollTo(0, 0); }
/* ============ WHAT NOW? next-step checklist (state-aware) ============ */
window.whatNext = () => {
  const c = G.captain, s = G.ship, port = G.port || (G.port = newPortPhase());
  const sc = G.spaceCombat || (G.spaceCombat = newSpaceCombat());
  const out = [];
  const today = c.year + '.' + String(c.month).padStart(2, '0') + '.' + String(c.day).padStart(2, '0');
  if (sc.active) return '<b>Space combat round ' + (sc.round + 1) + '</b> — pick a Tactical Decision, then resolve the round.';
  if (G.away.combat && G.away.combat.active) return '<b>Personal combat</b> — Attack, act for the enemy, or try to escape.';
  if (sc.boarding) return '<b>Boarding round</b> — Int +/- BM test (loser loses 1d10 LS).';
  if (port.docked) {
    out.push('You are docked — work the Port Phase: dock fee (if unpaid), Medic if HP low, Supplies/Fuel, trade cargo, missions board, passengers');
    if (c.hp < c.hpMax) out.push('Medic: HP ' + c.hp + '/' + c.hpMax + ' — heal at 20c/HP');
    if (s.current.power < (s.power || 40) || s.current.fuel < (s.fuel || 60)) out.push('Refuel/recharge at Shipyard (10c, LS first)');
    if ((c.cargo || []).length) out.push('Cargo hold: ' + c.cargo.length + ' lot(s) — check sell prices before leaving');
    if ((c.missions || []).some(m => !m.done)) out.push('Active missions: ' + c.missions.filter(m => !m.done).length + ' — progress or complete them');
    out.push('Then: undock (spend AP) and pick a destination');
  } else {
    out.push('In space, star date ' + today + ' (AP ' + (c.apUsed || 0) + '/' + c.apQuota + ')');
    const due = (c.triggers || []).filter(t => t.arrow && t.date <= today);
    if (due.length) out.push(due.length + ' trigger date(s) due TODAY — resolve before continuing');
    if (s.current.power < 3 || s.current.fuel < 10) out.push('Low PL (' + s.current.power + ') or fuel (' + s.current.fuel + ') — plan a port stop');
    out.push('Travel: combined jump (Galaxy tab) or explore a zone (space cruise tests)');
    out.push('Daily event check when the book calls for one (Events card)');
    if (c.apUsed >= c.apQuota) out.push('AP quota spent — Next day (or Push Action)');
  }
  return '<ul style="margin:4px 0 0 16px;padding:0">' + out.map(x => '<li style="margin:2px 0">' + x + '</li>').join('') + '</ul>';
};
/* ============ CARGO HOLD ============ */
window.cargoBuy = () => {
  const com = ($('cargoCom') || {}).value;
  const qty = parseInt(($('cargoQty') || {}).value) || 1;
  const price = parseInt(($('cargoPrice') || {}).value) || 0;
  if (!com) return toast('Pick a commodity');
  const cost = qty * price;
  if (G.captain.credits < cost) return toast('Need ' + cost + 'c');
  G.captain.credits -= cost;
  G.captain.cargo = G.captain.cargo || [];
  const sys = curSystemName();
  const lot = G.captain.cargo.find(x => x.commodity === com && x.system === sys);
  if (lot) { lot.qty += qty; lot.unitCost = Math.round((lot.unitCost * (lot.qty - qty) + price * qty) / lot.qty); }
  else G.captain.cargo.push({ commodity: com, qty, unitCost: price, system: sys });
  econTrade(com, true);
  addLog('Bought ' + qty + ' ' + com + ' @ ' + price + 'c (−' + cost + 'c)');
  commit(); renderView();
};
window.cargoSell = (idx, qty) => {
  const lot = (G.captain.cargo || [])[idx];
  if (!lot) return;
  qty = Math.min(qty, lot.qty);
  const price = parseInt(($('cargoPrice') || {}).value) || lot.unitCost;
  const gain = qty * price;
  const profit = qty * (price - lot.unitCost);
  G.captain.credits += gain;
  lot.qty -= qty;
  if (lot.qty <= 0) G.captain.cargo.splice(idx, 1);
  econTrade(lot.commodity, false);
  addLog('Sold ' + qty + ' ' + lot.commodity + ' @ ' + price + 'c (+' + gain + 'c, profit ' + (profit >= 0 ? '+' : '') + profit + 'c)');
  commit(); renderView();
};
function curSystemName() {
  const g = G.galaxy;
  return (g && g.selKey && g.systems && g.systems[g.selKey] && g.systems[g.selKey].name) || (g && g.systems && Object.keys(g.systems).length ? (g.systems[Object.keys(g.systems)[0]].name || 'unknown') : 'unknown');
}
/* ============ MISSIONS LEDGER ============ */
window.missionAdd = () => {
  const text = ($('misText') || {}).value;
  const reward = ($('misReward') || {}).value || '';
  const days = parseInt(($('misDays') || {}).value) || 0;
  if (!text) return toast('Describe the mission');
  let deadline = null;
  if (days > 0) {
    let d = G.captain.day, m = G.captain.month, y = G.captain.year, left = days;
    while (left-- > 0) { d++; if (d > 30) { d = 1; m++; } if (m > 12) { m = 1; y++; } }
    deadline = y + '.' + String(m).padStart(2, '0') + '.' + String(d).padStart(2, '0');
  }
  G.captain.missions = G.captain.missions || [];
  G.captain.missions.push({ id: 'M' + (G.captain.missions.length + 1), text, reward, deadline, done: false });
  addLog('Mission added: ' + text + (deadline ? ' (by ' + deadline + ')' : '') + (reward ? ' [' + reward + ']' : ''));
  commit(); renderView();
};
window.missionDone = (idx, ok) => {
  const m = (G.captain.missions || [])[idx];
  if (!m) return;
  m.done = true; m.failed = !ok;
  if (ok) { addLog('Mission complete: ' + m.text + (m.reward ? ' — ' + m.reward : '')); }
  else { addLog('Mission FAILED: ' + m.text); }
  commit(); renderView();
};
/* ============ REPAIRS (Engineers) ============ */
window.shipRepair = () => {
  const cm = controlModifier(G.captain, G.ship);
  const target = G.captain.int.primary + cm;
  const r = Dice.test(target, 0);
  if (r.outcome.includes('success')) {
    const d = Dice.d10();
    const maxPl = (typeof G.ship.power === 'number') ? G.ship.power : 40;
    G.ship.current.power = Math.min(maxPl, G.ship.current.power + d);
    addLog('REPAIRS success ' + r.raw + ' vs ' + r.target + ' — PL +' + d + ' -> ' + G.ship.current.power);
  } else {
    const d = Dice.d10();
    G.ship.current.power = Math.max(0, G.ship.current.power - d);
    addLog('REPAIRS failed ' + r.raw + ' vs ' + r.target + ' — PL −' + d + ' -> ' + G.ship.current.power);
  }
  spendAP(1, 'Repairs');
  commit(); renderView();
};
/* ============ SHIP DAMAGE TABLE (1d6) ============ */
const SHIP_DAMAGE = {
  1: 'Controls damaged — all controls offline. Test REPAIRS until passed.',
  2: 'Hull breach — LS −1d3 immediately.',
  3: 'Weapon systems damaged — weapon attacks at −20 Dex until repaired (REPAIRS).',
  4: 'Engine damaged — JS halved until repaired (REPAIRS).',
  5: 'Fuel leak — lose 1d6 fuel per day until repaired (REPAIRS).',
  6: 'Fire! — 1d3 PL per round until repaired (REPAIRS) or 3 rounds pass.'
};
window.rollShipDamage = () => {
  const n = Dice.d6();
  const txt = SHIP_DAMAGE[n];
  G.ship.damageNote = txt;
  addLog('Ship damage 1d6 = ' + n + ': ' + txt);
  const out = $('spaceOut');
  if (out) out.innerHTML += '<div class="badge">Damage 1d6=' + n + '</div><div>' + esc(txt) + '</div>';
  commit();
};
function renderView() {
  const v = $('view');
  ({ dice: renderDice, captain: renderCaptain, ship: renderShip, away: renderAway,
     space: renderSpace, port: renderPort, tables: renderTables, galaxy: renderGalaxy }[currentTab])(v);
  renderTabs();
}

/* BOOK ART: splash banners + reference diagrams extracted from the rulebook PDFs */
const ART = {
  dice:    ['art/hero-bridge.webp',   'Ship bridge'],
  captain: ['art/hero-marine.webp',   'Marine in the city'],
  ship:    ['art/hero-ship.webp',     'Starship over a molten world'],
  away:    ['art/hero-skulls.webp',   'Last stand'],
  space:   ['art/hero-fleet.webp',    'Capital ship escort'],
  port:    ['art/hero-arrival.webp',  'Ship arriving at the docks'],
  tables:  ['art/hero-station.webp',  'Deep space habitat'],
  galaxy:  ['art/hero-ring.webp',     'Gateway ring']
};
function artBanner() {
  const a = ART[currentTab];
  return a ? '<img src="' + a[0] + '" alt="' + a[1] + '" style="width:100%;border-radius:10px;margin-bottom:10px;max-height:150px;object-fit:cover" loading="lazy">' : '';
}
window.crewPortrait = () => {
  const pool = ['art/crew-merc.webp', 'art/crew-power.webp', 'art/crew-meditate.webp', 'art/crew-soldier.webp'];
  return pool[Math.floor(Math.random() * pool.length)];
};
/* ============================ DICE ============================ */
let rollHistory = [];
function renderDice(v) {
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Quick Dice</h3>
    <div class="row">
      <button class="primary" onclick="rollQuick('d6')">d6</button>
      <button class="primary" onclick="rollQuick('d10')">d10</button>
      <button class="primary" onclick="rollQuick('d100')">d100</button>
      <button class="primary" onclick="rollQuick('d3')">d3</button>
      <button onclick="rollQuick('2d6')">2d6</button>
    </div>
  </div>
  <div class="card"><h3>Test (d100 ≤ characteristic)</h3>
    <div class="row">
      <div><label>Characteristic value</label><input type="number" id="tChar" value="${G.captain.dex.primary}" style="width:90px"></div>
      <div><label>Modifier</label><input type="number" id="tMod" value="0" style="width:70px"></div>
      <div><label>Skill bonus</label><input type="number" id="tSkill" value="0" style="width:70px"></div>
      <button class="primary" onclick="doTest()">Roll Test</button>
    </div>
    <div id="testOut" style="margin-top:10px"></div>
  </div>
  <div class="card"><h3>Custom Roll</h3>
    <div class="row">
      <input id="customSpec" placeholder="e.g. 3d6+2, 1d100-10, d3" style="flex:1;min-width:160px">
      <button class="primary" onclick="rollCustom()">Roll</button>
    </div>
    <div id="customOut" style="margin-top:8px"></div>
  </div>
  <div class="card"><h3>Hit Location (d6)</h3>
    <div class="row"><button onclick="rollHitLoc()">Roll Location</button><div id="hitOut"></div></div>
  </div>
  <div class="card"><h3>History</h3><div id="rollHistory"></div></div>`;
  renderHistory();
}
function rollQuick(spec) {
  const r = Dice.roll(spec);
  rollHistory.unshift(`${spec} → ${r.total} ${JSON.stringify(r.rolls)}`);
  renderHistory(); addLog(`🎲 ${spec} = ${r.total}`);
  toast(`${spec}: ${r.total}`);
}
function rollCustom() {
  try {
    const r = Dice.roll($('customSpec').value);
    $('customOut').innerHTML = `<span class="roll-result">${r.total}</span> <span class="badge">rolls: ${r.rolls.join(', ')} mod: ${r.mod >= 0 ? '+' : ''}${r.mod}</span>`;
    rollHistory.unshift(`${r.spec} → ${r.total}`); renderHistory(); addLog(`🎲 ${r.spec} = ${r.total}`);
  } catch (e) { toast('Bad dice spec'); }
}
function doTest() {
  const r = Dice.test(parseInt($('tChar').value) || 0, parseInt($('tMod').value) || 0, parseInt($('tSkill').value) || 0);
  const cls = r.outcome.includes('success') ? 'success' : 'fail';
  const label = { 'critical-success': 'CRITICAL SUCCESS (01)', 'critical-fail': 'CRITICAL FAIL (100)',
                  'success': 'SUCCESS', 'fail': 'FAIL' }[r.outcome];
  $('testOut').innerHTML = `<span class="roll-result ${cls}">${r.raw} — ${label}</span>
    <div class="badge">target ${r.target} = char ${r.target - r.modifier - r.skillBonus} ${r.modifier >= 0 ? '+' : ''}${r.modifier} ${r.skillBonus ? '+' + r.skillBonus + ' skills' : ''}</div>
    ${r.xp ? '<div class="badge">★ natural ≤10 — shade 1 XP pip (characteristic) or 2 pips (assist skills)</div>' : ''}`;
  rollHistory.unshift(`test vs ${r.target} → ${r.raw} ${label}`); renderHistory();
  addLog(`🎯 test vs ${r.target}: rolled ${r.raw} — ${label}`);
}
function rollHitLoc() {
  const locs = ['Head (+3)', 'Body (+2)', 'Vitals (+1)', 'Waist (+0)', 'Arms (−1)', 'Legs (−1)'];
  const r = Dice.d6();
  $('hitOut').innerHTML = `<span class="roll-result">${locs[r - 1]}</span>`;
  rollHistory.unshift(`hit location → ${locs[r - 1]}`); renderHistory();
}
function renderHistory() {
  const el = $('rollHistory'); if (!el) return;
  el.innerHTML = rollHistory.length ? rollHistory.slice(0, 30).map(h => `<div>${esc(h)}</div>`).join('')
    : '<div class="empty">No rolls yet.</div>';
}

/* ============================ CAPTAIN ============================ */
function renderCaptain(v) {
  const c = G.captain;
  const portrait = crewPortrait();
  const pipRow = (label, obj, max = 10, color = 'gold') =>
    `<div class="row"><div style="min-width:120px"><label>${label}</label></div>
     <div class="pips">${pips(obj.pips, max, `capPip('${label === 'Str' ? 'str' : label === 'Dex' ? 'dex' : 'int' === 'int' ? 'int' : label}', ${max})`)}</div></div>`;
  const skillRows = Object.entries(c.skills).map(([name, s]) => `
    <tr><td>${name}</td><td>${s.bonus > 0 ? '+' : ''}${s.bonus}</td>
    <td><span class="pips">${pips(s.pips, 10, `skillPip('${name}',1)`)}</span></td>
    <td><input type="checkbox" ${s.star ? 'checked' : ''} onclick="skillStar('${name}',this.checked)"></td></tr>`).join('');
  v.innerHTML = artBanner() + `
  <div class="card"><h3>🧭 What now?</h3><div id="whatNextOut" style="font-size:13px">${whatNext()}</div></div>
  <div class="card"><h3>Captain</h3>
    <div class="row">
      <img src="${portrait}" alt="Captain portrait" style="width:110px;border-radius:10px;object-fit:cover;max-height:220px" loading="lazy">
      <div><label>Name</label><input value="${esc(c.name)}" onchange="capSet('name',this.value)"></div>
      <div><label>Race</label><select onchange="capSet('race',this.value)">
        ${['Human','Alien','Cyboid'].map(r => `<option ${c.race === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div><label>Career</label><select onchange="capSet('career',this.value)">
        ${['Marine','Smuggler','Techno'].map(r => `<option ${c.career === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    </div>
  </div>
  <div class="card"><h3>Characteristics &amp; Status</h3>
    <div class="row">
      <div class="stat"><b><input type="number" value="${c.str.primary}" style="width:52px;background:none;border:none;color:var(--gold-bright);font-size:18px" onchange="capStat('str',this.value)"></b><span>STR</span></div>
      <div class="stat"><b><input type="number" value="${c.dex.primary}" style="width:52px;background:none;border:none;color:var(--gold-bright);font-size:18px" onchange="capStat('dex',this.value)"></b><span>DEX</span></div>
      <div class="stat"><b><input type="number" value="${c.int.primary}" style="width:52px;background:none;border:none;color:var(--gold-bright);font-size:18px" onchange="capStat('int',this.value)"></b><span>INT</span></div>
      <div class="stat"><b><input type="number" value="${c.hp}" style="width:52px;background:none;border:none;color:var(--gold-bright);font-size:18px" onchange="capSet('hp',+this.value)"></b><span>HP</span></div>
      <div class="stat"><b>${c.rep}</b><span>REP</span></div>
      <div class="stat"><b>${c.karma}</b><span>KARMA</span></div>
      <div class="stat"><b>${c.life}</b><span>LIFE</span></div>
      <div class="stat"><b><input type="number" value="${c.credits}" style="width:70px;background:none;border:none;color:var(--gold-bright);font-size:18px" onchange="capSet('credits',+this.value)"></b><span>CREDITS</span></div>
    </div>
    <div class="row" style="margin-top:10px">
      <button onclick="capBump('hp',-1)">−1 HP</button><button onclick="capBump('hp',1)">+1 HP</button>
      <button onclick="capBump('karma',-1)">Spend Karma (reroll)</button>
      <button class="danger" onclick="capBump('life',-1)">Use Life Point</button>
    </div>
  </div>
  <div class="card"><h3>Armour &amp; Energy Shield (by location)</h3>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      ${['Head','Body','Vitals','Waist','Arms','Legs'].map(loc => {
        const ar = (c.armour = c.armour || {});
        return `<div class="stat"><b><input type="number" value="${ar[loc] || 0}" style="width:44px;background:none;border:none;color:var(--gold-bright);font-size:16px" onchange="capArmour('${loc}',+this.value)"></b><span>${loc} A</span></div>`;
      }).join('')}
      <div class="stat"><b><input type="number" value="${c.energyShield || 0}" style="width:44px;background:none;border:none;color:var(--cyan-bright);font-size:16px" onchange="capSet('energyShield',+this.value)"></b><span>ES</span></div>
    </div>
    <div style="font-size:11px;opacity:.75;margin-top:6px">Enemy hits deduct the armour value of the struck location from damage; leftover damage is absorbed by ES until it runs out.</div>
  </div>
  <div class="card"><h3>Supplies Tracks</h3>
    ${['o2','nv','rations','decoders','powerCells'].map(k =>
      `<div class="row" style="margin-bottom:6px"><div style="min-width:110px"><label>${k.toUpperCase()}</label></div>
       <div class="pips">${pips(c.tracks[k], 10, `trackPip('${k}')`)}</div></div>`).join('')}
    <div class="row" style="margin-top:6px"><div style="min-width:110px"><label>PASSES</label></div>
      <div class="pips">${pips(c.tracks.passes, 10, 'trackPip(\'passes\')')}</div>
      <button onclick="capBump2('tracks','passes',1)">+Pass</button></div>
  </div>
  <div class="card"><h3>Cybercon™</h3>
    <div class="badge">Power cells: ${c.cybercon.powerCells}/10 — <button onclick="cyberPower(1)">+1</button><button onclick="cyberPower(-1)">−1</button></div>
    <table class="tbl" style="margin-top:8px">
      <tr><th>Slot</th><th>Int level</th><th>Implant</th></tr>
      ${c.cybercon.slots.map((s, i) => `<tr><td>${i + 1}</td><td>${s.intLevel}+</td>
        <td>${s.implant ? esc(s.implant) + ` <button onclick="cyberSlot(${i},null)">remove</button>` : `<button onclick="cyberSlot(${i},prompt('Implant name?'))">install</button>`}</td></tr>`).join('')}
    </table>
  </div>
  <div class="card"><h3>Skills &amp; XP</h3>
    <table class="tbl"><tr><th>Skill</th><th>Bonus</th><th>XP pips (10 = +5, reset)</th><th>★</th></tr>
    ${skillRows}</table>
  </div>
  <div class="card"><h3>Session Log</h3>
    <div style="max-height:160px;overflow-y:auto;font-size:12px;color:var(--dim)">
      ${G.log.slice(0, 40).map(l => `<div>${new Date(l.ts).toLocaleTimeString()} — ${esc(l.text)}</div>`).join('') || '<div class="empty">Nothing yet.</div>'}
    </div></div>`;
}
function pips(on, total, onclick) {
  let h = '';
  for (let i = 0; i < total; i++) h += `<div class="pip ${i < on ? 'on' : ''}" onclick="${onclick}"></div>`;
  return h;
}
/* captain mutations (id-based; re-render after) */
window.capSet = (k, v) => { G.captain[k] = v; commit(); renderView(); };
window.capStat = (k, v) => {
  G.captain[k].primary = parseInt(v) || 0;
  G.captain.abilities.mightyBlow = G.captain.str.primary >= 50;
  G.captain.abilities.perfectAim = G.captain.dex.primary >= 50;
  G.captain.abilities.cybercon = G.captain.int.primary >= 50;
  commit(); renderView();
};
window.capArmour = (loc, val) => { G.captain.armour = G.captain.armour || { Head: 0, Body: 0, Vitals: 0, Waist: 0, Arms: 0, Legs: 0 }; G.captain.armour[loc] = val; commit(); };
window.capBump = (k, d) => { G.captain[k] = Math.max(0, G.captain[k] + d); if (k === 'hp' && G.captain.hp > G.captain.hpMax) G.captain.hp = G.captain.hpMax; commit(); renderView(); };
window.capBump2 = (obj, k, d) => { G.captain[obj][k] = Math.max(0, G.captain[obj][k] + d); commit(); renderView(); };
window.trackPip = k => { G.captain.tracks[k] = (G.captain.tracks[k] + 1) % 11; commit(); renderView(); };
window.skillPip = (name, d) => {
  const s = G.captain.skills[name];
  s.pips = (s.pips + 1) % 11;
  if (s.pips === 0) { s.bonus += 5; toast(`${name} +5!`); addLog(`⭐ ${name} upgraded to +${s.bonus}`); }
  commit(); renderView();
};
window.skillStar = (name, on) => { G.captain.skills[name].star = on; commit(); };
window.cyberPower = d => { G.captain.cybercon.powerCells = Math.min(10, Math.max(0, G.captain.cybercon.powerCells + d)); commit(); renderView(); };
window.cyberSlot = (i, name) => { G.captain.cybercon.slots[i].implant = name; if (name) addLog(`Implant installed: ${name}`); commit(); renderView(); };
window.showSaveMenu = () => {
  const opt = confirm('OK = export save (downloads file)\\nCancel = import save');
  if (opt) {
    const blob = new Blob([exportState(G)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'd100-space-save.json'; a.click();
  } else {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => { try { G = importState(rd.result); commit(); renderView(); toast('Save imported'); } catch (e) { toast('Invalid save'); } }; rd.readAsText(f); };
    inp.click();
  }
};

/* ============================ SHIP ============================ */
function renderShip(v) {
  const s = G.ship;
  const cm = controlModifier(G.captain, s);
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Starship</h3>
    <div class="row">
      <div><label>Name</label><input value="${esc(s.name)}" onchange="shipSet('name',this.value)"></div>
      <div><label>Model</label><input value="${esc(s.model)}" onchange="shipSet('model',this.value)"></div>
    </div>
    <div class="row" style="margin-top:10px">
      <div class="stat"><b>${cm >= 0 ? '+' : ''}${cm}</b><span>CM (Int−TL+crew)</span></div>
      <div class="stat"><b><input type="number" value="${s.current.power}" style="width:46px;background:none;border:none;color:var(--gold-bright)" onchange="shipCur('power',this.value)"></b><span>POWER / ${s.pl}</span></div>
      <div class="stat"><b><input type="number" value="${s.current.fuel}" style="width:46px;background:none;border:none;color:var(--gold-bright)" onchange="shipCur('fuel',this.value)"></b><span>FUEL / ${s.ft}</span></div>
      <div class="stat"><b><input type="number" value="${s.current.lifeSupport}" style="width:46px;background:none;border:none;color:var(--gold-bright)" onchange="shipCur('lifeSupport',this.value)"></b><span>LS / ${s.ls}</span></div>
      <div class="stat"><b><input type="number" value="${s.bridgeCrew}" style="width:46px;background:none;border:none;color:var(--gold-bright)" onchange="shipSet('bridgeCrew',+this.value)"></b><span>BRIDGE CREW</span></div>
    </div>
  </div>
  <div class="card"><h3>Stats (edit to match your sheet)</h3>
    <div class="row">
      ${[['tl','TL'],['cs','CS'],['dt','DT'],['ft','FT'],['fs','FS'],['ls','LS'],['js','JS'],['pg','PG'],['pl','PL'],['ws','WS'],['sg','SG'],['mods','MODS']].map(([k, l]) =>
        `<div><label>${l}</label><input type="number" value="${s[k]}" style="width:60px" onchange="shipSet('${k}',+this.value)"></div>`).join('')}
    </div>
  </div>
  <div class="card"><h3>Jump &amp; Fuel helpers</h3>
    <div class="row">
      <div><label>Light years</label><input type="number" id="lyVal" value="10" style="width:70px"></div>
      <button class="primary" onclick="doJump()">Perform JUMP (Int ±CM)</button>
      <button onclick="fuelScoop()">FUEL SCOOP</button>
      <button onclick="powerGen()">POWER GENERATOR</button>
    </div>
    <div id="shipTestOut" style="margin-top:8px"></div>
  </div>
  <div class="card"><h3>Modifications (${s.modifications.length}/${s.mods})</h3>
    <div id="modList">${s.modifications.map((m, i) => `<div class="row">${esc(m)} <button onclick="shipModRm(${i})">✕</button></div>`).join('') || '<div class="empty">None fitted.</div>'}</div>
    <div class="row" style="margin-top:6px">
      <input id="modName" placeholder="Modification name" style="flex:1;min-width:140px">
      <button onclick="shipModAdd()">Fit mod</button></div>
  </div>`;
}
window.shipSet = (k, v) => { G.ship[k] = v; commit(); renderView(); };
window.shipCur = (k, v) => { G.ship.current[k] = parseInt(v) || 0; commit(); renderView(); };
window.shipModAdd = () => { const n = $('modName').value.trim(); if (!n) return; G.ship.modifications.push(n); commit(); renderView(); };
window.shipModRm = i => { G.ship.modifications.splice(i, 1); commit(); renderView(); };
window.doJump = () => {
  const ly = parseInt($('lyVal').value) || 10;
  const cm = controlModifier(G.captain, G.ship);
  const r = Dice.test(G.captain.dex.primary + cm, (G.ship.dt || 0));
  const fuelCost = Math.max(1, Math.ceil(ly / 10));
  G.ship.current.fuel = Math.max(0, G.ship.current.fuel - fuelCost);
  if (r.outcome.includes('success')) G.ship.current.power = Math.max(0, G.ship.current.power - 1);
  else G.ship.current.power = Math.max(0, G.ship.current.power - 2);
  commit(); renderView();
  $('shipTestOut').innerHTML = `<span class="roll-result ${r.outcome.includes('success') ? 'success' : 'fail'}">${r.raw}</span>
    <span class="badge">JUMP: target ${r.target}, −${fuelCost} fuel, ${r.outcome.includes('success') ? 'travelled (−1 PL)' : 'misjump (−2 PL) — roll table J'}</span>`;
  addLog(`🚀 JUMP ${ly}ly: ${r.raw} vs ${r.target} — ${r.outcome}`);
};
window.fuelScoop = () => {
  const r = Dice.test(G.captain.int.primary, 0);
  const gained = r.outcome.includes('success') ? G.ship.fs : 0;
  G.ship.current.fuel = Math.min(G.ship.ft, G.ship.current.fuel + gained);
  commit(); renderView();
  $('shipTestOut').innerHTML = `<span class="roll-result">${r.raw} vs ${r.target}</span> <span class="badge">${gained ? `+${gained} fuel (FS)` : 'failed — no fuel'}</span>`;
};
window.powerGen = () => {
  const r = Dice.test(G.captain.int.primary, 0);
  const gained = r.outcome.includes('success') ? G.ship.pg : 0;
  G.ship.current.power = Math.min(G.ship.pl, G.ship.current.power + gained);
  commit(); renderView();
  $('shipTestOut').innerHTML = `<span class="roll-result">${r.raw} vs ${r.target}</span> <span class="badge">${gained ? `+${gained} power (PG)` : 'failed'}</span>`;
};

/* ============================ AWAY MISSION ============================ */
let map = null;
function ensureMap() {
  if (!G.away.mapData) { const m = newAwayMap(); G.away.mapData = m; }
  map = G.away.mapData;
}
function renderAway(v) {
  ensureMap();
  const a = G.away;
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Mission</h3>
    <div class="row">
      <button class="${a.active ? 'danger' : 'primary'}" onclick="awayToggle()">${a.active ? 'End Mission' : 'Start Away Mission'}</button>
      <button onclick="awayTurn()">⏱ Advance Turn (time pip)</button>
      <span class="badge">Time: ${a.timePips} pips</span>
      <span class="badge">O2/NV/Rations warnings trigger per book as pips fill</span>
    </div>
  </div>
  <div class="card"><h3>Map — tap cell = place tile · tap again = new tile · Rotate turns it 90°</h3>
    <svg id="awayMap" class="map"></svg>
    <div class="row" style="margin-top:8px">
      <button onclick="mapRotate()">⟳ Rotate</button>
      <button onclick="mapReroll()">🎲 Re-roll tile</button>
      <button onclick="mapClear()">✕ Clear</button>
      <button onclick="mapDoor('N')">+Door N</button><button onclick="mapDoor('S')">+Door S</button>
      <button onclick="mapDoor('E')">+Door E</button><button onclick="mapDoor('W')">+Door W</button>
      <button onclick="rollTable('D-DOORS')">Roll Table D (door)</button>
      <img src="art/door-scifi.webp" alt="Sci-fi door" style="width:100%;max-width:320px;border-radius:8px;margin-top:6px" loading="lazy">
      <button onclick="rollTable('F-FACILITY')">Roll Table F (facility)</button>
      <button onclick="rollTable('G-GEOGRAPHIC')">Roll Table G (geographic)</button>
      <button onclick="searchArea()">🔍 Search area (Table U + colour mod)</button>
    </div>
    <div id="tblOut" style="margin-top:8px"></div>
  </div>
  <div class="card"><h3>Enemies / Combat</h3>
    <div id="enemyList"></div>
    <div class="row" style="margin-top:6px">
      <input id="enName" placeholder="Enemy name" style="flex:1;min-width:120px">
      <div><label>HP</label><input type="number" id="enHP" value="10" style="width:60px"></div>
      <div><label>AV</label><input type="number" id="enAV" value="40" style="width:60px"></div>
      <button class="primary" onclick="enemyAdd()">Add enemy</button>
      <button onclick="rollTable('E-ENEMY')">Roll Table E</button>
      <button class="primary" onclick="combatAttack()">⚔️ Attack</button>
      <button onclick="combatEnemyAct()">🩸 Enemy acts</button>
      <button onclick="combatEscape()">🏃 Escape (Dex −10)</button>
      <div style="font-size:11px;opacity:.75;margin-top:4px">Attack: d100 ≤ stat (melee Str / ranged Dex / smart Int) · damage 1d6 + location mod + Dmg − Def · enemy: d100 ≤ AV, same against your armour</div>
    </div>
    <div id="combatOut" style="margin-top:8px"></div>
  </div>`;
  renderAwayMap($('awayMap'), map, G);
  renderEnemies();
  if (window._lastCombatOut && $('combatOut')) $('combatOut').innerHTML = window._lastCombatOut;
}
window.onMapCellClick = key => {
  const types = [null, 'yellow', 'red', 'green', 'blue'];
  const c = map.cells[key];
  const i = types.indexOf(c.area ? c.area.type : null);
  const next = types[(i + 1) % types.length];
  c.area = next ? { type: next, id: `${next[0].toUpperCase()}${key}` } : null;
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.mapDoor = dir => {
  // add door on the currently selected cell (last clicked)
  if (!window._lastCell) { toast('Tap a cell first'); return; }
  const c = map.cells[window._lastCell];
  c.doors[dir] = c.doors[dir] ? null : '1';
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.mapRotate = () => {
  if (!window._lastCell) { toast('Tap a tile first'); return; }
  const c = map.cells[window._lastCell];
  if (!c.area) { toast('No tile there'); return; }
  c.area.rot = ((c.area.rot || 0) + 90) % 360;
  addLog(`🔄 ${window._lastCell}: rotate ${c.area.rot}°`);
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.mapReroll = () => {
  if (!window._lastCell) { toast('Tap a tile first'); return; }
  const c = map.cells[window._lastCell];
  if (!c.area) { toast('No tile there'); return; }
  const pool = (typeof TILES_BY_TYPE !== 'undefined' && TILES_BY_TYPE[c.area.type]) || [];
  if (pool.length > 1) {
    let next = c.area.label;
    while (next === c.area.label && pool.length > 1) next = pool[Math.floor(Math.random()*pool.length)];
    c.area = { type: c.area.type, label: next, rot: c.area.rot || 0 };
  }
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.mapClear = () => {
  if (!window._lastCell) { toast('Tap a tile first'); return; }
  map.cells[window._lastCell].area = null;
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.onMapCellClick = key => {
  window._lastCell = key;
  const c = map.cells[key];
  if (!c.area) {
    // Book rule: roll d100 on Table F → tile NUMBER (colour is baked into the tile)
    if (typeof TILES_BY_NUMBER !== 'undefined' && TILES_BY_NUMBER.length === 100) {
      const n = Dice.d100();
      const t = TILES_BY_NUMBER[n - 1];
      c.area = { type: t.type, label: t.label };
      addLog(`🗺️ ${key}: Table F ${n} → area ${t.label}`);
    } else {
      // fallback: colour-first model
      let type = ['Y','R','G','B'][Math.floor(Math.random()*4)];
      const pool = (typeof TILES_BY_TYPE !== 'undefined' && TILES_BY_TYPE[type]) || [];
      const label = pool.length ? pool[Math.floor(Math.random()*pool.length)] : type;
      c.area = { type, label };
      addLog(`🗺️ ${key}: area ${label}`);
    }
  } else {
    // cycle: same tile → clear; or re-roll tile of same type
    const pool = (typeof TILES_BY_TYPE !== 'undefined' && TILES_BY_TYPE[c.area.type]) || [];
    if (pool.length > 1) {
      let next = c.area.label;
      while (next === c.area.label && pool.length > 1) next = pool[Math.floor(Math.random()*pool.length)];
      c.area = { type: c.area.type, label: next };
    } else {
      c.area = null;
    }
  }
  commit(); renderAwayMap($('awayMap'), map, G);
};
window.searchArea = () => {
  // Book: Table U roll + modifier by the searched area's colour: Y +0, R +10, G +5, B +20
  const key = window._lastCell;
  let mod = 0, src = 'no area (Y +0)';
  if (key && map.cells[key] && map.cells[key].area) {
    const t = map.cells[key].area.type;
    mod = t === 'R' ? 10 : t === 'G' ? 5 : t === 'B' ? 20 : 0;
    src = `area ${map.cells[key].area.label} (mod ${mod >= 0 ? '+' : ''}${mod})`;
  }
  const t = TABLES['U-UNCOVER'];
  const r = Dice.d100() + mod;
  const row = t.rows.find(x => rollInRange(r, x.roll)) || t.rows[t.rows.length - 1];
  $('tblOut').innerHTML = `<div class="badge">Search d100${mod ? `+${mod}` : ''} = ${r} · ${esc(src)}</div>
    <div style="margin-top:6px"><b>${esc(row.roll)}:</b> ${esc(row.text)}</div>`;
  addLog(`🔍 Search (${src}): ${r} → ${row.roll}`);
};
window.awayToggle = () => { G.away.active = !G.away.active; G.away.timePips = 0; commit(); renderView(); };
window.awayTurn = () => {
  G.away.timePips++;
  const hour = ((G.away.timePips - 1) % 12) + 1; // 12-hour track
  const msgs = [`Time pip ${G.away.timePips} (hour ${hour})`];
  // Enemy symbol checks at hours 3-6: roll 1d10 ≤ (3/4/5/6 - 2)? Book shows numbers 3,4,5,6 above pips 3-6.
  if (hour >= 3 && hour <= 6) {
    const roll = Dice.d10();
    const need = hour; // threshold shown on track for that pip
    if (roll <= need) {
      const e = TABLES['E-ENEMY'];
      const r = Dice.d100();
      const row = e.rows.find(x => rollInRange(r, x.roll)) || e.rows[e.rows.length - 1];
      msgs.push(`⚔️ Enemy check: d10=${roll} ≤ ${need} — ROLL E: ${r} → ${row.text.split('\n')[0].slice(0, 60)}`);
      toast('Enemy encountered! Roll Table E result above.');
    } else msgs.push(`Enemy check: d10=${roll} > ${need} — clear`);
  }
  addLog('⏱ ' + msgs.join(' · '));
  commit(); renderView(); toast(msgs.join(' · ').slice(0, 120));
};
window.rollTable = key => {
  const t = TABLES[key];
  if (!t) { toast('Table missing'); return; }
  const r = Dice.d100();
  const row = t.rows.find(x => rollInRange(r, x.roll)) || t.rows[t.rows.length - 1];
  $('tblOut').innerHTML = `<div class="badge">d100 = ${r} · ${esc(t.table)}</div>
    <div style="margin-top:6px"><b>${esc(row.roll)}:</b> ${esc(row.text)}</div>`;
  addLog(`📋 ${t.table}: ${r} → ${row.roll}`);
};
function rollInRange(roll, range) {
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(range);
  if (m) return roll >= +m[1] && roll <= +m[2];
  const s = /^(\d+)$/.exec(range);
  if (s) return roll === +s[1];
  return false;
}
window.enemyAdd = () => {
  const le = (typeof window._lastEnemy === 'object' && window._lastEnemy) || {};
  const name = $('enName').value.trim() || le.name || 'Enemy';
  G.away.enemies.push({ name,
    hp: +$('enHP').value || (+le.hp || 10), hpMax: +$('enHP').value || (+le.hp || 10),
    av: +$('enAV').value || (+le.av || 40),
    def: +le.def || 0, dmg: le.dmg !== undefined && le.dmg !== '' ? le.dmg : '0',
    loot: le.loot || '', abilities: le.abilities || '' });
  commit(); renderView();
};
/* personal combat per Book 1 p16: hit location mods 1:+3 2:+2 3:+1 4:0 5:-1 6:-1 */
const LOC_MODS = { 1: 3, 2: 2, 3: 1, 4: 0, 5: -1, 6: -1 };
const LOC_NAME = { 1: 'Head', 2: 'Body', 3: 'Vitals', 4: 'Waist', 5: 'Arms', 6: 'Legs' };
const locDie = () => { const n = Dice.d6(); return { n, mod: LOC_MODS[n], name: LOC_NAME[n] }; };
window.combatAttack = (mode) => {
  mode = mode || 'ranged';
  const stat = mode === 'melee' ? G.captain.str : mode === 'smart' ? G.captain.int : G.captain.dex;
  const roll = Dice.d100();
  const hit = roll <= stat.primary;
  const out = $('combatOut');
  if (!out) return;
  if (!hit) {
    out.innerHTML = `<div class="badge">Attack (${mode}, d100 ≤ ${stat.primary})</div><div style="margin-top:4px">Rolled <b>${roll}</b> — MISS</div>`;
    addLog(`⚔ attack ${mode}: ${roll} vs ${stat.primary} — miss`);
  } else {
    const d = Dice.d6(), loc = locDie();
    const target = G.away.enemies[0];
    const def = target ? (target.def || 0) : 0;
    const total = Math.max(0, d + loc.mod - def); // dmg 1d6 + locMod − Def
    if (target && total) { target.hp = Math.max(0, target.hp - total); }
    out.innerHTML = `<div class="badge">Attack (${mode}, d100 ≤ ${stat.primary})</div>
      <div style="margin-top:4px">HIT — rolled ${roll} · dmg ${d} + loc ${loc.name} (${loc.mod >= 0 ? '+' : ''}${loc.mod})${def ? ` − Def ${def}` : ''} = <b>${total} HP</b>${target ? ` → ${esc(target.name)} ${target.hp}/${target.hpMax}` : ''}</div>
      ${target && target.hp === 0 ? (() => {
        // book: defeating an enemy earns an XP pip + roll [K] loot if it carried any
        const lootTxt = target.loot || '';
        const kRoll = lootTxt.includes('[K]') ? TABLES['K-KIT'].rows.find(x => rollInRange(Dice.d100(), x.roll)) : null;
        G.captain.dex.pips = Math.min(10, (G.captain.dex.pips || 0) + 1);
        G.captain.credits += 25; // book: salvage 25c baseline from scraps unless loot says otherwise
        if (kRoll) addLog(`🎁 [K] loot: ${(kRoll.text || '').slice(0, 60)}`);
        return '<div class="badge">☠ Enemy defeated — +1 XP pip · +25c salvage' + (kRoll ? ` · loot: ${esc((kRoll.text || '').slice(0, 50))}` : '') + '</div>';
      })() : ''}`;
    addLog(`⚔ hit ${loc.name}: ${total} dmg${target ? ` → ${target.name} ${target.hp}/${target.hpMax}` : ''}`);
  }
  window._lastCombatOut = out.innerHTML;
  commit(); renderView();
  if (window._lastCombatOut && $('combatOut')) $('combatOut').innerHTML = window._lastCombatOut;
};
window.combatEscape = () => {
  // Book: ESCAPE COMBAT — Test Dex −10. S: remove enemy from track, record on map sheet. F: go to step 5 (enemy attacks) and lose 2 HP.
  const roll = Dice.d100();
  const target = G.captain.dex.primary - 10;
  const out = $('combatOut');
  const pass = roll <= target;
  let html = `<div class="badge">Escape test: d100 ≤ ${target} (Dex −10)</div><div style="margin-top:4px">Rolled <b>${roll}</b> — ${pass ? 'SUCCESS — enemy removed from combat track' : 'FAIL — enemy attacks (−2 HP)'}</div>`;
  if (pass) {
    if (G.away.enemies.length) {
      const e = G.away.enemies[0];
      addLog(`🏃 escaped from ${e.name}`);
      G.away.enemies.splice(0, 1);
    }
  } else {
    G.captain.hp = Math.max(0, G.captain.hp - 2);
    addLog('🏃 escape failed — 2 HP lost');
  }
  window._lastCombatOut = html;
  commit(); renderView();
  if (window._lastCombatOut && $('combatOut')) $('combatOut').innerHTML = window._lastCombatOut;
};
window.combatEnemyAct = () => {
  // Book step 1: Enemy Reaction d10 (1: AV+10 if <½HP, 2: AV+5 if <½HP, 3-7 attack, 8 escape if <½HP, 9 escape if damaged last round, 10 escape)
  const target = G.away.enemies[0];
  const react = Dice.d10();
  let reaction = '3-7 → attacks';
  if (react === 1 || react === 2) reaction = `enemy gains AV+${react === 1 ? 10 : 5} if below ½ HP`;
  else if (react === 8) reaction = 'attempts escape if below ½ HP';
  else if (react === 9) reaction = 'attempts escape if damaged last round';
  else if (react === 10) reaction = 'attempts escape';
  const out = $('combatOut');
  const av = target ? target.av : 40;
  const roll = Dice.d100();
  const hitCap = roll <= av;
  let html = `<div class="badge">Enemy reaction d10 = ${react} — ${reaction}</div>`;
  if (['3-7 → attacks'].includes(reaction) || (react <= 2)) {
    if (hitCap) {
      const d = Dice.d6(), loc = locDie();
      const ar = (G.captain.armour = G.captain.armour || { Head: 0, Body: 0, Vitals: 0, Waist: 0, Arms: 0, Legs: 0 });
      const armour = ar[loc.name] || 0;
      const es = G.captain.energyShield || 0;
      const dmgMod = target && target.dmg !== undefined ? (parseInt(target.dmg, 10) || 0) : 0;
      const raw = Math.max(0, d + loc.mod + dmgMod - armour);
      const absorbed = Math.min(es, raw);
      const total = raw - absorbed;
      if (absorbed && G.captain.energyShield !== undefined) G.captain.energyShield -= absorbed;
      G.captain.hp = Math.max(0, G.captain.hp - total);
      html += `<div style="margin-top:4px">Enemy HIT you (d100 ${roll} ≤ AV ${av}) — ${LOC_NAME[loc.n]}: 1d6(${d}) ${loc.mod >= 0 ? '+' : ''}${loc.mod} ${dmgMod ? dmgMod > 0 ? '+' + dmgMod : dmgMod : ''} − armour ${armour} = ${raw}${absorbed ? ` (ES −${absorbed})` : ''} → <b>${total} dmg</b> → HP ${G.captain.hp}/${G.captain.hpMax}</div>`;
      addLog(`🩸 took ${total} dmg (${loc.name}${armour ? `, armour ${armour}` : ''}${absorbed ? `, ES −${absorbed}` : ''}) — HP ${G.captain.hp}`);
    } else {
      html += `<div style="margin-top:4px">Enemy attack MISSED (d100 ${roll} > AV ${av})</div>`;
      addLog(`🛡 enemy missed (${roll} > AV ${av})`);
    }
  }
  window._lastCombatOut = html;
  commit(); renderView();
  if (window._lastCombatOut && $('combatOut')) $('combatOut').innerHTML = window._lastCombatOut;
};
function renderEnemies() {
  $('enemyList').innerHTML = G.away.enemies.length ? G.away.enemies.map((e, i) =>
    `<div class="row" style="border-bottom:1px solid var(--border);padding:4px 0">
      <b style="min-width:120px">${esc(e.name)}</b>
      <span class="badge">HP ${e.hp}/${e.hpMax}</span>
      <span class="badge">AV ${e.av}</span>
      <button onclick="enemyDmg(${i},-1)">+HP</button><button onclick="enemyDmg(${i},1)">−HP</button>
      <button class="danger" onclick="enemyRm(${i})">✕</button></div>`).join('')
    : '<div class="empty">No enemies tracked.</div>';
}
window.enemyDmg = (i, d) => { const e = G.away.enemies[i]; e.hp = Math.max(0, e.hp - d); commit(); renderView(); };
window.enemyRm = i => { G.away.enemies.splice(i, 1); commit(); renderView(); };

/* ============================ SPACE COMBAT ============================ */
const TACTICAL = ['Evasive Manoeuvre', 'Targeting Shields', 'Targeting Weapons', 'Evasive Attack Plan',
  'Pursuit', 'Attack Plan', 'Intercept Attack Plan', 'Full On Attack Plan', 'Boarding'];
const CAP_MODS = [-3, -2, -1, 0, 1, 2, 3, null, null];   // damage mods per action index
const CAP_DEX = [-10, -5, 5, 0, -5, -10, -15, null, null];
const ENEMY_MODS = [3, 2, 1, 0, -1, -2, -3, null, null];  // Enemy row: enemy dmg mods
const ENEMY_DEX = [10, 5, -5, 0, 5, 10, 15, null, null];  // Enemy row: applied to captain's dex test
function scLogRound(sc, lines) {
  scLogRound(sc, lines);
  addLog(`⚔ Space combat R${sc.round}: ${lines.join(' · ')}`);
}
function renderSpace(v) {
  const sc = G.space;
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Space Combat ${sc.active ? '— ROUND ' + sc.round : ''}</h3>
    <div class="row">
      <button class="${sc.active ? 'danger' : 'primary'}" onclick="spaceToggle()">${sc.active ? 'End Combat' : 'Begin Space Combat'}</button>
      ${sc.active ? '<button class="primary" onclick="spaceRound()">Next Round</button>' : ''}
    </div>
    ${sc.active ? `
    <div class="grid2" style="margin-top:10px">
      <div><h3 style="color:var(--gold)">Enemy ship</h3>
        <div class="row"><div><label>Model</label><input value="${esc(sc.enemy?.model || '')}" onchange="scEnemy('model',this.value)"></div>
        <div><label>WS</label><input type="number" value="${sc.enemy?.ws ?? 2}" style="width:54px" onchange="scEnemy('ws',+this.value)"></div>
        <div><label>SG</label><input type="number" value="${sc.enemy?.sg ?? 0}" style="width:54px" onchange="scEnemy('sg',+this.value)"></div></div>
        <div class="row" style="margin-top:6px">
          <div><label>Enemy PL</label><input type="number" value="${sc.enemy?.currentPl ?? 20}" style="width:54px" onchange="scEnemy('currentPl',+this.value)"></div>
          <div><label>Enemy LS</label><input type="number" value="${sc.enemy?.currentLs ?? 40}" style="width:54px" onchange="scEnemy('currentLs',+this.value)"></div>
          <button onclick="rollTable('S-STARSHIPS')">Roll Table S</button>
        </div>
      </div>
      <div><h3 style="color:var(--gold)">Your ship</h3>
        <div class="badge">PL ${G.ship.current.power}/${G.ship.pl} · LS ${G.ship.current.lifeSupport}/${G.ship.ls}</div>
        <div class="row" style="margin-top:6px">
          <button onclick="shipCur('power',${G.ship.current.power - 1})">−1 PL</button>
          <button onclick="shipCur('lifeSupport',${G.ship.current.lifeSupport - 1})">−1 LS</button>
          <button onclick="shipDmgCalc()">Apply Damage</button>
          <button onclick="rollShipDamage()">💥 Damage table (1d6)</button>
          <button onclick="shipRepair()">🔧 Repairs (Int ± CM)</button>
        </div>
        ${G.ship.damageNote ? '<div style="font-size:12px;margin-top:4px;opacity:.85">Damage note: ' + esc(G.ship.damageNote) + '</div>' : ''}
        <div class="row" style="margin-top:6px"><div><label>Damage dealt to you</label><input type="number" id="scDmg" value="0" style="width:60px"></div></div>
      </div>
    </div>
    <div style="margin-top:10px"><h3 style="color:var(--gold)">Your tactical decision</h3>
      <div class="row">${TACTICAL.slice(0, 8).map((t, i) =>
        `<button onclick="scAction(${i})">${t}<br><small>dmg ${CAP_MODS[i] >= 0 ? '+' : ''}${CAP_MODS[i]}, dex ${CAP_DEX[i] >= 0 ? '+' : ''}${CAP_DEX[i]}</small></button>`).join('')}
      <button onclick="scAction(8)">Boarding (dex −20)</button></div>
    </div>
    ${sc.boarding ? `<div class="row" style="margin-top:8px"><button class="primary" onclick="boardingRound()">🚨 Boarding round (Int ${G.captain.int.primary} ${sc.bm >= 0 ? '+' : ''}${sc.bm || 0} BM)</button></div>` : ''}
    <div id="scOut" style="margin-top:8px"></div>
    <div style="margin-top:8px;font-size:12px;color:var(--dim)">${esc(sc.log.join(' · '))}</div>` : ''}
  </div>`;
}
window.spaceToggle = () => {
  G.space.active = !G.space.active; G.space.round = 0; G.space.log = [];
  if (G.space.active && !G.space.enemy) G.space.enemy = { model: 'Enemy', ws: 2, sg: 0, currentPl: 20, currentLs: 40 };
  commit(); renderView();
};
window.scEnemy = (k, v) => { G.space.enemy[k] = v; commit(); renderView(); };
window.scAction = i => { G.space.captainAction = i; commit(); spaceRound(i); };
/* BOOK 2 TIME: Action Pips (AP) + Star Date. Quota set from Time Sheet Action Chart (editable). */
function advanceDay() {
  G.captain.day++;
  if (G.captain.day > 30) { G.captain.day = 1; G.captain.month++; }
  if (G.captain.month > 12) { G.captain.day = 1; G.captain.month = 1; G.captain.year++; yearAgeCheck(); }
  G.captain.apUsed = 0;
  // fire trigger dates due today (arrow g)
  const today = G.captain.year + '.' + String(G.captain.month).padStart(2, '0') + '.' + String(G.captain.day).padStart(2, '0');
  (G.captain.triggers || []).filter(t => t.arrow && t.date === today).forEach(t => {
    addLog('TRIGGER (' + today + '): ' + t.text);
    t.arrow = false;
  });
  G.captain.triggers = (G.captain.triggers || []).filter(t => t.arrow);
}
function yearAgeCheck() {
  // Aging Modifier: HP max -1, Str & Dex max -1 (book: choose 2 of 3); Time Is Almost Up = 2d10 >= max HP
  const mp = G.captain.maxPrimary || (G.captain.maxPrimary = { str: 80, dex: 80, int: 80, hp: 60 });
  mp.hp = Math.max(1, mp.hp - 1);
  mp.str = Math.max(1, mp.str - 1); mp.dex = Math.max(1, mp.dex - 1);
  const a = Dice.d10(), b = Dice.d10();
  addLog('AGE year ' + G.captain.year + ': max HP ' + mp.hp + ', Str/Dex max ' + mp.str + '/' + mp.dex + ' - 2d10 ' + a + '+' + b + (a + b >= mp.hp ? ' >= ' + mp.hp + ' -> TIME IS ALMOST UP!' : ' < ' + mp.hp + ' (okay)'));
}
window.spendAP = (n, label) => {
  G.captain.apOverflow = G.captain.apOverflow || 0;
  let remaining = n;
  while (remaining > 0) {
    const freeToday = G.captain.apQuota + (G.captain.apUsed >= G.captain.apQuota ? 0 : 0) - G.captain.apUsed;
    const can = Math.max(0, freeToday);
    if (can >= remaining) { G.captain.apUsed += remaining; remaining = 0; }
    else { G.captain.apUsed += can; remaining -= can; advanceDay(); }
  }
  addLog(`⏳ ${label || 'Action'} — ${n} AP (star date ${G.captain.year}.${String(G.captain.month).padStart(2, '0')}.${String(G.captain.day).padStart(2, '0')}, AP ${G.captain.apUsed}/${G.captain.apQuota})`);
  commit();
};
/* COMBINED JUMP TESTS (Book 2 p29): +5 per extra jump, partial travel, table J */
window.combinedJump = () => {
  const dist = parseInt(($('jumpLY') || {}).value) || 0;
  const js = G.ship.js || 60;
  if (!dist) return toast('Enter distance in light years');
  const tests = Math.ceil(dist / js);
  // test target: Dex +/- CM; each extra test adds +5 to the ROLL
  const cm = controlModifier(G.captain, G.ship);
  const target = G.captain.dex.primary + cm + (G.ship.dt || 0);
  const raw = Dice.d100();
  const extra = (tests - 1) * 5;
  const total = raw + extra;
  const passed = total <= target;
  const lines = ['Combined jump: ' + dist + ' LY at JS ' + js + ' = ' + tests + ' test(s) (+' + extra + ' to roll)', 'roll ' + raw + '+' + extra + '=' + total + ' vs ' + target + ' — ' + (passed ? 'PASS' : 'FAIL')];
  let usedPL = 0, usedFuel = 0, travelled = 0, event = false;
  if (passed) {
    usedPL = tests; usedFuel = dist;
    travelled = dist;
    lines.push('Arrived. Cost: 1 AP, ' + usedPL + ' PL, ' + usedFuel + ' fuel');
  } else {
    // walk cumulative +5 steps to find where it broke
    let cumulative = raw, step = 0, full = 0;
    while (step < tests && cumulative + step * 5 <= target) { full++; step++; }
    travelled = full * js;
    usedPL = full * 1; // passing legs
    const remaining = dist - travelled;
    // table J: d100 row band, column = attempted LY of this leg = min(js, remaining)
    const attempted = Math.min(js, remaining);
    const colIdx = Math.min(14, Math.max(0, Math.ceil(attempted / 10)));
    const jroll = Dice.d100();
    const band = ['1-10','11-20','21-30','31-40','41-50','51-60','61-70','71-80','81-90','91-100'][(jroll - 1) % 10 < 10 ? Math.floor((jroll - 1) / 10) : 0];
    const val = (typeof TABLE_J !== 'undefined' && TABLE_J[band]) ? TABLE_J[band][colIdx] : '0';
    const m = val.match(/(\d+)/);
    const extraLY = m ? parseInt(m[1]) : 0;
    event = /H/.test(val);
    travelled += extraLY;
    usedPL += 2; // failed leg costs 2 PL
    usedFuel = Math.ceil(travelled / 10);
    lines.push('Broke down after ' + travelled + ' LY (' + remaining + ' LY remaining). Table J: d100 ' + jroll + ', ' + attempted + ' LY column -> ' + val + (event ? ' — roll on Table H!' : ''));
    lines.push('Cost: 1 AP, ' + usedPL + ' PL, ' + usedFuel + ' fuel');
  }
  G.ship.current.power = Math.max(0, G.ship.current.power - usedPL);
  G.ship.current.fuel = Math.max(0, G.ship.current.fuel - usedFuel);
  spendAP(1, 'Hyper jump');
  lines.push('Ship now PL ' + G.ship.current.power + ', fuel ' + G.ship.current.fuel);
  addLog(lines.join(' · '));
  const out = $('eventOut');
  if (out) out.innerHTML = '<div class="badge">🚀 Combined Jump Test</div><div style="white-space:pre-wrap">' + esc(lines.join('\n')) + '</div>';
  commit();
};
/* CHANGING ECONOMY (Book 2 p28): per system+commodity tracks */
const ECON_COMMODITIES = ['Bio Waste', 'Chemicals', 'Contraband', 'Food', 'Industrial', 'Luxury', 'Medicines', 'Metals', 'Minerals', 'Narcotics', 'Salvage', 'Tech', 'Textiles', 'Waste', 'Water', 'Weapons'];
function econKey(sys, com) { return (sys || 'unknown') + '|' + com; }
function econAdjust(entry, dir, kind) {
  // kind: cargo 5c, mods 10c, ships 100c; min price 5c for cargo
  const step = kind === 'ships' ? 100 : kind === 'mods' ? 10 : 5;
  const delta = dir > 0 ? step : -step;
  entry.buy = Math.max(5, (entry.buy || 50) + delta);
  entry.sell = Math.max(5, (entry.sell || 50) + delta);
}
window.econRoll = () => {
  // Port-start procedure: 1d6 pips; each pip: d100 -> column track; shade 1 pip; d6 A/B/C
  const sysName = (G.galaxy && G.galaxy.systems && G.galaxy.systems.length) ? (G.galaxy.systems[G.galaxy.systems.length - 1].name || 'system') : 'unknown';
  const pips = Dice.d6();
  const lines = ['Economy roll (' + sysName + '): ' + pips + ' pips'];
  for (let i = 0; i < pips; i++) {
    const roll = Dice.d100();
    // 18 columns: 1-10 first, then 11-20 in tens... map: index by ranges
    const ranges = [[1,10],[11,20],[21,25],[26,30],[31,35],[36,40],[41,45],[46,50],[51,55],[56,60],[61,65],[66,70],[71,75],[76,80],[81,85],[86,90],[91,95],[96,100]];
    const ri = ranges.findIndex(r => roll >= r[0] && roll <= r[1]);
    // 16 commodities + ships + mods tracks (last 2 columns)
    const track = ri < 16 ? ECON_COMMODITIES[ri] : (ri === 16 ? 'Ships' : 'Modifications');
    const k = econKey(sysName, track);
    const e = G.captain.econ.entries[k] = G.captain.econ.entries[k] || { pips: 0, buy: 50, sell: 50 };
    e.pips++;
    const d = Dice.d6();
    if (d === e.pips) { e.pips = 0; e.buy = 50; e.sell = 50; lines.push(roll + ' -> ' + track + ': RESET (d6=' + d + ')'); }
    else if (d < e.pips) { const d10 = Dice.d10(); econAdjust(e, d10 <= 5 ? -1 : 1, track.toLowerCase().includes('ship') ? 'ships' : track.toLowerCase().includes('mod') ? 'mods' : 'cargo'); lines.push(roll + ' -> ' + track + ': ' + (d10 <= 5 ? 'lower' : 'raise') + ' (d10=' + d10 + ') now ' + e.buy + '/' + e.sell + 'c'); }
    else { lines.push(roll + ' -> ' + track + ': pip shaded, no price change (d6=' + d + ' > pips ' + e.pips + ')'); }
  }
  addLog(lines.join(' · '));
  const out = $('eventOut');
  if (out) out.innerHTML = '<div class="badge">💰 Changing Economy</div><div style="white-space:pre-wrap">' + esc(lines.join('\n')) + '</div>';
  commit();
};
window.econTrade = (commodity, bought) => {
  // Port-phase trade: shade 1 pip on its track, roll d6: >= pips nothing; < pips adjust in trade's favour
  const sysName = (G.galaxy && G.galaxy.systems && G.galaxy.systems.length) ? (G.galaxy.systems[G.galaxy.systems.length - 1].name || 'unknown') : 'unknown';
  const k = econKey(sysName, commodity);
  const e = G.captain.econ.entries[k] = G.captain.econ.entries[k] || { pips: 0, buy: 50, sell: 50 };
  e.pips++;
  const d = Dice.d6();
  if (d >= e.pips) { addLog('💰 ' + commodity + ' traded (d6=' + d + ' >= ' + e.pips + '): price unchanged'); return; }
  // selling lowers prices; buying raises them (rule B)
  econAdjust(e, bought ? 1 : -1, 'cargo');
  addLog('💰 ' + commodity + (bought ? ' bought' : ' sold') + ' (d6=' + d + ' < ' + e.pips + '): prices ' + (bought ? 'raised' : 'lowered') + ' to ' + e.buy + '/' + e.sell + 'c');
};
/* URANOGRAPHERS — Data Chips (Book 2 p19): costs base 3000/1500/4000c, negotiated by Rep test? base = book; chips install immediately */
window.buyChip = (kind) => {
  // Book: each search check = 1 AP + d10 (+ system reward adjust) >= 6 to find; max Rep checks
  const costs = { system: 3000, jump: 1500, deep: 4000 };
  const reward = (G.galaxy && G.galaxy.selKey && G.galaxy.systems[G.galaxy.selKey] && G.galaxy.systems[G.galaxy.selKey].reward) || 0;
  const roll = Dice.d10() + reward;
  spendAP(1, 'Uranographer search');
  if (roll < 6) { addLog('🗂️ Uranographers: no stock (d10+adj = ' + roll + ' < 6) — try again (1 AP per check, max ' + G.captain.rep + ')'); commit(); renderView(); return; }
  const cost = costs[kind];
  if (G.captain.credits < cost) return toast('Found one but need ' + cost + 'c');
  G.captain.credits -= cost;
  G.galaxy = G.galaxy || {};
  G.galaxy.systems = G.galaxy.systems || {};
  const g = G.galaxy;
  if (kind === 'system') {
    // roll 1d100 on current hex sheet; find an empty space (key not occupied)
    const roll = Dice.d100();
    const key = 'chip-' + roll;
    const t = TABLES['GB-S-STAR-SYSTEMS'];
    const row = t.rows.find(x => rollInRange(roll, x.roll)) || t.rows[t.rows.length - 1];
    g.systems[key] = { name: 'Charted ' + roll, threat: (row.text || '').slice(0, 40), poi: [] };
    addLog('🗂️ Star System chip installed (−' + cost + 'c): hex ' + roll + ' — ' + (row.text || '').slice(0, 50));
  } else if (kind === 'jump') {
    const roll = Dice.d6();
    const lanes = roll;
    const ly = Dice.d100();
    addLog('🛣️ Hyper Jump chip installed (−' + cost + 'c): ' + lanes + ' lane(s) charted, first at ' + ly + ' LY');
  } else {
    addLog('🌌 Deep Space chip installed (−' + cost + 'c): sector link recorded — choose the linking hex on the next sector sheet');
  }
  commit(); renderView();
};
window.setMaxRace = (race) => {
  const vals = { Human: [80, 80, 80, 60], Alien: [90, 90, 90, 50], Cyboid: [70, 70, 70, 70] };
  const v = vals[race];
  G.captain.maxPrimary = { str: v[0], dex: v[1], int: v[2], hp: v[3] };
  addLog('Race max primary set: ' + race + ' (Str/Dex/Int ' + v[0] + ', HP ' + v[3] + ')');
  commit(); renderView();
};
window.addTrigger = () => {
  const text = ($('trigText') || {}).value;
  const days = parseInt(($('trigDays') || {}).value) || 1;
  if (!text) return toast('Enter the event text');
  G.captain.triggers = G.captain.triggers || [];
  // compute target date from today + days
  let d = G.captain.day, m = G.captain.month, y = G.captain.year, left = days;
  while (left-- > 0) { d++; if (d > 30) { d = 1; m++; } if (m > 12) { m = 1; y++; } }
  G.captain.triggers.push({ date: y + '.' + String(m).padStart(2, '0') + '.' + String(d).padStart(2, '0'), text, arrow: true });
  addLog('Trigger set for ' + y + '.' + String(m).padStart(2, '0') + '.' + String(d).padStart(2, '0') + ' — ' + text);
  commit(); renderView();
};
window.apDay = () => {
  advanceDay();
  addLog(`New day — star date ${G.captain.year}.${String(G.captain.month).padStart(2, '0')}.${String(G.captain.day).padStart(2, '0')} (AP ${G.captain.apUsed}/${G.captain.apQuota})`);
  commit(); renderView();
};
window.apPush = () => {
  // PUSH ACTION: Int test, MOD = -5 per pip already past quota; S: +1 AP; F: -1d3 PL, d6=6 → -1 bridge crew
  const past = Math.max(0, (G.captain.apUsed || 0) - G.captain.apQuota);
  const mod = past * 5;
  const r = Dice.test(G.captain.int.primary - mod, 0);
  if (r.outcome.includes('success')) {
    G.captain.apUsed--; // frees one pip effectively (extra AP available)
    addLog(`💪 PUSH ACTION success ${r.raw} vs ${r.target} — +1 AP`);
  } else {
    const d = Dice.d3();
    G.ship.current.power = Math.max(0, G.ship.current.power - d);
    let extra = '';
    if (Dice.d6() === 6 && (G.ship.bridgeCrew || 0) > 0) { G.ship.bridgeCrew--; extra = ' · ☠ bridge crew −1'; }
    addLog(`⚠️ PUSH ACTION failed ${r.raw} vs ${r.target} — PL −${d}${extra}`);
  }
  commit(); renderView();
};
/* BOOK 2 EVENTS (GB-E): d100 -> context row -> event name -> GB_EVENTS paragraph */
window.rollEvent = (context) => {
  const t = TABLES['GB-E-EVENTS'];
  const roll = Dice.d100();
  const row = t.rows.find(x => rollInRange(roll, x.roll)) || t.rows[t.rows.length - 1];
  let names = [];
  try { const d = JSON.parse(row.text); names = context === 'any' ? Object.values(d) : [d[context] || Object.values(d)[0]]; } catch (err) { names = [row.text]; }
  const name = names[Math.floor(Math.random() * names.length)];
  let body = (typeof GB_EVENTS !== 'undefined' && GB_EVENTS[name]) ? GB_EVENTS[name] : null;
  if (!body && typeof GB_EVENTS !== 'undefined') {
    const key = Object.keys(GB_EVENTS).find(k => k.toLowerCase().startsWith(name.toLowerCase().split("'")[0]) || name.toLowerCase().startsWith(k.toLowerCase().split("'")[0]));
    if (key) { body = GB_EVENTS[key]; name = key; }
  }
  if (!body) body = '(event text not found: ' + name + ')';
  const out = $('eventOut');
  if (out) out.innerHTML = `<div class="badge">d100 ${roll} → <b>${esc(name)}</b></div><div style="white-space:pre-wrap">${esc(body.slice(0, 1200))}${body.length > 1200 ? '…' : ''}</div>`;
  addLog(`🎲 Event: ${name} (${context})`);
  commit();
};
/* BOARDING COMBAT (Book 1): BM = LS diff; Int +/- BM test; loser −1d10 LS; LS 0 = captured */
function beginBoarding() {
  const sc = G.space;
  const myLs = G.ship.current.lifeSupport, enLs = sc.enemy.currentLs || 0;
  sc.bm = myLs > enLs ? Math.min(20, myLs - enLs) : -Math.min(20, enLs - myLs);
  sc.log.unshift(`🚨 BOARDING: BM ${sc.bm >= 0 ? '+' : ''}${sc.bm} (LS ${myLs} vs ${enLs})`);
}
window.boardingRound = () => {
  const sc = G.space;
  sc.round++;
  const bm = sc.bm || 0;
  const r = Dice.test(G.captain.int.primary + bm, 0);
  const win = r.outcome.includes('success');
  const lines = [];
  if (win) {
    const d = Dice.d10();
    sc.enemy.currentLs = Math.max(0, (sc.enemy.currentLs || 0) - d);
    lines.push(`enemy LS −${d} → ${sc.enemy.currentLs}`);
    if (sc.enemy.currentLs === 0) { lines.push('🏴 enemy CAPTURED — salvage & insurance!'); sc.active = false; }
  } else {
    const d = Dice.d10();
    G.ship.current.lifeSupport = Math.max(0, G.ship.current.lifeSupport - d);
    lines.push(`your LS −${d} → ${G.ship.current.lifeSupport}`);
    if (G.ship.current.lifeSupport === 0) { lines.push('☠ YOUR SHIP CAPTURED — escape pods!'); sc.active = false; }
  }
  sc.log.unshift(`B${sc.round} (BM ${bm >= 0 ? '+' : ''}${bm}): Int test ${r.raw} vs ${r.target} — ${win ? 'win' : 'lose'} · ${lines.join(' · ')}`);
  commit(); renderView();
  $('scOut') && ($('scOut').innerHTML = `<span class="roll-result ${win ? 'success' : 'fail'}">${r.raw}</span><span class="badge">${lines.join(' · ')}</span>`);
};
window.spaceRound = (actionIdx) => {
  const sc = G.space;
  sc.round++;
  const e = sc.enemy;
  const lines = [];
  // STEP 1: both ships lose -1 PL (or -1 LS if PL is 0)
  const drain = s => { if (s.currentPl > 0) s.currentPl--; else s.currentLs = Math.max(0, s.currentLs - 1); };
  const drainShip = () => { if (G.ship.current.power > 0) G.ship.current.power--; else G.ship.current.lifeSupport = Math.max(0, G.ship.current.lifeSupport - 1); };
  drainShip(); drain(e);
  lines.push('−1 PL each');
  // STEP 2: captain picks action; enemy rolls d6 for its action
  const capDexMod = actionIdx === 8 ? -20 : (CAP_DEX[actionIdx] || 0);
  const capDmgMod = actionIdx === 8 ? 0 : (CAP_MODS[actionIdx] || 0);
  let enemyRoll = Dice.d6();
  if (G.ship.current.power === 0) enemyRoll += 3;
  if (e.currentPl === 0) enemyRoll -= 3;
  enemyRoll = Math.max(0, Math.min(7, enemyRoll));
  const enemyActionIdx = enemyRoll; // 0-7 mapping to TACTICAL slice (book: 0 or less = col 0, 7+ = col 7)
  const enDexMod = enemyRoll === 8 ? -20 : (ENEMY_DEX[enemyActionIdx] || 0);
  const enDmgMod = enemyRoll === 8 ? 0 : (ENEMY_MODS[enemyActionIdx] || 0);
  // STEP 3: both Evasive → combat over; both Boarding → boarding
  const capEvasive = actionIdx === 0, enEvasive = enemyActionIdx === 0;
  const capBoard = actionIdx === 8, enBoard = enemyActionIdx === 8;
  if (capEvasive && enEvasive) { lines.push('Both evaded — combat over'); scLogRound(sc, lines); sc.active = false; commit(); renderView(); return; }
  if (capBoard && enBoard) { beginBoarding(); lines.push('Both boarded — boarding combat begins'); scLogRound(sc, lines); sc.boarding = true; commit(); renderView(); return; }
  // STEP 4: SPACE COMBAT test — adjusted Dex (captain + own action + enemy action mods) +/- CM +/- DT
  const cm = controlModifier(G.captain, G.ship);
  const totalDex = G.captain.dex.primary + capDexMod + enDexMod;
  const r = Dice.test(totalDex + cm, (G.ship.dt || 0));
  const win = r.outcome.includes('success');
  // book: if one side evaded/boarded and LOST, they are dealt damage; if they WON, combat ends (or boarding starts)
  const evadeBoard = capEvasive || enEvasive || capBoard || enBoard;
  if (evadeBoard && win && (capEvasive || capBoard)) {
    if (capBoard) { beginBoarding(); lines.push('You boarded — boarding combat begins'); sc.boarding = true; }
    else { lines.push('You evaded — combat over'); sc.active = false; }
    scLogRound(sc, lines); commit(); renderView(); return;
  }
  if (evadeBoard && !win && (enEvasive || enBoard)) {
    if (enBoard) { beginBoarding(); lines.push('Enemy boarded you — boarding combat begins'); sc.boarding = true; }
    else { lines.push('Enemy evaded — combat over'); sc.active = false; }
    scLogRound(sc, lines); commit(); renderView(); return;
  }
  // DAMAGE: 1d6 + victor WS + victor's action dmg mod; SG deducted only if target PL > 0; PL→LS cascade
  if (win) {
    const sgDed = e.currentPl > 0 ? (e.sg || 0) : 0;
    const dmg = Math.max(0, Dice.d6() + G.ship.ws + capDmgMod + enDmgMod - sgDed); // Damage: WS + mods for captain AND enemy actions
    let rem = dmg; const toPL = Math.min(e.currentPl, rem);
    e.currentPl -= toPL; rem -= toPL;
    if (rem > 0) e.currentLs = Math.max(0, (e.currentLs || 0) - rem);
    lines.push(`enemy hit: ${dmg} dmg (PL −${toPL}${rem ? `, LS −${rem}` : ''})`);
    if (e.currentLs === 0) { lines.push('☠ enemy ship DESTROYED'); sc.active = false; }
  } else {
    const myPl = G.ship.current.power;
    const sgDed = myPl > 0 ? (G.ship.sg || 0) : 0;
    const dmg = Math.max(0, Dice.d6() + (e.ws || 2) + capDmgMod + enDmgMod - sgDed); // Damage: WS + mods for captain AND enemy actions
    let rem = dmg; const toPL = Math.min(myPl, rem);
    G.ship.current.power -= toPL; rem -= toPL;
    if (rem > 0) G.ship.current.lifeSupport = Math.max(0, G.ship.current.lifeSupport - rem);
    lines.push(`you took ${dmg} dmg (PL −${toPL}${rem ? `, LS −${rem}` : ''})`);
    if (G.ship.current.lifeSupport === 0) { lines.push('☠ YOUR SHIP DESTROYED'); sc.active = false; }
  }
  const line = `R${sc.round}: You ${TACTICAL[actionIdx] ?? '?'} vs Enemy ${TACTICAL[enemyActionIdx] ?? '?'} (${enemyRoll}) — ${lines.join(' · ')} — rolled ${r.raw} vs ${r.target} → ${win ? 'win' : 'lose'}`;
  sc.log.unshift(line);
  sc.lastEnemyRoll = enemyRoll;
  commit(); renderView();
  $('scOut') && ($('scOut').innerHTML = `<span class="roll-result ${win ? 'success' : 'fail'}">${r.raw}</span>
    <span class="badge">${line}</span>`);
};
window.shipDmgCalc = () => {
  const d = parseInt($('scDmg').value) || 0;
  let rem = d - G.ship.sg;
  if (rem > 0) {
    const toPL = Math.min(G.ship.current.power, rem);
    G.ship.current.power -= toPL; rem -= toPL;
    if (rem > 0) G.ship.current.lifeSupport = Math.max(0, G.ship.current.lifeSupport - rem);
    toast(`PL −${toPL}${rem ? `, LS −${rem}` : ''}`);
  } else toast('Shields absorbed all damage');
  addLog(`💥 took ${d} dmg (SG ${G.ship.sg}) → PL ${G.ship.current.power}, LS ${G.ship.current.lifeSupport}`);
  commit(); renderView();
};

/* ============================ PORT ============================ */
const PORT_OPTIONS = [
  ['Medic', 'Heal 1 HP = 20c'], ['Armourer', 'Fix armour pips (fix cost each)'],
  ['Trade Halls', 'Buy/sell items — roll tables A/W/TA/TB/TC ×Rep'], ['Supplies', 'Buy table N: 20+Rep max'],
  ['Training Droids', '200c skill pip · 2000c stat pip · 20,000c HP (max = Rep pips)'],
  ['Cybercon™', 'Implants 1000c · sell installed 400c (surgeon) · patches 200c'],
  ['Cargo Docks', 'Table Y prices · contraband = Illegal Activities test'],
  ['Shipyard', 'Buy/sell mods & ships (roll M/S ×Rep) · refuel 10c/pt · recharge 10c/pt'],
  ['Missions Board', 'Roll table O ×Rep (4 active max)'],
  ['Passenger Lounge', 'Passengers · compensation on LS overflow']
];
function renderPort(v) {
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Port Phase</h3>
    <div class="row">
      <div><label>Docked at</label><select onchange="portSet('type',this.value)">
        <option value="station" ${G.port.type === 'station' ? 'selected' : ''}>Space Station (50c fee)</option>
        <option value="military" ${G.port.type === 'military' ? 'selected' : ''}>Military Base (free)</option></select></div>
      <button class="primary" onclick="portDock()">Dock / Undock</button>
    </div>
  </div>
  <div class="card"><h3>Options (icons in book show station/military availability)</h3>
    <table class="tbl"><tr><th>#</th><th>Option</th><th>Notes</th></tr>
    ${PORT_OPTIONS.map(([t, n], i) => `<tr><td>${i + 1}</td><td><b>${t}</b></td><td>${n}</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:8px">
      <button onclick="rollTable('W-WEAPONS')">W · Weapons</button>
      <button onclick="rollTable('A-ARMOUR')">A · Armour</button>
      <button onclick="rollTable('I-IMPLANTS')">I · Implants</button>
      <button onclick="rollTable('M-MODIFICATIONS')">M · Mods</button>
      <button onclick="rollTable('S-STARSHIPS')">S · Ships</button>
      <button onclick="rollTable('O-OPERATIONS')">O · Operations</button>
      <button onclick="rollTable('Y-CARGO-PRICES')">Y · Cargo</button>
      <button onclick="rollTable('K-KIT')">K · Kit</button>
      <button onclick="rollTable('N-NEEDED')">N · Needed</button>
    </div>
    <div id="tblOut2"></div>
  </div>
  <div class="card"><h3>Port Actions (interactive)</h3>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      <button onclick="portMedic()">💉 Medic +1 HP (20c)</button>
      <button onclick="portTrain('skill')">🎓 Skill pip (200c)</button>
      <button onclick="portTrain('stat')">🎓 Stat pip (2000c)</button>
      <button onclick="portTrain('hp')">❤️ +1 HP max (20,000c)</button>
      <button onclick="portBuyN()">📦 Buy 1 supply (N)</button>
      <button onclick="portRefuel('fuel')">⛽ Fuel +1 (10c)</button>
      <button onclick="portRefuel('power')">🔋 Power +1 (10c)</button>
      <button onclick="portHire()">👥 Hire crew (max ${G.captain.rep}/phase)</button>
      <button onclick="portPassenger()">🧳 Add passenger</button>
      <button onclick="portDropoff()">📍 Drop off passenger (+100c)</button>
    </div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><h3 style="color:var(--gold);width:100%">Cargo Docks (Book 2 economy)</h3>
      ${['Food', 'Metals', 'Medicines', 'Tech', 'Water', 'Luxury'].map(c => `<button onclick="econTrade('${c}', true)">Buy ${c}</button><button onclick="econTrade('${c}', false)">Sell ${c}</button>`).join('')}
    </div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><h3 style="color:var(--gold);width:100%">12. Uranographers — Data Chips</h3>
      <button onclick="buyChip('system')">🗂️ Star System chip (3000c)</button>
      <button onclick="buyChip('jump')">🛣️ Hyper Jump chip (1500c)</button>
      <button onclick="buyChip('deep')">🌌 Deep Space chip (4000c)</button>
      <div style="font-size:11px;opacity:.75">Chips degrade without power — install immediately (auto). System chip charts a random empty hex; Jump chip rolls lanes + LY for a chosen system; Deep Space links sectors.</div>
    </div>
    <div style="margin-top:10px"><h3 style="color:var(--gold)">📦 Cargo Hold</h3>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <select id="cargoCom" style="max-width:120px">${['Food','Metals','Medicines','Tech','Water','Luxury','Chemicals','Narcotics','Contraband','Salvage','Textiles','Minerals'].map(c=>`<option>${c}</option>`).join('')}</select>
        <input id="cargoQty" type="number" value="1" min="1" style="width:56px" title="Quantity">
        <input id="cargoPrice" type="number" placeholder="price c" style="width:80px">
        <button onclick="cargoBuy()">Buy</button>
      </div>
      ${(G.captain.cargo||[]).length ? '<table style="width:100%;font-size:12px;margin-top:6px"><tr style="opacity:.7"><td>Lot</td><td>Qty</td><td>Paid</td><td>System</td><td></td></tr>' +
        G.captain.cargo.map((l,i)=>`<tr><td>${esc(l.commodity)}</td><td>${l.qty}</td><td>${l.unitCost}c</td><td>${esc(l.system)}</td><td><button style="padding:0 8px" onclick="cargoSell(${i},1)">Sell 1</button> <button style="padding:0 8px" onclick="cargoSell(${i},${l.qty})">Sell all</button></td></tr>`).join('') + '</table>'
        : '<div style="font-size:11px;opacity:.7;margin-top:4px">Hold empty — buying/selling adjusts the economy tracks (Book 2 p28)</div>'}
    </div>
    <div style="margin-top:10px"><h3 style="color:var(--gold)">📋 Missions (active operations)</h3>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <input id="misText" placeholder="Mission (e.g. M3-M4: retrieve data chip)" style="flex:1;min-width:180px">
        <input id="misReward" placeholder="Reward" style="width:90px">
        <input id="misDays" type="number" placeholder="days" min="0" style="width:60px" title="Deadline in days (0 = none)">
        <button onclick="missionAdd()">＋ Add</button>
      </div>
      ${(G.captain.missions||[]).filter(m=>!m.done).length ? '<div style="font-size:12px;margin-top:6px">' + G.captain.missions.filter(m=>!m.done).map((m)=>{const i=G.captain.missions.indexOf(m);return `<div>• <b>${esc(m.id)}</b> ${esc(m.text)} ${m.deadline?'<span style="opacity:.75">(by '+m.deadline+')</span>':''} ${m.reward?'<span style="color:var(--gold)">'+esc(m.reward)+'</span>':''} <button style="padding:0 8px" onclick="missionDone(${i},true)">✔ done</button> <button style="padding:0 8px" onclick="missionDone(${i},false)">✖ failed</button></div>`}).join('') + '</div>'
        : '<div style="font-size:11px;opacity:.7;margin-top:4px">No active missions — max 4 active (Book 1 p27)</div>'}
    </div>
    <div style="font-size:11px;opacity:.75;margin-top:6px">Crew ${Object.values(G.captain.crew || {}).reduce((a, b) => a + b, 0)} · Passengers ${G.captain.passengers || 0} (LS allowance limits both) · Training max ${G.captain.rep} pips per phase · Supplies max ${20 + G.captain.rep} per port</div>
  </div>`;
}
window.portMedic = () => {
  if (G.captain.hp >= G.captain.hpMax) return toast('HP already full');
  if (G.captain.credits < 20) return toast('Need 20c');
  spendAP(1, 'Medic');
  G.captain.credits -= 20; G.captain.hp++;
  addLog('💉 Medic: +1 HP (−20c) — HP ' + G.captain.hp + '/' + G.captain.hpMax);
  commit(); renderView();
};
window.portTrain = (kind) => {
  const costs = { skill: 200, stat: 2000, hp: 20000 };
  const cost = costs[kind];
  if (G.captain.credits < cost) return toast('Need ' + cost + 'c');
  if (kind === 'skill') {
    const names = Object.keys(G.captain.skills);
    const pick = prompt('Skill to train: ' + names.join(', '));
    if (!pick || !G.captain.skills[pick]) return;
    G.captain.credits -= cost;
    G.captain.skills[pick].pips++;
    addLog('🎓 trained ' + pick + ' (−200c)');
  } else if (kind === 'stat') {
    const pick = prompt('Stat to train (str/dex/int)');
    if (!pick || !G.captain[pick]) return toast('str, dex or int only');
    G.captain.credits -= cost;
    G.captain[pick].pips++;
    addLog('🎓 trained ' + pick + ' (−2000c)');
  } else {
    G.captain.credits -= cost;
    G.captain.hpMax++;
    G.captain.hp++;
    addLog('🎓 HP max +1 (−20000c)');
  }
  spendAP(1, 'Training');
  commit(); renderView();
};
window.portBuyN = () => {
  if (G.captain.credits < 5) return toast('Need credits');
  const roll = Dice.d100();
  const t = TABLES['N-NEEDED'];
  const row = t.rows.find(x => rollInRange(roll, x.roll)) || t.rows[t.rows.length - 1];
  G.captain.credits -= 10;
  spendAP(1, 'Supplies');
  addLog('📦 supply: ' + (row.text || '').slice(0, 60) + ' (−10c)');
  commit(); renderView();
};
window.portRefuel = (what) => {
  if (G.captain.credits < 10) return toast('Need 10c');
  G.captain.credits -= 10;
  if (what === 'fuel') G.ship.current.fuel++;
  else {
    // power restores to depleted LS first
    if (G.ship.current.lifeSupport < G.ship.ls) G.ship.current.lifeSupport++;
    else G.ship.current.power++;
  }
  spendAP(1, 'Shipyard');
  addLog((what === 'fuel' ? '⛽ fuel +1' : '🔋 power/LS +1') + ' (−10c)');
  commit(); renderView();
};
window.portHire = () => {
  G.captain.crew = G.captain.crew || { pilot: 0, gunner: 0, engineer: 0, medic: 0, security: 0 };
  const types = Object.keys(G.captain.crew);
  const pick = prompt('Crew type: ' + types.join(', '));
  if (pick && pick in G.captain.crew) {
    G.captain.crew[pick]++;
    if (pick === 'pilot' || pick === 'gunner' || pick === 'engineer') G.ship.bridgeCrew = (G.ship.bridgeCrew || 0) + 1;
    spendAP(3, 'Crew Hire');
    addLog('👥 hired ' + pick + ' — bridge crew ' + G.ship.bridgeCrew + ' (CM recalc)');
  }
  commit(); renderView();
};
window.portPassenger = () => {
  const t = TABLES['Z-STAR-SYSTEMS'] || TABLES['GB-N-NAMES'];
  const roll = Dice.d100();
  const row = t.rows.find(x => rollInRange(roll, x.roll)) || t.rows[t.rows.length - 1];
  spendAP(1, 'Passenger Lounge');
  G.captain.passengers = (G.captain.passengers || 0) + 1;
  addLog('🧳 passenger aboard → ' + (row.text || 'system').slice(0, 40) + ' (100c on delivery)');
  commit(); renderView();
};
window.portDropoff = () => {
  if (!G.captain.passengers) return toast('No passengers aboard');
  G.captain.passengers--;
  G.captain.credits += 100;
  spendAP(1, 'Drop off');
  addLog('📍 passenger delivered (+100c)');
  commit(); renderView();
};
window.portSet = (k, v) => { G.port[k] = v; commit(); renderView(); };
window.portDock = () => {
  G.port.docked = !G.port.docked;
  if (G.port.docked && G.port.type === 'station') { G.captain.credits -= 50; toast('Docked — 50c fee'); }
  else toast(G.port.docked ? 'Docked' : 'Undocked');
  commit(); renderView();
};

/* ============================ TABLES BROWSER ============================ */
let openTable = null;
function renderTables(v) {
  const keys = Object.keys(TABLES);
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Rulebook Tables</h3>
    <div class="row">${keys.map(k =>
      `<button onclick="openTbl('${k}')" style="${openTable === k ? 'border-color:var(--gold);color:var(--gold-bright)' : ''}">${k}</button>`).join('')}
    </div>
    <div id="tblView" style="margin-top:10px"></div>
  </div>`;
  if (openTable) drawTable();
}
window.openTbl = k => { openTable = k; renderView(); };
function drawTable() {
  const t = TABLES[openTable]; if (!t) return;
  $('tblView').innerHTML = `
    <div class="row"><button class="primary" onclick="rollTable('${openTable}')">Roll d100 on ${esc(t.table)}</button>
    <span class="badge">${t.rows.length} rows · ${esc(t.source)}</span></div>
    <div id="tblOut3" style="margin:8px 0"></div>
    <table class="tbl"><tr><th style="width:70px">d100</th><th>Result</th></tr>
    ${t.rows.map(r => `<tr><td><b>${esc(r.roll)}</b></td><td>${esc(r.text)}</td></tr>`).join('')}</table>`;
}

/* ============================ GALAXY (Book 2) ============================ */
let galCenter = [0, 0];
function renderGalaxy(v) {
  const g = G.galaxy;
  const proc = GB_PROCEDURES;
  v.innerHTML = artBanner() + `
  <div class="card"><h3>Sector ${esc(g.sector)} — ${esc(g.sectorName)}</h3>
    <div class="row">
      <div><label>Sector #</label><input value="${esc(g.sector)}" style="width:60px" onchange="galSet('sector',this.value)"></div>
      <div><label>Name</label><input value="${esc(g.sectorName)}" onchange="galSet('sectorName',this.value)"></div>
      <div><label>Star date</label><input value="${esc(g.starDate)}" style="width:100px" onchange="galSet('starDate',this.value)"></div>
      <div><label>Captain age</label><input type="number" value="${g.captainAge}" style="width:56px" onchange="galSet('captainAge',+this.value)"></div>
      <button onclick="galYear()">+1 Year (age, HP max −1 after 20)</button>
    </div>
  </div>
  <div class="card"><h3>Sector Hex Map — tap hex to add/cycle system · lanes connect neighbours</h3>
    <div class="row" style="margin-bottom:6px"><button class="${window.galLaneMode ? 'danger' : ''}" onclick="galToggleLaneMode()">🛣️ ${window.galLaneMode ? 'Lane mode: ON' : 'Lane mode: OFF'}</button></div>
    <svg id="galMap" class="map"></svg>
    <div id="sysPanel" style="margin-top:10px"></div>
    <details style="margin-top:12px" class="card"><summary style="cursor:pointer;color:var(--gold);font-weight:bold">📖 Book diagrams (reference)</summary>
      <div style="font-size:12px;margin-top:6px">
        <p><b>Elevation & sectors</b></p><img src="art/diag-elevation.webp" style="width:100%;border-radius:8px" loading="lazy">
        <p><b>Sector distance (100 LY)</b></p><img src="art/diag-distance.webp" style="width:100%;border-radius:8px" loading="lazy">
        <p><b>Hex movement counting</b></p><img src="art/diag-hexmove.webp" style="width:100%;border-radius:8px" loading="lazy">
        <p><b>Deep-space link examples</b></p><img src="art/diag-sector.webp" style="width:100%;border-radius:8px" loading="lazy">
      </div>
    </details>
    <div style="margin-top:12px"><h3 style="color:var(--gold)">Time — Star Date & Actions (Book 2)</h3>
      <div style="font-size:13px;margin-bottom:6px">Star date <b>${G.captain.year}.${String(G.captain.month || 1).padStart(2, '0')}.${String(G.captain.day || 1).padStart(2, '0')}</b> · AP today <b>${G.captain.apUsed || 0}/${G.captain.apQuota}</b>
        <input type="number" value="${G.captain.apQuota}" min="1" max="30" style="width:50px;margin-left:8px" onchange="G.captain.apQuota=parseInt(this.value)||10;commit();renderView()" title="Daily AP quota from the Time Sheet Action Chart (TL × bridge crew cross-reference)">
      </div>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <button onclick="apDay()">📅 Next day</button>
        <button onclick="combinedJump()">🚀 Combined jump</button>
        <input id="jumpLY" type="number" placeholder="LY" min="1" style="width:70px" title="Distance in light years">
        <button onclick="apPush()">💪 Push Action (Int${Math.max(0, ((G.captain.apUsed || 0) - G.captain.apQuota)) * 5 ? ' −' + Math.max(0, ((G.captain.apUsed || 0) - G.captain.apQuota)) * 5 : ''})</button>
      </div>
    </div>
    <div style="margin-top:12px"><h3 style="color:var(--gold)">Trigger Dates & Ageing (Book 2)</h3>
      <div style="font-size:12px;margin-bottom:4px">Max primary (race): 
        <select onchange="setMaxRace(this.value)" style="max-width:110px">
          ${['Human', 'Alien', 'Cyboid'].map(r => `<option value="${r}" ${((G.captain.maxPrimary || {}).hp === ({ Human: 60, Alien: 50, Cyboid: 70 })[r]) ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <span style="margin-left:6px">Str ${G.captain.maxPrimary.str} · Dex ${G.captain.maxPrimary.dex} · Int ${G.captain.maxPrimary.int} · HP ${G.captain.maxPrimary.hp}</span>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <input id="trigText" placeholder="Event to trigger (e.g. Borrowed: relative arrives)" style="flex:1;min-width:170px">
        <input id="trigDays" type="number" value="7" min="1" max="360" style="width:56px" title="days from today">
        <button onclick="addTrigger()">⏰ Set trigger</button>
      </div>
      ${(G.captain.triggers || []).length ? '<div style="font-size:12px;margin-top:4px">' + G.captain.triggers.map((t, i) => `<div>⏰ ${t.date} — ${esc(t.text)} <button style="padding:0 6px" onclick="G.captain.triggers.splice(${i},1);commit();renderView()">✕</button></div>`).join('') + '</div>' : '<div style="font-size:11px;opacity:.7;margin-top:4px">No pending trigger dates</div>'}
    </div>
    <div style="margin-top:12px"><h3 style="color:var(--gold)">Events (Book 2)</h3>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <button onclick="rollEvent('port')">🏙️ Port event</button>
        <button onclick="rollEvent('space')">🚀 Space event</button>
        <button onclick="rollEvent('missionDaily')">📅 Mission/daily event</button>
        <button onclick="rollEvent('any')">🎲 Any event</button>
        <button onclick="econRoll()">💰 Economy roll</button>
      </div>
      <div style="font-size:11px;opacity:.75;margin-top:4px">Traded something? Log it with the commodity name — economy tracks adjust per Book 2 p28 (port phase rule: shade pip → d6)</div>
      <div id="eventOut" style="margin-top:8px;font-size:13px"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button onclick="rollTable('GB-S-STAR-SYSTEMS')">Roll (GB) S — system</button>
      <button onclick="rollTable('GB-N-NAMES')">Roll (GB) N — names</button>
      <button onclick="rollTable('GB-O-OPERATIONS')">Roll (GB) O — operation</button>
      <button onclick="rollTable('GB-E-EVENTS')">Roll (GB) E — event</button>
      <button onclick="rollTable('GB-IM-INSTANT-MISSIONS')">Roll (GB) IM — instant mission</button>
      <button onclick="rollTable('GB-C-CARGO-PRICES')">Roll (GB) C — cargo</button>
      <button onclick="rollTable('GB-DM-DISTANCE-MARKER')">Roll (GB) DM — distance</button>
      <button onclick="rollTable('GB-H-HYPER-JUMP-LANES')">Roll (GB) H — jump lanes</button>
      <button onclick="rollTable('GB-OR-OPERATION-REWARD')">Roll (GB) OR — reward</button>
      <button onclick="rollTable('J-JUMP-ERROR')">Table J — jump error</button>
    </div>
    <div id="tblOut4"></div>
  </div>
  <div class="card"><h3>Procedures</h3>
    <details open><summary style="color:var(--gold);cursor:pointer">Adding a Star System (10 steps)</summary>
      <ol>${proc.addStarSystem.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
    <details><summary style="color:var(--gold);cursor:pointer">Creating a New Galaxy</summary>
      <ol>${proc.newGalaxy.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
    <details><summary style="color:var(--gold);cursor:pointer">Generating Operations (8 steps)</summary>
      <ol>${proc.generatingOperations.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
  </div>`;
  renderGalaxyMap($('galMap'), g, galCenter);
  renderSystemPanel($('sysPanel'), g);
}
function renderSystemPanel(el, g) {
  if (!el) return;
  const key = g.selKey;
  const sys = key && g.hexes[key];
  if (!sys) { el.innerHTML = '<div class="empty">Tap a system on the map to open its detail panel.</div>'; return; }
  const threats = TABLES['GB-S-STAR-SYSTEMS'];
  const row = sys.roll && threats.rows.find(x => rollInRange(sys.roll, x.roll));
  const econRoll = TABLES['GB-C-CARGO-PRICES'];
  const econ = sys.econRoll && econRoll.rows.find(x => rollInRange(sys.econRoll, x.roll));
  el.innerHTML = `
  <div class="card"><h3>System ${esc(sys.name)} <span style="font-weight:400;font-size:12px">(${key})</span></h3>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <span class="badge">${esc(sys.threatText ? sys.threatText.split('—')[0].trim() : 'threat?')}</span>
      ${sys.reward ? `<span class="badge">reward ${esc(sys.reward)}</span>` : ''}
      ${sys.lightYears ? `<span class="badge">${sys.lightYears} ly</span>` : ''}
    </div>
    <div style="margin-bottom:6px"><label>Points of interest</label>
      <div class="row" style="flex-wrap:wrap;gap:6px">${sys.pois.map(p => `<span class="badge">${esc(p)}</span>`).join('') || '<span style="opacity:.6;font-size:12px">none</span>'}</div></div>
    <div style="font-size:12px;opacity:.85;margin-bottom:8px">${esc(sys.threatText || '')}</div>
    ${econ ? `<div style="font-size:12px;margin-bottom:8px"><b>Economy (C):</b> ${esc(econ.text.slice(0, 160))}</div>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:6px">
      <button onclick="galCyclePoi('${key}')">🔄 Cycle POI</button>
      <button onclick="galRollPoi('${key}')">🎲 Roll POIs (S)</button>
      <button onclick="galName('${key}')">📜 Name (N)</button>
      <button onclick="galReward('${key}')">💰 Reward adjust</button>
      <button onclick="galEcon('${key}')">🏷️ Economy (C)</button>
      <button onclick="galLy('${key}')">📏 Light years (DM)</button>
      <button class="danger" onclick="galRemove('${key}')">✕ Remove system</button>
    </div>
    ${sys.zones ? `<div style="font-size:12px;margin-top:8px"><b>Zones:</b> ${esc(sys.zones)}</div>` : ''}
  </div>`;
}
window.galCyclePoi = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const list = (typeof POI_LIST !== 'undefined' && POI_LIST.length) ? POI_LIST : ['starfield'];
  sys._cycle = (sys._cycle === undefined ? -1 : sys._cycle) + 1;
  if (sys._cycle >= list.length) sys._cycle = -1;
  sys.pois = sys._cycle >= 0 ? [list[sys._cycle]] : [];
  addLog(`🌌 ${key}: POI → ${sys.pois[0] || 'none'}`);
  commit(); renderView();
};
window.galRollPoi = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const roll = Dice.d100();
  const sRows = TABLES['GB-S-STAR-SYSTEMS'].rows;
  const row = sRows.find(x => rollInRange(roll, x.roll)) || sRows[sRows.length - 1];
  sys.roll = roll; sys.threatText = row.text;
  const n = (row.text.match(/(\d+)\s*POI/i) || [null, 1])[1];
  const list = (typeof POI_LIST !== 'undefined' && POI_LIST.length) ? POI_LIST : ['starfield'];
  sys.pois = Array.from({length: +n}, () => list[Math.floor(Math.random() * list.length)]);
  addLog(`🌌 ${key}: ${n} POIs — ${sys.pois.join(', ')}`);
  commit(); renderView();
};
window.galName = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const t = TABLES['GB-N-NAMES'];
  const roll = Dice.d100();
  const p = t.rows.find(x => rollInRange(roll, x.roll)) || t.rows[t.rows.length - 1];
  const d = p.data || {};
  const letter = (sys.name[0] || 'A').toUpperCase();
  sys.name = letter + ((d.starSystemPrefix || '') + (d.starSystemSuffix || ''));
  addLog(`📜 ${key} named: ${sys.name} (N table ${roll})`);
  commit(); renderView();
};
window.galReward = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const roll = Dice.d100();
  const rows = TABLES['GB-C-CARGO-PRICES'].rows;
  const row = rows.find(x => rollInRange(roll, x.roll)) || rows[rows.length - 1];
  const adj = (row.text.match(/[+-]\d+\$|\+\d+\$/) || ['0'])[0];
  sys.reward = adj;
  addLog(`💰 ${key} reward adjustment: ${adj}`);
  commit(); renderView();
};
window.galEcon = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const roll = Dice.d100();
  sys.econRoll = roll;
  addLog(`🏷️ ${key} economy rolled (C table)`);
  commit(); renderView();
};
window.galLy = (key) => {
  const sys = G.galaxy.hexes[key]; if (!sys) return;
  const roll = Dice.d100();
  const dmRows = TABLES['GB-DM-DISTANCE-MARKER'].rows;
  const row = dmRows.find(x => rollInRange(roll, x.roll)) || dmRows[dmRows.length - 1];
  const d6 = Dice.d6();
  let val = 0;
  const m = (row.text || '').match(new RegExp('d6=' + d6 + ': ([+-]?\\d+)'));
  if (m) val = +m[1];
  sys.lightYears = val;
  addLog(`📏 ${key} distance marker: d100=${roll} → ${row.text ? row.text.slice(0, 60) : ''} → ${val} ly`);
  commit(); renderView();
};
window.galRemove = (key) => { delete G.galaxy.hexes[key]; if (G.galaxy.selKey === key) G.galaxy.selKey = null; addLog(`🌌 system ${key} removed`); commit(); renderView(); };
window.galSet = (k, v) => { G.galaxy[k] = v; commit(); renderView(); };
window.galLaneMode = false;
window.galToggleLaneMode = () => { window.galLaneMode = !window.galLaneMode; renderView(); toast(window.galLaneMode ? 'Lane mode ON — tap systems to connect jump lanes' : 'Lane mode OFF'); };
window.galYear = () => {
  G.galaxy.captainAge++;
  G.galaxy.starDate = incrementStarDate(G.galaxy.starDate);
  commit(); renderView(); toast(`Year passed — age ${G.galaxy.captainAge}`);
};
function incrementStarDate(sd) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(sd);
  if (!m) return sd;
  return `${m[1]}.${m[2]}.${+m[3] + 1}`;
}
window.onGalaxyHexClick = (q, r) => {
  const key = q + ',' + r;
  const sys = G.galaxy.hexes[key];
  if (window.galLaneMode) {
    if (!sys) { toast('Empty hex — add a system first'); return; }
    const DIRS = { NE:[1,-1], E:[1,0], SE:[0,1], SW:[-1,1], W:[-1,0], NW:[0,-1] };
    let added = 0, removed = 0;
    for (const d in DIRS) {
      const [dq, dr] = DIRS[d];
      const nKey = (q+dq) + ',' + (r+dr);
      if (G.galaxy.hexes[nKey]) {
        sys.lanes = sys.lanes || {};
        if (sys.lanes[d]) { delete sys.lanes[d]; removed++; }
        else { sys.lanes[d] = true; added++; }
      }
    }
    addLog(`🛣️ ${key}: +${added} / −${removed} jump lanes`);
    commit(); renderView(); return;
  }
  if (sys) {
    // existing system: open detail panel (POI cycling moved to panel buttons)
    G.galaxy.selKey = (G.galaxy.selKey === key) ? null : key;
  } else {
    // roll name + system details automatically (Book 2: Table S threat + Table N name)
    const threat = TABLES['GB-S-STAR-SYSTEMS'];
    const roll = Dice.d100();
    const row = threat.rows.find(x => rollInRange(roll, x.roll)) || threat.rows[0];
    const poi = (typeof POI_LIST !== 'undefined' && POI_LIST.length) ?
      [POI_LIST[Math.floor(Math.random() * POI_LIST.length)]] : [];
    G.galaxy.hexes[key] = { star: true, name: 'SYS-' + key, roll, threatText: row.text, lanes: {}, pois: poi, _cycle: 0 };
    G.galaxy.selKey = key;
    addLog(`🌌 new system at ${key} (${row.text})${poi.length ? ' · ' + poi[0] : ''}`);
  }
  commit(); renderView();
};
/* rollTable fallback if tblOut absent (galaxy tab uses tblOut4) */
const _rollTable = window.rollTable;
window.rollTable = key => {
  const t = TABLES[key]; if (!t) { toast('Table missing'); return; }
  const r = Dice.d100();
  const row = t.rows.find(x => rollInRange(r, x.roll)) || t.rows[t.rows.length - 1];
  if (key && key.startsWith('E-')) window._lastEnemy = row.data || { name: (row.text || '').split('\n')[0] };
  const out = $('tblOut') || $('tblOut2') || $('tblOut3') || $('tblOut4') || $('tblView');
  if (out) out.innerHTML = `<div class="badge">d100 = ${r} · ${esc(t.table)}</div>
    <div style="margin-top:6px"><b>${esc(row.roll)}:</b> ${esc(row.text)}</div>`;
  addLog(`📋 ${t.table}: ${r} → ${row.roll}`);
};

/* ---------- boot ---------- */
renderTabs(); renderView();
