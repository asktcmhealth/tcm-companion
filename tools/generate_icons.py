"""
Draws the app icon and writes it into the iOS and Android projects.

The mark is the leaf from the desktop header (app/index.html, .app-mark) in the
app's brand colors (--accent #2f5d50 on cream). It is a PLACEHOLDER-QUALITY
stand-in until real branding exists -- but it is a real, consistent icon, where
before all three apps shipped stock defaults (the Tauri logo on desktop, the
Android robot on Android, and nothing at all on iOS, which App Store Connect
rejects: it requires a 1024x1024 icon).

Outputs:
    brand/app-icon-1024.png                         master, opaque
    mobile/ios/.../AppIcon.appiconset/icon-1024.png + Contents.json
    mobile/android/.../mipmap-*/ic_launcher{,_round}.png
Desktop icons are generated FROM the master with the Tauri CLI:
    cd app && npx tauri icon ../brand/app-icon-1024.png

Run from the repo root:  python tools/generate_icons.py
"""

import json
import math
import os

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
GREEN = (47, 93, 80)      # --accent
CREAM = (255, 254, 251)   # --bg-card
SS = 4                    # supersampling factor for smooth edges


def cubic(p0, p1, p2, p3, n=48):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return pts


def half_circle_bottom(cx, cy, r, n=48):
    """From (cx-r, cy) through (cx, cy+r) to (cx+r, cy) -- the SVG arc used by the leaf."""
    return [(cx - r * math.cos(math.pi * i / n), cy + r * math.sin(math.pi * i / n)) for i in range(n + 1)]


# Leaf outlines, in the 32x32 coordinate system of the SVG in app/index.html.
OUTER = (
    cubic((16, 3), (10, 7), (6, 12.5), (6, 18))
    + half_circle_bottom(16, 18, 10)[1:]
    + cubic((26, 18), (26, 12.5), (22, 7), (16, 3))[1:]
)
INNER = (
    cubic((16, 6.5), (11.5, 10), (8.5, 14.2), (8.5, 18))
    + half_circle_bottom(16, 18, 7.5)[1:]
    + cubic((23.5, 18), (23.5, 14.2), (20.5, 10), (16, 6.5))[1:]
)
VEINS = [
    cubic((16, 14), (14.2, 12.4), (12.8, 12.1), (11.5, 12.6), 16),
    cubic((16, 19), (13.9, 17.3), (12.3, 17.0), (10.8, 17.6), 16),
]


def draw_master(size=1024):
    big = size * SS
    scale = big * 0.64 / 32          # the leaf fills 64% of the icon
    ox = (big - 32 * scale) / 2
    oy = (big - 32 * scale) / 2 - big * 0.015

    def px(pts):
        return [(ox + x * scale, oy + y * scale) for x, y in pts]

    img = Image.new("RGB", (big, big), GREEN)
    overlay = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.polygon(px(OUTER), fill=CREAM + (46,))                       # soft filled leaf (opacity ~0.18)
    stroke = max(2, round(1.5 * scale))

    def line(pts, width):
        # A round dot at EVERY sample point, not just the ends: PIL's own line
        # joins leave visible notches where a sharp apex meets its closing
        # segment (the top tip of the leaf); dense dots give a smooth stroke.
        pts = px(pts)
        d.line(pts, fill=CREAM + (255,), width=width)
        for x, y in pts:
            d.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=CREAM + (255,))

    line(INNER + [INNER[0]], stroke)
    line([(16, 10), (16, 25)], stroke)                              # midrib
    for vein in VEINS:
        line(vein, round(stroke * 0.85))
    img.paste(overlay, (0, 0), overlay)
    return img.resize((size, size), Image.LANCZOS)


def masked(master, size, shape):
    icon = master.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size * SS, size * SS), 0)
    md = ImageDraw.Draw(mask)
    if shape == "round":
        md.ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    else:  # legacy Android launcher squircle-ish rounded square
        md.rounded_rectangle((0, 0, size * SS - 1, size * SS - 1), radius=int(size * SS * 0.18), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    icon.putalpha(ImageChops.multiply(icon.getchannel("A"), mask))
    return icon


def main():
    master = draw_master()

    os.makedirs(os.path.join(ROOT, "brand"), exist_ok=True)
    master.save(os.path.join(ROOT, "brand", "app-icon-1024.png"))

    # iOS: one opaque 1024 image; Xcode 14+ derives every other size from it.
    appicon = os.path.join(ROOT, "mobile", "ios", "TCMScribeMobile", "Images.xcassets", "AppIcon.appiconset")
    master.save(os.path.join(appicon, "icon-1024.png"))
    with open(os.path.join(appicon, "Contents.json"), "w", encoding="utf-8") as f:
        json.dump({
            "images": [{"filename": "icon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
            "info": {"author": "xcode", "version": 1},
        }, f, indent=2)
        f.write("\n")

    # Android: legacy launcher icons per density (square-ish and round).
    res = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
    for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        folder = os.path.join(res, f"mipmap-{density}")
        masked(master, size, "square").save(os.path.join(folder, "ic_launcher.png"))
        masked(master, size, "round").save(os.path.join(folder, "ic_launcher_round.png"))

    print("wrote master, iOS AppIcon set, and 10 Android launcher icons")


if __name__ == "__main__":
    main()
