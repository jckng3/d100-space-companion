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
function renderView() {
  const v = $('view');
  ({ dice: renderDice, captain: renderCaptain, ship: renderShip, away: renderAway,
     space: renderSpace, port: renderPort, tables: renderTables, galaxy: renderGalaxy }[currentTab])(v);
  renderTabs();
}

/* ============================ DICE ============================ */
let rollHistory = [];
function renderDice(v) {
  v.innerHTML = `
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
  const pipRow = (label, obj, max = 10, color = 'gold') =>
    `<div class="row"><div style="min-width:120px"><label>${label}</label></div>
     <div class="pips">${pips(obj.pips, max, `capPip('${label === 'Str' ? 'str' : label === 'Dex' ? 'dex' : 'int' === 'int' ? 'int' : label}', ${max})`)}</div></div>`;
  const skillRows = Object.entries(c.skills).map(([name, s]) => `
    <tr><td>${name}</td><td>${s.bonus > 0 ? '+' : ''}${s.bonus}</td>
    <td><span class="pips">${pips(s.pips, 10, `skillPip('${name}',1)`)}</span></td>
    <td><input type="checkbox" ${s.star ? 'checked' : ''} onclick="skillStar('${name}',this.checked)"></td></tr>`).join('');
  v.innerHTML = `
  <div class="card"><h3>Captain</h3>
    <div class="row">
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
  v.innerHTML = `
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
  v.innerHTML = `
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
      ${target && target.hp === 0 ? '<div class="badge">☠ Enemy defeated — award XP & [K] loot!</div>' : ''}`;
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
      const armour = 0; // manual: deduct equipped armour A for the location if any
      const dmgMod = target && target.dmg !== undefined ? (parseInt(target.dmg, 10) || 0) : 0;
      const total = Math.max(0, d + loc.mod + dmgMod - armour);
      G.captain.hp = Math.max(0, G.captain.hp - total);
      html += `<div style="margin-top:4px">Enemy HIT you (d100 ${roll} ≤ AV ${av}) — ${LOC_NAME[loc.n]}: 1d6(${d}) ${loc.mod >= 0 ? '+' : ''}${loc.mod} ${dmgMod ? dmgMod > 0 ? '+' + dmgMod : dmgMod : ''} − armour ${armour} = <b>${total} dmg</b> → HP ${G.captain.hp}/${G.captain.hpMax}</div>`;
      addLog(`🩸 took ${total} dmg (${loc.name}) — HP ${G.captain.hp}`);
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
function renderSpace(v) {
  const sc = G.space;
  v.innerHTML = `
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
        </div>
        <div class="row" style="margin-top:6px"><div><label>Damage dealt to you</label><input type="number" id="scDmg" value="0" style="width:60px"></div></div>
      </div>
    </div>
    <div style="margin-top:10px"><h3 style="color:var(--gold)">Your tactical decision</h3>
      <div class="row">${TACTICAL.slice(0, 8).map((t, i) =>
        `<button onclick="scAction(${i})">${t}<br><small>dmg ${CAP_MODS[i] >= 0 ? '+' : ''}${CAP_MODS[i]}, dex ${CAP_DEX[i] >= 0 ? '+' : ''}${CAP_DEX[i]}</small></button>`).join('')}
      <button onclick="scAction(8)">Boarding (dex −20)</button></div>
    </div>
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
  if (capEvasive && enEvasive) { lines.push('Both evaded — combat over'); sc.log.unshift(`R${sc.round}: ${lines.join(' · ')}`); sc.active = false; commit(); renderView(); return; }
  if (capBoard && enBoard) { lines.push('Both boarded — boarding combat begins'); sc.log.unshift(`R${sc.round}: ${lines.join(' · ')}`); sc.active = false; commit(); renderView(); return; }
  // STEP 4: SPACE COMBAT test — adjusted Dex (captain + own action + enemy action mods) +/- CM +/- DT
  const cm = controlModifier(G.captain, G.ship);
  const totalDex = G.captain.dex.primary + capDexMod + enDexMod;
  const r = Dice.test(totalDex + cm, (G.ship.dt || 0));
  const win = r.outcome.includes('success');
  if (win) {
    // captain's ship deals damage: 1d6 + WS + captain's action dmg mod + enemy's action dmg mod (Enemy row on Captain's side? no — victor's mods) − SG
    const dmg = Math.max(0, Dice.d6() + G.ship.ws + capDmgMod - e.sg);
    e.currentPl = Math.max(0, e.currentPl - dmg);
    if (e.currentPl === 0 && dmg > 0) { // surplus to LS handled by dmg calc: remaining after PL goes LS
      lines.push(`enemy hit: ${dmg} dmg → PL 0`);
    } else lines.push(`enemy hit: ${dmg} dmg`);
  } else {
    const dmg = Math.max(0, Dice.d6() + (e.ws || 2) + enDmgMod - G.ship.sg);
    // apply to captain's ship: PL then LS
    let rem = dmg; const toPL = Math.min(G.ship.current.power, rem);
    G.ship.current.power -= toPL; rem -= toPL;
    if (rem > 0) G.ship.current.lifeSupport = Math.max(0, G.ship.current.lifeSupport - rem);
    lines.push(`you took ${dmg} dmg (PL −${toPL}${rem ? `, LS −${rem}` : ''})`);
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
  v.innerHTML = `
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
  </div>`;
}
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
  v.innerHTML = `
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
  v.innerHTML = `
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
}
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
    // existing system: cycle its POI icon; full cycle clears the system
    const list = (typeof POI_LIST !== 'undefined' && POI_LIST.length) ? POI_LIST : ['starfield'];
    if (sys._cycle === undefined) sys._cycle = -1;
    sys._cycle++;
    if (sys._cycle >= list.length + 1) { delete G.galaxy.hexes[key]; addLog(`🌌 system ${key} removed`); }
    else {
      sys.pois = sys._cycle < list.length ? [list[sys._cycle]] : [];
      addLog(`🌌 ${key}: POI → ${sys.pois[0] || 'none'}`);
    }
  } else {
    // roll name + system details automatically (Book 2: Table S threat + Table N name)
    const threat = TABLES['GB-S-STAR-SYSTEMS'];
    const roll = Dice.d100();
    const row = threat.rows.find(x => rollInRange(roll, x.roll)) || threat.rows[0];
    const poi = (typeof POI_LIST !== 'undefined' && POI_LIST.length) ?
      [POI_LIST[Math.floor(Math.random() * POI_LIST.length)]] : [];
    G.galaxy.hexes[key] = { star: true, name: 'SYS-' + key, threatText: row.text, lanes: {}, pois: poi, _cycle: 0 };
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
