"""Regenerate Skeinos icons with a larger glyph (less dark padding).

Vector spec mirrors public/logo.svg (24-unit viewBox): four round-capped strokes
forming a '#', left vertical bar in brand purple. Rendered at 4x supersample on a
rounded-square background, then downsampled with LANCZOS for crisp small sizes.
"""
from PIL import Image, ImageDraw

BG = (27, 27, 33, 255)        # #1b1b21
WHITE = (245, 245, 247, 255)  # #f5f5f7
PURPLE = (139, 127, 237, 255) # #8b7fed

GLYPH_FRAC = 0.80   # glyph box as fraction of canvas (was ~0.61)
RADIUS_FRAC = 0.1875
SS = 4              # supersample factor

# logo.svg lines in 24-unit space: (x1,y1,x2,y2,color)
LINES = [
    (2.2, 8, 21.8, 8, WHITE),    # H top
    (16, 2.2, 16, 21.8, WHITE),  # V right
    (8, 2.2, 8, 21.8, PURPLE),   # V left
    (2.2, 16, 21.8, 16, WHITE),  # H bottom
]
STROKE = 4.2  # in 24-unit space


def render(size: int) -> Image.Image:
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # rounded-square background, full canvas
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS_FRAC * S, fill=BG)

    # glyph box centered
    g = GLYPH_FRAC * S
    off = (S - g) / 2

    def tx(v):
        return off + (v / 24.0) * g

    sw = max(1, round((STROKE / 24.0) * g))
    r = sw / 2
    for x1, y1, x2, y2, col in LINES:
        a = (tx(x1), tx(y1))
        b = (tx(x2), tx(y2))
        d.line([a, b], fill=col, width=sw)
        # round caps
        for cx, cy in (a, b):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

    return img.resize((size, size), Image.LANCZOS)


for sz in (16, 24, 32, 48, 64, 128):
    render(sz).save(f"public/icon/{sz}.png")
    print("wrote public/icon/%d.png" % sz)
