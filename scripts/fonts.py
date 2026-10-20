#!/usr/bin/env python3
"""Subset Archivo Variable for the site: python3 scripts/fonts.py

The full @fontsource files are 177 kB and block text rendering on phones. We keep:
- axes wght 400–900 and wdth 62–100 (the CSS uses nothing outside that),
- Basic Latin + Latin-1 + common punctuation in the `latin` file, Czech/Slovak/Polish/German
  extras in the `latin-ext` file (same split and unicode-range as fontsource, so the browser
  fetches latin-ext only when a page actually contains such a letter — i.e. always on Czech pages),
- OpenType features the design uses (tnum for times/scores, kern, liga).
Output: src/assets/fonts/archivo-{latin,latin-ext}.woff2 (hashed by Vite at build).
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

SRC = Path('node_modules/@fontsource-variable/archivo/files')
OUT = Path('src/assets/fonts')
LATIN = [*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2010, 0x2028), *range(0x2030, 0x203B), 0x20AC, 0x2122, 0x2212]
EXT = [ord(c) for c in 'ĀāĂăĄąĆćČčĎďĐđĒēĘęĚěĹĺĽľŁłŃńŇňŐőŔŕŘřŚśŞşŠšŢţŤťŮůŰűŹźŻżŽž']

OUT.mkdir(parents=True, exist_ok=True)
for name, codes in [('latin', LATIN), ('latin-ext', EXT)]:
    font = TTFont(SRC / f'archivo-{name}-wdth-normal.woff2')
    font = instancer.instantiateVariableFont(font, {'wght': (400, 900), 'wdth': (62, 100)})
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'ccmp', 'mark', 'mkmk']
    opts.hinting = False
    opts.name_IDs = [1, 2, 3, 4, 6]
    s = subset.Subsetter(opts)
    s.populate(unicodes=codes)
    s.subset(font)
    font.flavor = 'woff2'
    out = OUT / f'archivo-{name}.woff2'
    font.save(out)
    print(out, out.stat().st_size, 'B')
