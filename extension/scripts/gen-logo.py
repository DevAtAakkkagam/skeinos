#!/usr/bin/env python3
"""Generate the Skeinos brand assets from one parametric source of truth.

The mark is the "Weave": a round-capped hash (#) read as one thread woven over &
under a grid. Three white strands form the grid; the left vertical is the indigo
thread, passing OVER the top bar and UNDER the bottom bar (see WEAVE_ORDER). The
single-ink monochrome marks render the same hash flat (no visible interlace),
per the brand's stamps/favicons/print variant. Colours and proportions are taken
from the reference brand sheet (a flat #1b1b21 rounded tile, purple-and-white hash).

Emits (into extension/public):
  - logo.svg                  source of truth (the monochrome mark)
  - brand-glyph.png  512      mask silhouette for the in-app header (CSS mask)
  - icon/{16,24,32,48,64,128}.png  the app-icon tile (dark tile + purple/white hash)
  - icon-light-{32,64}.png    Firefox theme icon for light toolbars (dark mark)
  - icon-dark-{32,64}.png     Firefox theme icon for dark toolbars (light mark)

Run:  python3 scripts/gen-logo.py    (from the extension/ dir)
"""

import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "public"))

# --- palette (sampled from the reference design) ---------------------------
TILE_BG = "#1b1b21"     # flat dark tile
ACCENT = "#8b7fed"      # the one tinted stroke (left vertical)
LIGHT = "#f5f5f7"       # the other three strokes
DARK = "#1f2937"        # monochrome mark on light browser chrome

# --- geometry, in a 24-unit coordinate space -------------------------------
# Tuned for legibility: bold strokes with open counters so the hash still reads
# as a hash at 16 px. The arm tips sit a cap-radius inside the box so the round
# caps never clip.
U = 24.0
A, B = 8.0, 16.0        # strand positions (centred on 12, spacing 8)
T = 4.2                 # stroke thickness (chunky enough to survive 16 px)
INSET = 2.2             # arm-tip inset; >= T/2 so round caps stay inside the box
LO, HI = INSET, U - INSET

# Strands keyed by role. The left vertical is "the thread"; the other three are
# "the grid". The tile tints only the thread.
STRANDS = {
    "vl": (A, LO, A, HI),   # vertical left  — the thread (accent)
    "vr": (B, LO, B, HI),   # vertical right — grid
    "ht": (LO, A, HI, A),   # horizontal top — grid
    "hb": (LO, B, HI, B),   # horizontal bottom — grid
}

# Paint order IS the weave. The brand mark is "one thread, over & under the grid":
# the thread (left vertical) crosses OVER the top bar and UNDER the bottom bar.
# Painting top-bar → grid → thread → bottom-bar lays the thread on top of the top
# bar (over) and the bottom bar on top of the thread (under). On the colour tile
# the white grid + indigo thread make that interlace read; for a single-ink mono
# mark every strand shares one colour so the order is invisible and the hash reads
# flat — exactly the brand's "single-ink monochrome for stamps, favicons, print".
WEAVE_ORDER = ("ht", "vr", "vl", "hb")


def _cap(draw, x, y, r, fill):
    draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def _hex(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def draw_mark(size, colors, offset=(0.0, 0.0), scale=1.0, supersample=8):
    """Render the hash at `size` px. `colors` maps strand role -> RGBA.

    `scale` shrinks the 24-unit mark within the canvas; `offset` (in canvas px)
    re-centres it (used to seat the mark inside the icon tile)."""
    s = size * supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = (s / U) * scale
    ox, oy = offset[0] * supersample, offset[1] * supersample
    r = (T * k) / 2.0
    w = max(1, int(round(T * k)))
    # Paint in weave order so the thread interlaces with the grid (see WEAVE_ORDER).
    for role in WEAVE_ORDER:
        x0, y0, x1, y1 = STRANDS[role]
        fill = colors[role]
        p0 = (x0 * k + ox, y0 * k + oy)
        p1 = (x1 * k + ox, y1 * k + oy)
        d.line([p0, p1], fill=fill, width=w)
        _cap(d, *p0, r, fill)
        _cap(d, *p1, r, fill)
    return img.resize((size, size), Image.LANCZOS)


def mono(color):
    c = _hex(color)
    return {role: c for role in STRANDS}


def rounded_tile(size, fill, radius_frac=0.22, supersample=8):
    s = size * supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=_hex(fill))
    return img.resize((size, size), Image.LANCZOS)


def make_tile(size, glyph_frac=0.60):
    """The full app-icon: dark rounded tile + purple-left/white hash, centred."""
    out = rounded_tile(size, TILE_BG)
    # seat the 24-unit mark at glyph_frac of the tile, centred.
    scale = glyph_frac
    centred = size * (1 - scale) / 2.0
    # Woven mark: white grid (vr/ht/hb) + indigo thread (vl). The weave comes for
    # free from the WEAVE_ORDER paint sequence inside draw_mark.
    mark = draw_mark(
        size,
        colors={"vl": _hex(ACCENT), "vr": _hex(LIGHT), "ht": _hex(LIGHT), "hb": _hex(LIGHT)},
        offset=(centred, centred),
        scale=scale,
    )
    out.alpha_composite(mark)
    return out


def svg_source():
    # Emit in weave order: later <line>s paint over earlier ones, so the thread
    # (vl) sits over the top bar and the bottom bar sits over the thread.
    lines = []
    for role in WEAVE_ORDER:
        x0, y0, x1, y1 = STRANDS[role]
        stroke = ACCENT if role == "vl" else "currentColor"
        lines.append(
            f'    <line x1="{x0:g}" y1="{y0:g}" x2="{x1:g}" y2="{y1:g}" stroke="{stroke}" />'
        )
    body = "\n".join(lines)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {U:g} {U:g}" '
        f'fill="none" role="img" aria-label="Skeinos">\n'
        f"  <title>Skeinos</title>\n"
        f'  <g stroke-width="{T:g}" stroke-linecap="round">\n'
        f"{body}\n"
        f"  </g>\n"
        f"</svg>\n"
    )


def main():
    os.makedirs(os.path.join(PUBLIC, "icon"), exist_ok=True)

    with open(os.path.join(PUBLIC, "logo.svg"), "w") as f:
        f.write(svg_source())

    # In-app header mask: opaque silhouette (alpha is all the CSS mask reads).
    draw_mark(512, mono("#111111")).save(os.path.join(PUBLIC, "brand-glyph.png"))

    # The app-icon tile at the standard ramp (16/24/32/48/64 from the brand
    # sheet) plus 128 for the Chrome Web Store listing. Chrome auto-discovers the
    # sizes it needs; the extras keep the ramp legible at every chrome scale.
    for sz in (16, 24, 32, 48, 64, 128):
        make_tile(sz).save(os.path.join(PUBLIC, "icon", f"{sz}.png"))

    # Firefox theme_icons: monochrome marks that sit on the browser chrome.
    for sz in (32, 64):
        draw_mark(sz, mono(DARK)).save(os.path.join(PUBLIC, f"icon-light-{sz}.png"))
        draw_mark(sz, mono(LIGHT)).save(os.path.join(PUBLIC, f"icon-dark-{sz}.png"))

    print("wrote logo.svg + brand-glyph.png + icon/{16,24,32,48,64,128}.png + icon-{light,dark}-{32,64}.png")


if __name__ == "__main__":
    main()
