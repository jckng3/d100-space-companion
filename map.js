/* ============================================================
   D100 Space Companion — map.js
   SVG map canvas for away missions (facility layout) and
   galaxy builder (hex sectors). Player draws/edits; app stores.
   ============================================================ */

/* ---------- Away mission map ----------
   Grid of square cells (the book's map sheet style). Each cell:
   {x,y, areaId|null, doors:{N,E,S,W: code|null}, marked:bool}
   Exits drawn as door chips; POIs rendered as colored squares by area type. */

const AM_CELL = 64; // px

function newAwayMap(cols = 6, rows = 8) {
  const cells = {};
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      cells[x + ',' + y] = { x, y, area: null, doors: {}, entrance: (y === rows - 1 && x === Math.floor(cols / 2)) };
  return { cols, rows, cells, pan: { x: 0, y: 0 } };
}

function renderAwayMap(svg, map, state) {
  svg.setAttribute('viewBox', `0 0 ${map.cols * AM_CELL} ${map.rows * AM_CELL}`);
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const colors = { yellow: '#c9b458', red: '#a33b3b', green: '#3f7d44', blue: '#3a5f8a' };

  for (const key in map.cells) {
    const c = map.cells[key];
    const px = c.x * AM_CELL, py = c.y * AM_CELL;
    // cell background
    const g = el('g', { 'data-cell': key });
    g.appendChild(el('rect', { x: px, y: py, width: AM_CELL, height: AM_CELL,
      fill: c.area ? colors[c.area.type] : '#182130',
      stroke: c.entrance ? '#e8c860' : '#33415c', 'stroke-width': c.entrance ? 3 : 1, opacity: c.area ? 0.85 : 1 }));
    if (c.area) {
      const t = el('text', { x: px + AM_CELL / 2, y: py + AM_CELL / 2, 'text-anchor': 'middle',
        'dominant-baseline': 'middle', fill: '#0e1420', 'font-size': 13, 'font-weight': 700 });
      t.textContent = c.area.id;
      g.appendChild(t);
    }
    if (c.entrance) {
      const t = el('text', { x: px + AM_CELL / 2, y: py + AM_CELL - 8, 'text-anchor': 'middle', fill: '#e8c860', 'font-size': 10 });
      t.textContent = 'ENTRANCE';
      g.appendChild(t);
    }
    // doors: small notches on edges
    const doorCol = { N: '#d97f2a', S: '#d97f2a', W: '#5aa9d6', E: '#5aa9d6' };
    const pos = { N: [px + AM_CELL / 2 - 10, py - 3], S: [px + AM_CELL / 2 - 10, py + AM_CELL - 7],
                  W: [px - 3, py + AM_CELL / 2 - 10], E: [px + AM_CELL - 7, py + AM_CELL / 2 - 10] };
    const size = { N: [20, 10], S: [20, 10], W: [10, 20], E: [10, 20] };
    for (const d of ['N', 'E', 'S', 'W']) {
      if (c.doors[d]) {
        g.appendChild(el('rect', { x: pos[d][0], y: pos[d][1], width: size[d][0], height: size[d][1],
          fill: doorCol[d], stroke: '#0e1420', 'stroke-width': 0.5 }));
      }
    }
    g.addEventListener('click', () => window.onMapCellClick && window.onMapCellClick(key));
    svg.appendChild(g);
  }
}

/* ---------- Galaxy hex map (Book 2) ----------
   Pointy-top hexes, axial coords. Each hex may hold a star system:
   {star:true, name, threat, reward, lanes:{dir:true}, pois:[]} */
const GX_S = 36;
const GX_W = Math.sqrt(3) * GX_S;
const GX_H = 1.5 * GX_S;
const GX_DIRS = { // axial neighbor directions
  NE: [1, -1], E: [1, 0], SE: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [0, -1]
};

function hexCenter(q, r) {
  return { x: GX_W * (q + r / 2), y: GX_H * r };
}

function renderGalaxyMap(svg, galaxy, centerQR) {
  const range = 5;
  const [cq, cr] = centerQR || [0, 0];
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const hexPoints = (cx, cy) => {
    let pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      pts.push((cx + GX_S * Math.cos(a)).toFixed(1) + ',' + (cy + GX_S * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  };

  for (let q = cq - range; q <= cq + range; q++) {
    for (let r = cr - range; r <= cr + range; r++) {
      if (Math.abs(q + r) > range * 1.5) continue; // rough hex-shape clip
      const { x, y } = hexCenter(q, r);
      const key = q + ',' + r;
      const sys = galaxy.hexes[key];
      const poly = el('polygon', { points: hexPoints(x, y), fill: sys ? '#26405c' : '#141d2c',
        stroke: '#33415c', 'stroke-width': 1 });
      poly.addEventListener('click', () => window.onGalaxyHexClick && window.onGalaxyHexClick(q, r));
      svg.appendChild(poly);
      if (sys) {
        const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#e8dcc8', 'font-size': 12, 'font-weight': 700 });
        t.textContent = sys.name || '★';
        svg.appendChild(t);
        // jump lanes: lines toward linked neighbors
        for (const d in sys.lanes || {}) {
          if (!sys.lanes[d]) continue;
          const [dq, dr] = GX_DIRS[d];
          const n = hexCenter(q + dq, r + dr);
          svg.appendChild(el('line', { x1: x, y1: y, x2: n.x, y2: n.y, stroke: '#c8a040', 'stroke-width': 2, opacity: 0.7 }));
        }
      }
    }
  }
  // center viewBox on current center
  const c = hexCenter(cq, cr);
  const vw = 700, vh = 700;
  svg.setAttribute('viewBox', `${c.x - vw/2} ${c.y - vh/2} ${vw} ${vh}`);
}
