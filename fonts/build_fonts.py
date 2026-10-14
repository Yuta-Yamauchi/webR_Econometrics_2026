"""Build the MLModern web faces used by this page.

Requires fonttools[woff]. Pass the TeX Live texmf-dist directory as the argument.
Original glyph outlines and advance widths are retained; see FONT-NOTICES.txt.
"""
from pathlib import Path
import shutil
import sys

from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.t1Lib import T1Font
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
TEXMF = Path(sys.argv[1])
COPYRIGHT = "Copyright 2003-2009 B. Jackowski and J. M. Nowacki; Copyright 2021 Daniel Benjamin Miller."
NOTICE = "MLModern 1.2 glyphs converted to Unicode OpenType/WOFF2 for this lecture page. See FONT-NOTICES.txt and build_fonts.py."


def build_math(italic=False):
    sources = {}
    for prefix, name in [('r', 'mlmr12.pfb'), ('i', 'mlmmi12.pfb'), ('s', 'mlmsy10.pfb')]:
        original = TEXMF / 'fonts/type1/public/mlmodern' / name
        source_dir = ROOT / 'sources'
        source_dir.mkdir(exist_ok=True)
        shutil.copyfile(original, source_dir / name)
        font = T1Font(original)
        font.parse()
        assert font.font['FontMatrix'] == [0.001, 0, 0, 0.001, 0, 0]
        sources[prefix] = font.getGlyphSet()

    cmap = {}
    for prefix in ['r', 'i', 's']:
        for name in sources[prefix]:
            # Variant glyphs are not substitutes for the default Unicode glyph.
            if '.' in name:
                continue
            text = agl.toUnicode(name)
            if len(text) == 1:
                cmap.setdefault(ord(text), (prefix, name))
    # Math symbols and Greek letters use the same faces as the slide's math mode.
    for prefix in ['i', 's']:
        for name in sources[prefix]:
            text = agl.toUnicode(name)
            if len(text) == 1 and (0x370 <= ord(text) <= 0x3ff or ord(text) >= 0x2100):
                cmap[ord(text)] = (prefix, name)
    cmap[0x3bc] = ('i', 'mu')
    cmap[0x27c2] = ('s', 'perpendicular')
    for char in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz':
        # Unicode math italic letters are useful inside native select options.
        cp = 0x1d434 + ord(char) - 65 if char.isupper() else 0x1d44e + ord(char) - 97
        if char == 'h':
            cp = 0x210e
        cmap[cp] = ('i', char)
        if italic:
            cmap[ord(char)] = ('i', char)

    chosen = {'.notdef': ('r', '.notdef')}
    chosen.update({prefix + '_' + name: (prefix, name) for prefix, name in cmap.values()})
    glyph_order = ['.notdef'] + sorted(set(chosen) - {'.notdef'})
    charstrings, metrics = {}, {}
    for key in glyph_order:
        prefix, name = chosen[key]
        glyph_set = sources[prefix]
        glyph = glyph_set[name]
        bounds_pen = BoundsPen(glyph_set)
        glyph.draw(bounds_pen)
        bounds = bounds_pen.bounds
        pen = T2CharStringPen(round(glyph.width), glyph_set)
        glyph.draw(pen)
        charstring = pen.getCharString()
        charstrings[key] = charstring
        metrics[key] = (round(glyph.width), round(bounds[0]) if bounds else 0)

    style = 'Italic' if italic else 'Regular'
    psname = 'LectureMLModern-' + style
    builder = FontBuilder(1000, isTTF=False)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap({cp: prefix + '_' + name for cp, (prefix, name) in cmap.items()})
    builder.setupCFF(psname, {'FullName': 'Lecture MLModern ' + style, 'FamilyName': 'Lecture MLModern',
                            'Notice': COPYRIGHT + ' ' + NOTICE, 'ItalicAngle': -14.0362 if italic else 0}, charstrings, {})
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=950, descent=-300)
    builder.setupNameTable({'familyName': 'Lecture MLModern', 'styleName': style,
                           'uniqueFontIdentifier': psname + '-1.0', 'fullName': 'Lecture MLModern ' + style,
                           'psName': psname, 'version': 'Version 1.0', 'copyright': COPYRIGHT,
                           'description': NOTICE, 'licenseDescription': 'LPPL 1.3c or later; see LPPL-1.3c.txt',
                           'licenseInfoURL': 'https://www.latex-project.org/lppl/lppl-1-3c/'} )
    builder.setupOS2(sTypoAscender=950, sTypoDescender=-300, usWinAscent=1000, usWinDescent=350,
                     sxHeight=431, sCapHeight=683, usWeightClass=400, fsSelection=1 if italic else 64)
    builder.setupPost(italicAngle=-14.0362 if italic else 0)
    builder.font['head'].macStyle = 2 if italic else 0
    builder.font.flavor = 'woff2'
    output = ROOT / ('lecture-mlmodern-' + style.lower() + '.woff2')
    builder.save(output)
    check = TTFont(output)
    for name in check.getGlyphOrder():
        charstring = check['CFF '].cff.topDictIndex[0].CharStrings[name]
        charstring.draw(BoundsPen(None))
        assert charstring.width == check['hmtx'].metrics[name][0], name
    for cp in map(ord, '0123456789mxyXUYμσβ=+−()[]∼⟂'):
        assert cp in check.getBestCmap(), hex(cp)
    print(output.name, output.stat().st_size, 'bytes')


for style in ['regular', 'bold']:
    shutil.copyfile(TEXMF / 'fonts/opentype/public/tex-gyre' / f'texgyreheros-{style}.otf',
                    ROOT / f'texgyreheros-{style}.otf')
shutil.copyfile(TEXMF / 'doc/fonts/mlmodern/LICENSE', ROOT / 'LPPL-1.3c.txt')
shutil.copyfile(TEXMF / 'doc/fonts/tex-gyre/GUST-FONT-LICENSE.txt', ROOT / 'GUST-FONT-LICENSE.txt')
build_math()
build_math(italic=True)
