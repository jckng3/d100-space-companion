/* help.js — in-app guide: makes the app playable without the rulebooks */
const HELP = {
  start: {
    title: 'Your first session (5 minutes)',
    body: `
    <ol style="margin:6px 0 0 18px;padding:0;line-height:1.55">
      <li><b>Captain tab</b> — roll dice to generate your captain (race, career, characteristics, skills), then spend pips. Don't worry about "right" choices — the app checks legality for you.</li>
      <li><b>Ship tab</b> — roll on the ship tables or set your own. PL (Power Level) is your ship's health: PL first, then LS (Life Support = crew health).</li>
      <li><b>Galaxy tab</b> — roll a star system, add lanes to neighbours, then use <b>Combined jump</b> to travel. Travelling spends AP (Action Pips) and fuel.</li>
      <li><b>Space tab</b> — if something attacks, Begin Space Combat and follow the buttons top-to-bottom. Every modifier from the Tactical Decisions table is applied for you.</li>
      <li><b>Away tab</b> — land somewhere interesting, draw/search areas on the map, fight or talk when you meet something. Dice decide.</li>
      <li><b>Port tab</b> — dock at any system to heal, refuel, trade cargo, grab missions. The <b>Cargo Hold</b> tracks profit; <b>Missions</b> track deadlines.</li>
      <li><b>Galaxy tab, Events card</b> — roll a daily event for flavour and complications. The <b>What now?</b> card on the Captain tab always tells you your options.</li>
    </ol>
    <p style="margin:8px 0 0">That's the whole loop: <b>port → jump → events/combat → port</b>. Money and reputation grow; your captain ages one year per sector visited.</p>`
  },
  checklist: { title: '"What now?" card', body: 'This card reads your game state and lists the actions available right now. If you ever feel lost, look here. Warnings (low fuel, due trigger dates) should be handled first.' },
  dice: { title: 'Dice', body: '<b>d100</b>: roll under your skill number — the app computes targets. <b>d6/d10/d3</b>: for damage and random tables. 01 is always a success, 100 always a fumble, exactly like the books. You rarely need to know more — the app says what a roll means after every throw.' },
  captain: { title: 'Captain tab', body: 'Your character. <b>Str/Dex/Int</b> are raw characteristics; skills add bonuses when they match a situation. <b>HP</b> = your health. <b>Luck/Karma/Rep</b>: spend Karma to re-roll anything once; Rep grows with completed missions and unlocks better gear. The portrait and artwork come from the rulebooks.' },
  ship: { title: 'Ship tab', body: '<b>PL (Power Level)</b> — shields and engine strength; damage hits PL first. <b>LS (Life Support)</b> — crew capacity AND boarding health; at LS 0 in space combat your ship is destroyed. <b>Fuel</b> — 1 per 10 LY jumped. <b>CM (Control Modifier)</b> — a bonus/penalty computed from your Intelligence, tech level and bridge crew; it applies to most ship and repair tests. Refuel and recharge happen at any port for 10c (power restores Life Support first, then PL).' },
  away: { title: 'Away missions', body: 'Roll a mission, then <b>Draw/search areas</b> to reveal map tiles (real rulebook artwork). Searching can find loot, enemies or nothing. In <b>personal combat</b>: Attack compares your weapon skill vs the enemy — the app handles armour by body location and enemy Def. Win: XP + salvage. Flee: try an escape option. <b>Time track</b>: every 6 pips is an hour; enemies may act as time passes — the app prompts you.' },
  space: { title: 'Space combat', body: 'Each round: pick a <b>Tactical Decision</b> (Evasive = safer but weak hits; Attack Plans = strong but exposed; Intercept = fastest to board). The app rolls both sides, applies every damage/Dex modifier, and announces the outcome. <b>Apply Damage</b> — enter damage your ship took; PL absorbs first, overflow hits LS. <b>Damage table</b> — after big hits, roll 1d6 for a broken system. <b>Repairs</b> — an Intelligence test; success restores power, failure loses more. <b>Boarding</b> — get close to capture a ship: crew vs crew, loser loses 1d10 LS each round.' },
  port: { title: 'Port phase', body: 'Work the numbered options top-to-bottom — nothing is compulsory. <b>Medic</b> heals 20c/HP. <b>Supplies/Fuel</b> restock you. <b>Cargo Hold</b>: buy low here, check other systems\' prices, sell high — every trade nudges that system\'s economy prices. <b>Missions</b>: take up to 4; deadlines appear on your star date. <b>Passengers</b>: ferry people for 100c each on delivery. <b>Training</b>: pay to improve your captain permanently. <b>Data chips</b>: buy maps that chart unexplored space.' },
  galaxy: { title: 'Galaxy map', body: 'Each hex is a star system. <b>Roll star system</b> fills a hex with planets, threats and rewards. <b>Lanes</b> connect systems (jump chips and Deep Space chips help chart them). <b>Combined jump</b>: enter distance in light years — one fly test per jump-speed worth of distance, +5 penalty per extra test. Fail and the app finds how far you got and what broke. <b>Economy roll</b> shifts trade prices. <b>Trigger dates</b>: schedule reminders ("Relatives arrive in 10 days") and the log fires them automatically. Visiting a new sector ages your captain 1 year.' },
  tables: { title: 'Tables browser', body: 'Every random table from the books, free to roll any time: loot, enemies, starships, encounters, events. Use them when the story needs a surprise — the app shows what each result means in play.' },
  glossary: {
    title: 'Glossary (all you need)',
    body: `
    <table style="width:100%;font-size:12.5px;line-height:1.5;margin-top:4px">
      <tr><td style="opacity:.7;padding-right:8px;white-space:nowrap">PL</td><td>Power Level — ship shields/health (damage hits this first)</td></tr>
      <tr><td style="opacity:.7">LS</td><td>Life Support — crew capacity &amp; boarding health; 0 = ship lost</td></tr>
      <tr><td style="opacity:.7">AP</td><td>Action Pips — daily energy; each activity costs some. Overspend = next day (or push your luck)</td></tr>
      <tr><td style="opacity:.7">CM</td><td>Control Modifier — ship-wide bonus from your Intelligence + tech + bridge crew</td></tr>
      <tr><td style="opacity:.7">WS / SG</td><td>Weapon Strength / Shield Generator — how hard a ship hits / absorbs</td></tr>
      <tr><td style="opacity:.7">JS</td><td>Jump Speed — max light years per jump test</td></tr>
      <tr><td style="opacity:.7">HP</td><td>Hit Points — captain health</td></tr>
      <tr><td style="opacity:.7">AV / Def</td><td>Attack Value (enemy accuracy) / Defence (harder to hit)</td></tr>
      <tr><td style="opacity:.7">Rep</td><td>Reputation — unlocks gear, missions and passengers</td></tr>
      <tr><td style="opacity:.7">Karma</td><td>Re-roll anything once by spending a pip</td></tr>
      <tr><td style="opacity:.7">XP</td><td>Experience pips — 10 = +1 to a characteristic or skill</td></tr>
      <tr><td style="opacity:.7">Sector</td><td>A map region of ~8×10 hexes; completing one = big rewards, +1 year age</td></tr>
    </table>`
  }
};
window.showHelp = (topic) => {
  const h = HELP[topic]; if (!h) return;
  let el = document.getElementById('helpOverlay');
  if (!el) {
    el = document.createElement('div'); el.id = 'helpOverlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:999;display:flex;align-items:flex-end;justify-content:center';
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    document.body.appendChild(el);
  }
  el.innerHTML = '<div style="background:var(--bg,#14161c);color:var(--fg,#e8e8f0);border-radius:14px 14px 0 0;max-width:640px;width:100%;max-height:78vh;overflow:auto;padding:18px 20px;box-shadow:0 -4px 30px rgba(0,0,0,.5)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;color:var(--gold,#d4af37)">' + h.title + '</h3>' +
    '<button style="padding:2px 10px" onclick="document.getElementById(\'helpOverlay\').remove()">✕</button></div>' +
    '<div style="font-size:13.5px;margin-top:8px">' + h.body + '</div></div>';
};
window.helpBtn = (topic) => '<button style="padding:1px 8px;font-size:11px;margin-left:6px;vertical-align:middle" title="What is this?" onclick="showHelp(\'' + topic + '\')">?</button>';

/* --- inject ? buttons into card headers, once per render --- */
const HELPFUL = [
  ['<h3>🧭 What now?</h3>', 'checklist'], ['<h3>Captain', 'captain'], ['<h3 style="color:var(--gold)">Your ship', 'ship'],
  ['<h3>Space Combat', 'space'], ['📦 Cargo Hold', 'port'], ['📋 Missions', 'port'],
  ['<h3>Port Actions', 'port'], ['<h3 style="color:var(--gold)">Events (Book 2)', 'galaxy'],
  ['Cargo Docks (Book 2 economy)', 'port'], ['<h3 style="color:var(--gold)">Trigger Dates', 'galaxy'],
  ['<h3>Quick Dice', 'dice'], ['<h3>Rulebook Tables', 'tables'],
  ['<h3>Map — tap cell', 'away'], ['<h3>Mission', 'away'], ['<h3>Enemies / Combat', 'away'],
  ['<h3>Starship', 'ship'], ['<h3>Sector Hex Map', 'galaxy'], ['<h3>Jump &amp; Fuel helpers', 'ship'],
  ['📖 Book diagrams (reference)', 'galaxy'], ['<h3>Supplies Tracks', 'port'], ['<h3>Skills &amp; XP', 'captain']
];
window.addHelpButtons = (html) => {
  let out = html;
  for (const [marker, topic] of HELPFUL) {
    if (!out.includes(marker)) continue;
    // find the end of that h3 tag and insert the button just before </h3>
    const i = out.indexOf(marker);
    let j = out.indexOf('</h3>', i);
    if (j < 0) j = out.indexOf('</summary>', i);
    if (j < 0) continue;
    out = out.slice(0, j) + helpBtn(topic) + out.slice(j);
  }
  return out;
};
window.htmlHelp = (html) => addHelpButtons(html);

/* --- first-run tutorial --- */
window.maybeTutorial = () => {
  try {
    if (localStorage.getItem('d100_tutorial_done')) return;
    localStorage.setItem('d100_tutorial_done', '1');
    setTimeout(() => showHelp('start'), 400);
  } catch (err) {}
};
