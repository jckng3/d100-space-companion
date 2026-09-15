/* ============================================================
   D100 Space Companion — state.js
   Game state model, persistence, dice engine. Pure logic, no DOM.
   Assistant app: we track sheets + roll dice; the PLAYER interprets rules.
   ============================================================ */

/* ---------- persistence ---------- */
const SS_KEY = 'd100space.save.v1';

function defaultState() {
  return {
    meta: { created: Date.now(), updated: Date.now(), version: 1 },
    captain: newCaptain(),
    ship: newShip(),
    away: newAwayMission(),
    space: newSpaceCombat(),
    port: newPortPhase(),
    galaxy: newGalaxy(),
    log: []            // session log of rolls/events [{t, ts, text}]
  };
}

function saveState(state) {
  state.meta.updated = Date.now();
  localStorage.setItem(SS_KEY, JSON.stringify(state));
  return state;
}
function loadState() {
  const raw = localStorage.getItem(SS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function exportState(state) {
  return JSON.stringify(state, null, 2);
}
function importState(json) {
  const s = JSON.parse(json); // throws on bad input — caller catches
  if (!s.captain || !s.ship) throw new Error('Not a D100 Space save file');
  return s;
}

/* ---------- dice ---------- */
/* d10: unit die 0-9, 0 reads as 10. d100: tens+units, 00+0 = 100.
   d3: d6 converted 1-2=1, 3-4=2, 5-6=3. Modifiers applied by caller. */
const Dice = {
  d6() { return 1 + Math.floor(Math.random() * 6); },
  d3() { const r = this.d6(); return r <= 2 ? 1 : r <= 4 ? 2 : 3; },
  d10() { let r = Math.floor(Math.random() * 10); return r === 0 ? 10 : r; },
  d100() {
    const tens = Math.floor(Math.random() * 10) * 10;
    const units = Math.floor(Math.random() * 10);
    let v = tens + units;
    if (v === 0) v = 100;      // 00 + 0
    if (units === 0 && tens !== 0) v = tens; // units 0 stays 0 within tens
    return v;
  },
  roll(spec) { // spec like "2d6", "1d100+15", "1d6-1", "d3"
    const m = /^(?:(\d+)[dD])?(d\d+)([+-]\d+)?$/.exec(spec.replace(/\s/g, ''));
    if (!m) throw new Error('Bad dice spec: ' + spec);
    const n = m[1] ? parseInt(m[1]) : 1;
    const faces = parseInt(m[2].slice(1));
    let total = 0; const rolls = [];
    for (let i = 0; i < n; i++) {
      let r;
      if (faces === 100) r = this.d100();
      else if (faces === 10) r = this.d10();
      else if (faces === 3) r = this.d3();
      else { r = 0; for (let j = 0; j < faces / 6; j++) r += this.d6(); if (faces === 6) r = this.d6(); }
      rolls.push(r); total += r;
    }
    const mod = m[3] ? parseInt(m[3]) : 0;
    return { spec, rolls, mod, total: total + mod };
  },
  /* Test: roll d100 <= modified characteristic.
     Natural 01 always succeeds, natural 100 always fails.
     Natural roll <= 10 earns XP (1 pip char or 2 pips assist skills). */
  test(charValue, modifier = 0, skillBonus = 0) {
    const raw = this.d100();
    const target = charValue + modifier + skillBonus;
    let outcome;
    if (raw === 1) outcome = 'critical-success';
    else if (raw === 100) outcome = 'critical-fail';
    else outcome = raw <= target ? 'success' : 'fail';
    return { raw, target, modifier, skillBonus, outcome, xp: raw <= 10 };
  }
};

/* ---------- captain ---------- */
const SKILLS = ['Agility','Aware','Bravery','Decode','Escape','Explosives','Gamble','Hacking',
  'Heavy Weapons','Haggling','Implants','Intimidate','Investigate','Leadership','Lucky',
  'Melee','Mining','Navigation','Pilots','Ranged','Repairs','Science','Search','Stealth',
  'Strong','Survival','Tactics','Tech','Traps','Trading','Zero-G'];

function newCaptain() {
  const skills = {};
  SKILLS.forEach(s => skills[s] = { bonus: 0, pips: 0, star: false });
  return {
    name: '',
    skills,
    race: 'Human',          // Human | Alien | Cyboid
    career: 'Marine',       // Marine | Smuggler | Techno
    str: { primary: 50, pips: 0, star: false },
    dex: { primary: 40, pips: 0, star: false },
    int: { primary: 30, pips: 0, star: false },
    hp: 20, hpMax: 20,
    rep: 4, karma: 3, life: 3,
    credits: 200,
    abilities: { mightyBlow: false, perfectAim: false, cybercon: false },
    cybercon: { slots: Array.from({length:10}, (_,i) => ({ intLevel: 50 + i*10, implant: null })), powerCells: 10 },
    tracks: { o2: 10, nv: 10, rations: 10, decoders: 10, powerCells: 10, passes: 0 },
    equipment: {
      armour: [],           // {name, a, fix, credits, damagePips, location}
      weapons: [],          // {name, str/dex/int, dmg, credits, notes}
      belt: Array(6).fill(null),
      smallPack: [], largePack: []
    },
    operations: { active: [], completed: 0, failed: 0, checkboxes: {} }, // M1-M2 etc
    passengers: 0, crew: { pilot: 0, gunner: 0, engineer: 0, medic: 0, security: 0 },
    day: 1, month: 1, year: 3000, apUsed: 0, apQuota: 10, apOverflow: 0
  };
}

/* ---------- starship ---------- */
function newShip(model) {
  // Fast Attack Craft defaults from table S
  return {
    name: '',
    model: model || 'Fast Attack Craft',
    tl: 10, cs: 30, dt: 10, ft: 30, fs: 12, ls: 40, js: 60, pg: 10, pl: 25, ws: 2, sg: -2, mods: 2,
    credits: 28000,
    current: { power: 25, fuel: 30, lifeSupport: 40, cargo: 0 },
    bridgeCrew: 0,
    modifications: []       // {name, tl, credits, effect}
  };
}
function controlModifier(captain, ship) {
  return (captain.int.primary - ship.tl) + ship.bridgeCrew;
}

/* ---------- away mission ---------- */
function newAwayMission() {
  return {
    active: false,
    timePips: 0,            // 0-10+
    zone: '', system: '',
    doors: {},              // areaId -> code
    areas: [],              // {id, type:'yellow|red|green|blue', searched, note, mapCell:{x,y}}
    enemies: [],            // {name, hp, hpMax, av, def, dmg, traits, encounterNo}
    combat: null,           // {round, enemyIdx, log}
    objectiveMet: false
  };
}

/* ---------- space combat ---------- */
function newSpaceCombat() {
  return {
    active: false,
    round: 0,
    captainAction: null,    // evasive..boarding keys
    enemy: null,            // {model, pl, ls, ws, sg, currentPl, currentLs}
    boarding: false,
    log: []
  };
}

/* ---------- port phase ---------- */
function newPortPhase() {
  return {
    docked: false, type: 'station', // 'station' | 'military'
    dockingFeePaid: false,
    notes: []
  };
}

/* ---------- galaxy (Book 2) ---------- */
function newGalaxy() {
  return {
    sector: '001',
    sectorName: '',
    starDate: '01.01.3000',
    hexes: {},              // key "q,r" -> {star, name, planeY, threat, reward, lanes:[dir...], pois:[], zones:[]}
    economy: {},            // tier -> {buy:{}, sell:{}}
    law: 0,
    captainAge: 20,
    deepSpaceChips: 0,
    operationsDone: 0
  };
}

/* ---------- session log ---------- */
function pushLog(state, text) {
  state.log.unshift({ ts: Date.now(), text });
  if (state.log.length > 500) state.log.length = 500;
  return state;
}
