"""Generate Chrome Web Store promo tiles for Skeinos.

Brand wordmark style: 'SKEINOS' in Urbanist (the extension's --sk-font-ui),
uppercase with letter-spacing tracking, matching the in-product brand lockup.

Small promo tile  : 440x280
Marquee promo tile: 1400x560
Both: flat RGB (no alpha).
"""
from PIL import Image, ImageDraw, ImageFont

SP = "/tmp/claude-1000/-home-muthu-repos-aiworkspace/c9b86614-c0f7-48f5-9a3f-0bc4912b3be9/scratchpad"
OUT = SP

PAGE = (18, 18, 22)
BADGE = (27, 27, 33)
WHITE = (245, 245, 247)
MUTED = (150, 150, 160)
PURPLE = (139, 127, 237)

URB_B = f"{SP}/Urbanist-700.ttf"   # wordmark
URB_M = f"{SP}/Urbanist-600.ttf"   # tagline

WORDMARK = "SKEINOS"
TRACK = 0.14   # letter-spacing as fraction of font size

LINES = [
    (2.2, 8, 21.8, 8, WHITE),
    (16, 2.2, 16, 21.8, WHITE),
    (8, 2.2, 8, 21.8, PURPLE),
    (2.2, 16, 21.8, 16, WHITE),
]
STROKE = 4.2
SS = 4


def badge(side):
    S = side * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=0.1875 * S, fill=BADGE + (255,))
    g = 0.80 * S
    off = (S - g) / 2
    tx = lambda v: off + (v / 24.0) * g
    sw = max(1, round((STROKE / 24.0) * g))
    r = sw / 2
    for x1, y1, x2, y2, col in LINES:
        a, b = (tx(x1), tx(y1)), (tx(x2), tx(y2))
        d.line([a, b], fill=col + (255,), width=sw)
        for cx, cy in (a, b):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (255,))
    return img.resize((side, side), Image.LANCZOS)


def tracked_width(d, text, font, track_px):
    w = 0
    for ch in text:
        bb = d.textbbox((0, 0), ch, font=font)
        w += (bb[2] - bb[0]) + track_px
    return w - track_px if text else 0


def draw_tracked(d, xy, text, font, fill, track_px, accent=PURPLE, accent_ch="O"):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=accent if ch == accent_ch else fill)
        bb = d.textbbox((0, 0), ch, font=font)
        x += (bb[2] - bb[0]) + track_px


def fit_wordmark(d, start, min_size, max_w):
    size = start
    while size > min_size:
        f = ImageFont.truetype(URB_B, size)
        if tracked_width(d, WORDMARK, f, TRACK * size) <= max_w:
            return f
        size -= 1
    return ImageFont.truetype(URB_B, min_size)


def fit_plain(d, text, path, start, min_size, max_w):
    size = start
    while size > min_size:
        f = ImageFont.truetype(path, size)
        bb = d.textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= max_w:
            return f
        size -= 1
    return ImageFont.truetype(path, min_size)


def make(w, h, badge_side, pad, gap, wm_size, tag_size, tagline, out):
    img = Image.new("RGB", (w, h), PAGE)
    d = ImageDraw.Draw(img)

    avail = w - (pad + badge_side + gap) - pad
    wm_font = fit_wordmark(d, wm_size, 24, avail)
    tag_font = fit_plain(d, tagline, URB_M, tag_size, 14, avail)

    track_px = TRACK * wm_font.size
    wm_w = tracked_width(d, WORDMARK, wm_font, track_px)
    asc, desc = wm_font.getmetrics()
    wm_h = asc + desc
    tag_bb = d.textbbox((0, 0), tagline, font=tag_font)
    tag_w, tag_h = tag_bb[2] - tag_bb[0], tag_bb[3] - tag_bb[1]

    gap_v = int(tag_font.size * 0.7)
    text_w = max(wm_w, tag_w)
    group_w = badge_side + gap + text_w
    gx = int((w - group_w) // 2)

    b = badge(badge_side)
    img.paste(b, (gx, (h - badge_side) // 2), b)

    tx = gx + badge_side + gap
    block_h = wm_h + gap_v + tag_h
    top = (h - block_h) // 2

    draw_tracked(d, (tx, top), WORDMARK, wm_font, WHITE, track_px)
    ty = top + wm_h + gap_v - tag_bb[1]
    d.text((tx, ty), tagline, font=tag_font, fill=MUTED)

    img.save(out, quality=95)
    print("wrote", out, img.size, img.mode)


make(440, 280, badge_side=132, pad=30, gap=26, wm_size=44, tag_size=19,
     tagline="Organize every AI chat", out=f"{OUT}/promo-small-440x280.png")

make(1400, 560, badge_side=300, pad=80, gap=64, wm_size=110, tag_size=44,
     tagline="Organize, search & reuse every AI chat",
     out=f"{OUT}/promo-marquee-1400x560.png")
