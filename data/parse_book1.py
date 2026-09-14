#!/usr/bin/env python3
"""Parse D100 Space Book 1 text tables into JSON files."""
import json, os, re

SRC = '/var/tmp/d100_book1.txt'
OUT = '/home/jack/projects/d100-space-companion/data'

# ---------- text cleanup ----------
GLYPHS = {
    '\uf049': '',        # "hand" bullet in weapons table
    '\uf0b5': '•',
    '\uf06e': '■',
    '\uf0e8': '→',
}
def clean(s):
    s = s.replace('\b', '')
    for k, v in GLYPHS.items():
        s = s.replace(k, v)
    s = re.sub(r'[\uf000-\uf8ff]', '', s)  # any remaining private-use glyphs
    return s.strip()

ROLL_RE = re.compile(r'^\d{1,3}(?:-\d{1,3})?$')
NUM_RE = re.compile(r'^[+-]?\d[\d,]*$')
CRED_RE = re.compile(r'^[+-]?\d[\d,]*c$', re.I)
HDR_RE = re.compile(r'^(?:TABLE\s+)?([A-Z]{1,2})\s+[-–]\s+([A-Za-z][A-Za-z0-9 ,\-/&\'’]{2,40})$')

def norm_name(letter, rest):
    rest = re.sub(r'\s+', ' ', rest).strip()
    return f'{letter} - {rest}'

# ---------- load & locate headers ----------
lines = [clean(l) for l in open(SRC, encoding='utf-8', errors='replace')]
raw_lines = open(SRC, encoding='utf-8', errors='replace').read().split('\n')

headers = []  # (idx, name)
for i, ln in enumerate(lines):
    m = HDR_RE.match(ln)
    if m and len(ln) < 45:
        headers.append((i, norm_name(m.group(1), m.group(2))))

# validate each header occurrence: a 'D100'/'D6' marker within 30 lines
occurrences = []
for idx, (pos, name) in enumerate(headers):
    end = headers[idx + 1][0] if idx + 1 < len(headers) else len(lines)
    body = lines[pos:min(end, pos + 40)]
    if any(b in ('D100', 'D6') for b in body):
        occurrences.append((pos, name, end))

print(f'{len(headers)} header matches, {len(occurrences)} validated occurrences')

# ---------- per-table token extraction ----------
def slice_tokens(pos, end):
    """Return list of tokens (non-empty lines) for a table body, starting after
    the D100/D6 marker and column-name preamble, up to the first roll token."""
    body = [l for l in lines[pos:end] if l]
    # drop everything through the D100/D6 marker
    for j, b in enumerate(body):
        if b in ('D100', 'D6'):
            body = body[j + 1:]
            break
    else:
        return []
    # drop column-name preamble: lines before first roll-shaped token
    start = 0
    for j, b in enumerate(body):
        if ROLL_RE.match(b):
            start = j
            break
    else:
        return []
    return body[start:]

def new_row(roll):
    return {'roll': roll, 'tokens': []}

def split_rows(tokens):
    rows = []
    expect = True
    for t in tokens:
        if expect:
            if ROLL_RE.match(t):
                rows.append(new_row(t))
                expect = False
            # else: junk between rows (rare) -> ignore
        else:
            if ROLL_RE.match(t):
                # could be next roll or numeric data; positional parsers prevent
                # reaching here with pending data for stat tables
                rows.append(new_row(t))
            else:
                rows[-1]['tokens'].append(t)
    return rows

def tidy(rows):
    out = []
    for r in rows:
        text = ' '.join(r['tokens']).strip()
        if not text and '-' not in r['roll']:
            continue  # trailing page-number artifact
        out.append({'roll': r['roll'], 'tokens': r['tokens'], 'text': text})
    return out

# ---------- column parsers ----------
def parse_positional(rows, ncols, keymap):
    out = []
    buf = None
    for r in rows:
        if buf is not None:  # flush pending (row split wrongly)
            out.append(flat_row(buf['roll'], buf['tokens']))
        buf = {'roll': r['roll'], 'tokens': list(r['tokens'])}
        toks = buf['tokens']
        while len(toks) >= ncols:
            row_toks, toks[:] = toks[:ncols], toks[ncols:]
            data = {k: v for k, v in zip(keymap, row_toks) if v and v != '-'}
            out.append({'roll': None, 'data': data, 'text': ' '.join(row_toks)})
        if toks:
            buf['roll'], buf['tokens'] = None, toks
            # tokens left over are continuation of the row just emitted
            out[-1]['text'] += ' ' + ' '.join(toks)
            for t in toks:
                if not NUM_RE.match(t) and not CRED_RE.match(t):
                    out[-1]['data'].setdefault('_extra', []).append(t)
            buf = None
        else:
            buf = None
    # re-assign rolls: emitted data rows carry the pending roll
    return out

def flat_row(roll, tokens):
    return {'roll': roll, 'text': ' '.join(tokens).strip(), 'data': None}

def parse_flat(rows):
    return [flat_row(r['roll'], r['tokens']) for r in rows]

def parse_trailing_credits(rows, name_from_first=True):
    """Rows: [name/text..., credits]. Credits = last token ending in c, or '-'."""
    out = []
    for r in rows:
        toks = r['tokens']
        credits = None
        if toks and (CRED_RE.match(toks[-1]) or toks[-1] == '-'):
            credits = toks[-1]
            toks = toks[:-1]
        text = ' '.join(toks).strip()
        data = {'credits': credits} if credits else None
        out.append({'roll': r['roll'], 'text': ' '.join(r['tokens']).strip(),
                    'data': data, 'name': text.split(':')[0].strip() if ':' in text else None})
    return out

def parse_weapons(rows):
    out = []
    for r in rows:
        toks = list(r['tokens'])
        toks = [t for t in toks if t]  # hand glyphs already stripped
        hand = 'I' if False else None
        # find type (Str/Dex) then text, dmg, credits at end
        dtype = None
        if toks and toks[0] in ('Str', 'Dex'):
            dtype = toks.pop(0)
        elif len(toks) > 1 and toks[1] in ('Str', 'Dex') and toks[0] in ('Str', 'Dex'):
            dtype = toks.pop(0)
        dmg = None
        if len(toks) >= 2 and NUM_RE.match(toks[-2]):
            dmg = toks[-2]
            credits = toks[-1]
            toks = toks[:-2]
        elif toks and NUM_RE.match(toks[-1]):
            credits = toks[-1]
            toks = toks[:-1]
            dmg = None
        else:
            credits = None
        name = toks[0].split(':')[0] if toks and ':' in toks[0] else None
        out.append({'roll': r['roll'], 'text': ' '.join(r['tokens']).strip(),
                    'data': {k: v for k, v in
                             (('type', dtype), ('dmg', dmg), ('credits', credits)) if v},
                    'name': name})
    return out

def parse_mods(rows):
    out = []
    for r in rows:
        toks = list(r['tokens'])
        desc = None
        if toks and len(toks[-1]) > 25 and not NUM_RE.match(toks[-1]) and not CRED_RE.match(toks[-1]):
            desc = toks.pop(-1)
        credits = None
        if toks and CRED_RE.match(toks[-1]):
            credits = toks.pop(-1)
        stats = [t for t in toks[1:] if NUM_RE.match(t)]
        name = toks[0] if toks else ''
        out.append({'roll': r['roll'], 'text': ' '.join(r['tokens']).strip(),
                    'data': {k: v for k, v in
                             (('name', name.lstrip('*')), ('stats', stats) if stats else None,
                              ('credits', credits), ('description', desc)) if v},
                    'name': name.lstrip('*').lstrip('(S) ').lstrip('(M) ').strip()})
    return out

def parse_ships(rows):
    ncols = 15  # model, salvage, TL,CS,DT,FT,FS,LS,JS,PG,PL,WS,SG,M, credits
    out = []
    for r in rows:
        toks = list(r['tokens'])
        if len(toks) < ncols:
            out.append(flat_row(r['roll'], toks))
            continue
        model = toks[0]
        vals = toks[1:ncols]
        credits = vals[-1]
        data = {'model': model.strip(), 'credits': credits}
        keys = ['salvage', 'TL', 'CS', 'DT', 'FT', 'FS', 'LS', 'JS', 'PG', 'PL', 'WS', 'SG', 'M']
        for k, v in zip(keys, vals[:-1]):
            data[k] = v
        extra = toks[ncols:]
        text = model.strip() + ' ' + ' '.join(vals) + (' ' + ' '.join(extra) if extra else '')
        out.append({'roll': r['roll'], 'text': text.strip(), 'data': data})
    return out

def parse_ops(rows):
    out = []
    for r in rows:
        toks = list(r['tokens'])
        title = toks[0] if toks else ''
        data = {'title': title}
        rest = toks[1:]
        m = re.match(r'^M\d+(-\d+)?$', rest[0]) if rest else None
        if m:
            data['mission'] = rest[0]
            rest = rest[1:]
        text = ' '.join(rest).strip()
        dm = re.search(r'Detail:(.*?)(?:Description:|$)', text, re.S)
        if dm:
            data['detail'] = dm.group(1).strip()
        text_out = ' '.join(toks).strip()
        out.append({'roll': r['roll'], 'text': text_out, 'data': data})
    return out

PARSERS = {
    'S - Starships': parse_ships,
    'W - Weapons': parse_weapons,
    'M - Modifications': parse_mods,
    'O - Operations': parse_ops,
    'I - Implants': parse_trailing_credits,
    'K - Kit': parse_trailing_credits,
    'N - Needed': parse_trailing_credits,
}

# ---------- assemble ----------
tables = {}  # name -> {'rows': [...], 'sources': [...]}
for pos, name, end in occurrences:
    toks = slice_tokens(pos, end)
    rows = tidy(split_rows(toks))
    tables.setdefault(name, []).extend(rows)

os.makedirs(OUT, exist_ok=True)
report = {}
for name, rows in sorted(tables.items()):
    parser = PARSERS.get(name, parse_flat)
    parsed = parser(rows)
    safe = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    fname = f'table-{safe}.json'
    doc = {'table': name, 'source': 'book1',
           'rows': [{k: v for k, v in r.items() if k != 'tokens'} for r in parsed]}
    with open(os.path.join(OUT, fname), 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    report[fname] = len(parsed)
    print(f'{fname}: {len(parsed)} rows  ({name})')
