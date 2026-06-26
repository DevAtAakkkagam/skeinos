"""Frame raw Skeinos screenshots into 1280x800 Chrome Web Store images.

Split layout: left column = feature headline (accent word in brand purple) + a
supporting line + the SKEINOS wordmark; right column = the Skeinos panel cropped
from the raw capture and shown large in a soft-shadowed rounded card.
Flat RGB (no alpha).

Raw captures live in docs/store-assets/raw/ (1852x935, panel at x>=1420).
Output -> docs/store-assets/screenshot-N-*.png.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
RAW = os.path.join(ASSETS, "raw")

W, H = 1280, 800
PAGE = (18, 18, 22)
CARD = (27, 27, 33)
BORDER = (60, 60, 70)
WHITE = (245, 245, 247)
MUTED = (158, 158, 170)
PURPLE = (139, 127, 237)

URB_B = f"{HERE}/Urbanist-700.ttf"
URB_M = f"{HERE}/Urbanist-600.ttf"
SS = 2

# window crop box in the raw captures (x0, y0, x1, y1): trims the host's left
# nav rail and outer margins but keeps the native composer + Skeinos input bar
# (centre) AND the Skeinos panel (right), so it reads as a browser extension.
WINDOW = (108, 14, 1852, 902)

GLYPH_LINES = [
    (2.2, 8, 21.8, 8, WHITE), (16, 2.2, 16, 21.8, WHITE),
    (8, 2.2, 8, 21.8, PURPLE), (2.2, 16, 21.8, 16, WHITE),
]


def badge(side):
    S = side * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=0.1875 * S, fill=CARD + (255,))
    g, off = 0.80 * S, (S - 0.80 * S) / 2
    tx = lambda v: off + (v / 24.0) * g
    sw = max(1, round((4.2 / 24.0) * g))
    r = sw / 2
    for x1, y1, x2, y2, col in GLYPH_LINES:
        a, b = (tx(x1), tx(y1)), (tx(x2), tx(y2))
        d.line([a, b], fill=col + (255,), width=sw)
        for cx, cy in (a, b):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (255,))
    return img.resize((side, side), Image.LANCZOS)


def wchar(d, ch, font):
    bb = d.textbbox((0, 0), ch, font=font)
    return bb[2] - bb[0]


def wtext(d, t, font):
    bb = d.textbbox((0, 0), t, font=font)
    return bb[2] - bb[0]


def wrap(d, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if wtext(d, trial, font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_paragraph(d, text, font, x, y, max_w, line_h, fill, accent=(), accent_fill=PURPLE):
    for line in wrap(d, text, font, max_w):
        cx = x
        for i, word in enumerate(line.split()):
            clean = word.strip(".,&")
            col = accent_fill if clean in accent else fill
            d.text((cx, y), word, font=font, fill=col)
            cx += wtext(d, word + (" " if i < len(line.split()) - 1 else ""), font)
        y += line_h
    return y


def draw_wordmark(img, d, x, y, gs=26, fs=20):
    b = badge(gs)
    img.paste(b, (int(x), int(y)), b)
    f = ImageFont.truetype(URB_B, fs)
    track = 0.14 * fs
    asc, desc = f.getmetrics()
    cx = x + gs + 11
    cy = y + (gs - (asc + desc)) // 2
    for ch in "SKEINOS":
        d.text((cx, cy), ch, font=f, fill=PURPLE if ch == "O" else WHITE)
        cx += wchar(d, ch, f) + track


def frame(raw_path, headline, subtitle, accent, out_path, blur_box=None):
    img = Image.new("RGB", (W, H), PAGE)
    d = ImageDraw.Draw(img)

    # ---- caption (top, centred): headline + supporting line ----
    hl_font = ImageFont.truetype(URB_B, 34)
    sub_font = ImageFont.truetype(URB_M, 19)
    # headline with optional purple accent word(s)
    hl_w = wtext(d, headline, hl_font)
    cx = (W - hl_w) // 2
    for i, word in enumerate(headline.split()):
        col = PURPLE if word.strip(".,&") in accent else WHITE
        d.text((cx, 30), word, font=hl_font, fill=col)
        cx += wtext(d, word + " ", hl_font)
    sub_w = wtext(d, subtitle, sub_font)
    d.text(((W - sub_w) // 2, 76), subtitle, font=sub_font, fill=MUTED)

    # ---- browser-window screenshot in a wide soft-shadowed card ----
    shot = Image.open(raw_path).convert("RGB")
    if blur_box:
        region = shot.crop(blur_box).filter(ImageFilter.GaussianBlur(9))
        shot.paste(region, (blur_box[0], blur_box[1]))
    shot = shot.crop(WINDOW)

    card_w = 1184
    scale = card_w / shot.width
    sw, sh = card_w, int(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)

    sx = (W - sw) // 2
    sy = 128

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [sx - 6, sy - 2, sx + sw + 6, sy + sh + 12], radius=20, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), shadow)

    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=14, fill=255)
    img.paste(shot, (sx, sy), mask)
    d.rounded_rectangle([sx, sy, sx + sw - 1, sy + sh - 1], radius=14, outline=BORDER, width=1)

    # ---- foot wordmark (centred) ----
    fs, gs = 20, 26
    track = 0.14 * fs
    f = ImageFont.truetype(URB_B, fs)
    wm_w = sum(wchar(d, c, f) + track for c in "SKEINOS") - track
    total = gs + 11 + wm_w
    draw_wordmark(img, d, (W - total) // 2, H - 52, gs=gs, fs=fs)

    img.save(out_path, quality=95)
    print("wrote", os.path.basename(out_path))


SHOTS = [
    ("01-sidebar.png", "Organize every chat into folders",
     "Folders, sub-folders, pins and an archive — across Claude, ChatGPT, Gemini and Perplexity.",
     {"folders"}),
    ("02-search.png", "Search across all your AI chats",
     "Full-text search over every conversation, with platform, folder and tag filters. Indexed locally on your device.",
     {"Search"}),
    ("03-prompts.png", "A reusable prompt library",
     "Save prompts with fill-in variables and insert them into any chat with the Ctrl + / shortcut.",
     {"prompt", "library"}, (600, 318, 865, 378)),
    ("04-profiles.png", "Switch instruction profiles instantly",
     "Save your go-to instructions and change how the assistant responds in a single tap.",
     {"profiles"}, (600, 318, 865, 378)),
    ("05-tags.png", "Tag and filter your work",
     "Add tags to conversations and prompts, then filter your whole workspace down to what matters.",
     {"Tag", "filter"}),
]

if __name__ == "__main__":
    for i, shot in enumerate(SHOTS, 1):
        fname, hl, sub, acc = shot[:4]
        blur_box = shot[4] if len(shot) > 4 else None
        slug = hl.lower().replace(",", "").replace(" ", "-")
        frame(os.path.join(RAW, fname), hl, sub, acc,
              os.path.join(ASSETS, f"screenshot-{i}-{slug}.png"), blur_box)
