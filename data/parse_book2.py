#!/usr/bin/env python3
"""Parse Galaxy Builder (D100 Space Book 2) tables from /var/tmp/d100_book2.txt to JSON.

Outputs to the same directory as this script (data/).
"""
import json, os, re, sys

SRC = '/var/tmp/d100_book2.txt'
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
lines = open(SRC, encoding='utf-8', errors='replace').read().split('\n')

# ---- text cleaning -----------------------------------------------------
def clean(s):
    s = re.sub(r'[\x00-\x08\x0b-\x1f]', '', s)  # overstrike/control junk
    return s.strip()

def seg(a, b):
    """1-indexed inclusive slice, cleaned, non-empty, page-number-only lines dropped."""
    out = []
    for i in range(a - 1, min(b, len(lines))):
        t = clean(lines[i])
        if not t:
            continue
        if re.fullmatch(r'\d{1,3}', t) and False:  # keep digits; row tokens are digits
            pass
        out.append(t)
    return out

def join_paras(text):
    """De-hyphenate line breaks and join lines into prose."""
    text = re.sub(r'(\w)-\s*\n\s*(\w)', r'\1\2', text)
    return re.sub(r'\s*\n\s*', ' ', text).strip()

def dump(name, obj):
    p = os.path.join(OUT_DIR, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    json.load(open(p, encoding='utf-8'))  # validate
    print(f'wrote {name}')
    return p

issues = []
counts = {}

# ---- (GB) C - Cargo Prices  (7207-7571) --------------------------------
COMMODITIES = ['Bio Waste','Chemicals','Contraband','Food','Industrial','Luxury',
               'Medicines','Metals','Minerals','Narcotics','Salvage','Tech',
               'Textiles','Waste','Water','Weapons']
cols = ['ShipsMod','ShipsModification'] + COMMODITIES
toks = seg(7207, 7571)
tiers = []
cur = None
for t in toks:
    if re.fullmatch(r'[+-]?\d+\s*\$', t):
        cur = {'rewardAdjustment': t.replace(' ', ''), 'buy': [], 'sell': [], 'phase': 'buy'}
        tiers.append(cur)
    elif t.startswith('Buy'):
        cur['phase'] = 'buy'
        for v in re.findall(r'[+-]?\d+', t):
            cur['buy'].append(int(v))
    elif t.startswith('Sell'):
        cur['phase'] = 'sell'
        for v in re.findall(r'[+-]?\d+', t):
            cur['sell'].append(int(v))
    elif cur is not None and re.fullmatch(r'[+-]?\d+', t):
        cur[cur['phase']].append(int(t))
cargo = []
for tr in tiers:
    if len(tr['buy']) != 18 or len(tr['sell']) != 18:
        issues.append(f"C tier {tr['rewardAdjustment']}: buy={len(tr['buy'])} sell={len(tr['sell'])} (expected 18)")
    cargo.append({
        'rewardAdjustment': tr['rewardAdjustment'],
        'buy': dict(zip(cols, tr['buy'])),
        'sell': dict(zip(cols, tr['sell'])),
    })
counts['gb-table-C-cargo-prices.json'] = f"{len(cargo)} tiers x 2 rows x 18 values (2 modifiers + 16 commodities)"
dump('gb-table-C-cargo-prices.json',
     {'source': 'Galaxy Builder Book 2, table C - Cargo Prices',
      'columns': cols, 'tiers': cargo})

# ---- (GB) DM - Distance Marker (7573-7930 neg, 7931-8290 pos) ----------
def parse_dm(a, b):
    toks = seg(a, b)
    rows = {}
    i = 0
    while i < len(toks):
        if re.fullmatch(r'\d{1,3}', toks[i]) and i + 6 < len(toks) + 1:
            d100 = int(toks[i]); vals = toks[i+1:i+7]
            if all(re.fullmatch(r'[+-]?\d+', v) for v in vals) and len(vals) == 6:
                rows[d100] = [int(v) for v in vals]
                i += 7
                continue
        i += 1
    return rows
neg = parse_dm(7573, 7930)
pos = parse_dm(7931, 8290)
dm_rows = []
for d100 in sorted(set(neg) | set(pos)):
    dm_rows.append({'d100': d100,
                    'd6': {str(k + 1): (neg.get(d100, [None]*6)[k] if d100 in neg
                                        else pos.get(d100, [None]*6)[k])
                          for k in range(6)}})
counts['gb-table-DM-distance-marker.json'] = f"{len(dm_rows)} rows (d100 1-100 x 6 d6 columns)"
dump('gb-table-DM-distance-marker.json',
     {'source': 'Galaxy Builder Book 2, table DM - Distance Marker',
      'notes': 'd100 1-50 negative (below plane), 51-100 positive (above plane); values are light years from zero height plane',
      'rows': dm_rows})
if len(neg) != 50 or len(pos) != 50:
    issues.append(f"DM: neg={len(neg)} pos={len(pos)} rows (expected 50/50)")

# ---- (GB) E - Events (8291-8432) ----------------------------------------
toks = seg(8291, 8432)
events = []
i = 0
while i < len(toks):
    t = toks[i]
    m = re.fullmatch(r'(\d{1,3})\s*-\s*(\d{1,3})', t)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        vals = toks[i+1:i+4]
        if len(vals) == 3:
            events.append({'roll': f'{lo} - {hi}', 'port': vals[0],
                           'space': vals[1], 'missionDaily': vals[2]})
            i += 4
            continue
    elif re.fullmatch(r'100', t):
        vals = toks[i+1:i+4]
        if len(vals) == 3:
            events.append({'roll': '100', 'port': vals[0],
                           'space': vals[1], 'missionDaily': vals[2]})
            i += 4
            continue
    i += 1
counts['gb-table-E-events.json'] = f"{len(events)} rows"
dump('gb-table-E-events.json',
     {'source': 'Galaxy Builder Book 2, table E - Events',
      'columns': {'port': 'PORT (Port Phase): 40 or less', 'space': 'SPACE (Space Mission): 60 or less',
                  'missionDaily': 'shared column: Travel/Actions each day 20 or less, MISSION (Away Mission) each day 10%'},
      'rows': events})
if len(events) != 34:
    issues.append(f"E: {len(events)} rows (expected 34)")

# ---- (GB) IM - Instant Missions (19520-19636, two page blocks) ----------
FOOTNOTE = "SPECIAL ENEMY: Roll on table E - Enemy and apply the captain's current star system's threat modifier."
toks = seg(19520, 19636)
missions = []
cur = None
for t in toks:
    if re.fullmatch(r'\d{1,2}\s*', t) and int(t) <= 10 and (cur is None or cur['body']):
        if cur is not None and cur['roll'] == int(t) and not cur['title']:
            continue  # page header artefact
        cur = {'roll': int(t), 'title': None, 'rewardSpec': None, 'body': []}
        missions.append(cur)
    elif cur is None:
        continue
    elif cur['title'] is None and re.search(r'\[S:', t):
        m = re.search(r'^(.*?)\s*\[(S:[^\]]+)\]', t)
        cur['title'] = m.group(1).strip()
        cur['rewardSpec'] = m.group(2)
        extra = t[m.end():].strip()
        if extra:
            cur['body'].append(extra)
    elif t == FOOTNOTE or t.startswith('[S]*'):
        continue  # shared footnote
    else:
        cur['body'].append(t)
for msn in missions:
    msn['body'] = join_paras('\n'.join(msn['body']))
    if msn['title'] is None:
        issues.append(f"IM mission roll {msn['roll']}: no title found")
counts['gb-table-IM-instant-missions.json'] = f"{len(missions)} missions"
dump('gb-table-IM-instant-missions.json',
     {'source': 'Galaxy Builder Book 2, table IM - Instant Missions',
      'notes': 'rewardSpec = [S:...] reward; body cleaned (hyphenated line breaks joined, shared footnote removed)',
      'missions': missions})
if len(missions) != 10:
    issues.append(f"IM: {len(missions)} missions (expected 10)")

# ---- (GB) N - Names (19638-20687) ---------------------------------------
toks = seg(19638, 20687)
# header is 14 tokens (labels) up to 'Occupation'; rows start at token '1'
start = toks.index('1', 1) if toks[0] != '1' else 0
# find first token that is exactly '1' after the header block
start = next(i for i, t in enumerate(toks) if t == '1' and i > 10)
ncols = ['sectorPrefix', 'sectorSuffix', 'starSystemPrefix', 'starSystemSuffix',
         'poiPrefix', 'poiSuffix', 'npcName', 'npcSurname', 'npcOccupation']
names = []
i = start
while i < len(toks):
    if re.fullmatch(r'\d{1,3}', toks[i]) and int(toks[i]) == len(names) + 1:
        vals = toks[i+1:i+10]
        if len(vals) == 9:
            names.append(dict(zip(ncols, vals)))
            i += 10
            continue
    i += 1
counts['gb-table-N-names.json'] = f"{len(names)} rows x 9 columns"
dump('gb-table-N-names.json',
     {'source': 'Galaxy Builder Book 2, table N - Names',
      'columns': ncols, 'rows': names})
if len(names) != 100:
    issues.append(f"N: {len(names)} rows (expected 100)")

# ---- (GB) O - Operations (20689-22301, 23 page blocks) ------------------
toks = seg(20689, 22301)
HEADER_NOISE = re.compile(r'^(D100|SM = Space Mission|M\$|(SM|AM) = |Ç = |\(E##\) = |When a word|For Away Missions)')
ops = []
cur = None
for t in toks:
    if t in ('(GB) O – Operations', '(GB) O - Operations'):
        continue
    if HEADER_NOISE.match(t):
        continue
    m = re.fullmatch(r'(\d{1,2})\$', t)
    if m and cur is not None:
        cur['missionBonus'] = t
        continue
    if re.fullmatch(r'\d{1,3}', t) and (cur is None or cur['missionBonus']):
        if cur is not None and int(t) == cur['roll']:
            continue  # stray duplicate
        cur = {'roll': int(t), 'missionBonus': None, 'body': []}
        ops.append(cur)
        continue
    if cur is not None:
        cur['body'].append(t)
for op in ops:
    text = join_paras('\n'.join(op['body']))
    op['body'] = text
    tm = re.search(r"([A-Z][A-Z0-9 &'\-]+?)\s*\((SM|AM[^)]*)\):\s*", text)
    op['title'] = tm.group(1).strip() if tm else None
    op['missionType'] = tm.group(2).strip() if tm else None
counts['gb-table-O-operations.json'] = f"{len(ops)} operations"
dump('gb-table-O-operations.json',
     {'source': 'Galaxy Builder Book 2, table O - Operations',
      'notes': 'missionBonus = M$ value; body is full text incl. reward spec and placeholders ([KEYWORD]/[NPC]/[DATE])',
      'operations': ops})
if not (95 <= len(ops) <= 100):
    issues.append(f"O: {len(ops)} operations (expected ~100)")
missing = [o['roll'] for o in ops if o['missionBonus'] is None]
if missing:
    issues.append(f"O ops missing M$ bonus: {missing}")

# ---- other (GB) tables: H, S, OR ----------------------------------------
# H - Hyper Jump Lanes (8435-8950): 'y=NN' followed by 8 values
toks = seg(8435, 8950)
xcols = list(range(100, 900, 100))
h_rows = []
i = 0
while i < len(toks):
    m = re.fullmatch(r'y=(\d+)', toks[i])
    if m and i + 8 <= len(toks) and all(re.fullmatch(r'\d+', v) for v in toks[i+1:i+9]):
        h_rows.append({'y': int(m.group(1)),
                       'values': {str(x): int(v) for x, v in zip(xcols, toks[i+1:i+9])}})
        i += 9
        continue
    i += 1
counts['gb-table-H-hyper-jump-lanes.json'] = f"{len(h_rows)} y-rows x 8 x-columns"
dump('gb-table-H-hyper-jump-lanes.json',
     {'source': 'Galaxy Builder Book 2, table H - Hyper Jump Lanes (light year distances)',
      'rows': h_rows})

# S - Star Systems (22668-22991)
toks = seg(22668, 22991)
s_rows = []
cur = None
main = None
band_head = False  # next tokens after a band header: '#POI', 'Economy', then sub-ranges
MAIN_BANDS = {'1 - 12', '13 - 24', '25 - 36', '37 - 48', '49 - 60', '61 - 72',
              '73 - 84', '85 - 96', '97 - 100'}
for t in toks:
    m = re.fullmatch(r'(\d{1,3})\s*-\s*(\d{1,3})', t)
    if m and (cur is None or not band_head):
        cur = {'d100': t, 'poiCount': None, 'economy': None, 'zones': []}
        s_rows.append(cur)
        band_head = True
        if cur['d100'] in MAIN_BANDS:  # True band header (not a zone sub-range)
            main = cur
            continue
        # actually a zone sub-range -> treat as zone range of previous main band
        s_rows.pop()
        cur = main
        band_head = False
        cur['zones'].append({'d100': t, 'letters': []})
        continue
    if cur is None:
        continue
    if band_head:
        if t.isdigit() and cur['poiCount'] is None:
            cur['poiCount'] = int(t)
            continue
        if re.fullmatch(r'[+-]?\d+\s*\$', t):
            cur['rewardAdjust'] = t.replace(' ', '')
            band_head = False
            continue
        if not t.isdigit() and cur['economy'] is None:
            cur['economy'] = t
            continue
        if not t.isdigit():
            cur.setdefault('poi', []).append(t)
            continue
    if m:  # zone-letter range within band
        cur['zones'].append({'d100': t, 'letters': []})
        continue
    if cur['zones'] and len(cur['zones'][-1]['letters']) < 6:
        cur['zones'][-1]['letters'].append(t)
for r in s_rows:
    if r['poiCount'] is None or not r['zones']:
        issues.append(f"S band {r['d100']}: incomplete (poi={r['poiCount']}, zones={len(r['zones'])})")
counts['gb-table-S-star-systems.json'] = f"{len(s_rows)} threat bands"
dump('gb-table-S-star-systems.json',
     {'source': 'Galaxy Builder Book 2, table S - Star Systems',
      'notes': 'zones letters map the Z D100 result to zone columns Z3/Z5/Z7/Z9 (6 letters per range, Z1/Z10 always used)',
      'rows': s_rows})

# OR - Operation Reward (22303-22422): RV value then 6 [S]/[F] entries
toks = seg(22303, 22422)
or_rows = []
cur = None
for t in toks:
    if re.fullmatch(r'D6 = \d', t) or t.startswith('THE NUMBER'):
        continue
    if re.fullmatch(r'[+-]?\d{1,2}', t) and (cur is None or len(cur['entries']) == 6):
        cur = {'rewardValue': int(t), 'entries': []}
        or_rows.append(cur)
        continue
    if cur is not None and '[S]' in t:
        parts = [p.strip() for p in t.split('[S]') if p.strip()]
        for p in parts:
            cur['entries'].append('[S]' + p)
counts['gb-table-OR-operation-reward.json'] = f"{len(or_rows)} RV rows x 6 d6 entries"
dump('gb-table-OR-operation-reward.json',
     {'source': 'Galaxy Builder Book 2, table OR - Operation Reward + Credit Reward Chart',
     'notes': 'entries indexed by d6 1-6; crew-size credit chart (bottom of table) not parsed',
      'rows': or_rows})

# ---- procedures ---------------------------------------------------------
def split_steps(toks, pat):
    steps, cur = [], None
    for t in toks:
        m = re.match(pat, t)
        if m:
            cur = {'step': len(steps) + 1, 'heading': re.sub(pat, r'\1', t).strip(),
                   'text': [re.sub(pat, '', t).strip()]}
            steps.append(cur)
        elif cur is not None:
            cur['text'].append(t)
    return [{'step': s['step'], 'heading': s['heading'],
             'text': join_paras('\n'.join(s['text']))} for s in steps]

# Adding Star Systems (420-835): 10 numbered steps
toks = seg(420, 835)
add_star = split_steps(toks, r'^(\d{1,2})\.\s*')
# merge sub-steps (1./2. within a step) back into their parent step
merged = []
for s in add_star:
    if s['heading'].isdigit() and merged:
        merged[-1]['text'] += ' ' + s['text']
    else:
        s['heading'] = re.sub(r'^\d+\s*', '', s['heading'])
        merged.append(s)
add_star = merged
# Creating a New Galaxy (836-1010): steps 1-5; drop sidebar page 924-976
toks = seg(836, 923) + seg(977, 1010)
new_galaxy = split_steps(toks, r'^(\d)\.\s*')
# Generating Operations (1682-1845): 8 steps
toks = seg(1682, 1845)
gen_ops = split_steps(toks, r'^(\d)\.\s*')
procedures = {'addStarSystem': add_star, 'newGalaxy': new_galaxy,
              'generatingOperations': gen_ops}
counts['gb-procedures.json'] = (f"addStarSystem={len(add_star)}, newGalaxy={len(new_galaxy)}, "
                                f"generatingOperations={len(gen_ops)} steps")
dump('gb-procedures.json', {'source': 'Galaxy Builder Book 2 procedures', 'procedures': procedures})
if len(add_star) != 10:
    issues.append(f"addStarSystem: {len(add_star)} steps (expected 10)")
if len(gen_ops) != 8:
    issues.append(f"generatingOperations: {len(gen_ops)} steps (expected 8)")

print('\n--- row counts ---')
for k, v in counts.items():
    print(k, '=>', v)
print('\n--- issues ---')
for i in issues:
    print('*', i)
if not issues:
    print('none')
