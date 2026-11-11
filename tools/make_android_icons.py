#!/usr/bin/env python3
"""
Android launcher icons, splash and shortcut icons for "70", from the v2.3.0 artwork
(icons/source/70-artwork.jpg — the straightened icon square).

  python3 tools/make_android_icons.py

Writes into android/app/src/main/res:
  mipmap-<density>/ic_launcher_fg_<theme>.png  adaptive foreground: the glowing 70 in the safe zone, recolored
                                              to each daily theme's accent ("flame" = the original artwork)
  mipmap-<density>/ic_launcher_mono.png        monochrome layer (themed icons, Android 13+)
  mipmap-anydpi-v26/ic_launcher_<theme>.xml    adaptive icon: background #0B0D10 + foreground (+ monochrome)
  drawable-*/splash.png, drawable-xxxhdpi/splash_icon.png, drawable/ic_shortcut_*.png
"""
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
BG = (0x0B, 0x0D, 0x10)
# Same accents as css/styles.css, section 1b (ruby and silver are the adjusted shades, see DESIGN.md).
THEMES = {
    'flame': None, 'ruby': '#e0185f', 'cobalt': '#2563eb', 'lime': '#84cc16',
    'magenta': '#d946ef', 'silver': '#e2e8f0', 'champagne': '#e9d8a6',
}
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def glyph():
    """The 70 with its glow as RGBA (alpha from the warm orange), cropped to its box."""
    a = np.asarray(Image.open(ROOT / 'icons/source/70-artwork.jpg').convert('RGB')).astype(float)
    n = a.shape[0]
    r, b = a[..., 0], a[..., 2]
    alpha = np.clip((r - 95) / 110, 0, 1) * np.clip((r - b - 20) / 40, 0, 1)
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.sqrt(((xx - 530) / 470) ** 2 + ((yy - 520) / 330) ** 2)
    alpha *= np.clip((1.15 - d) / 0.25, 0, 1)
    rgba = np.dstack([a, alpha * 255]).astype('uint8')
    return Image.fromarray(rgba, 'RGBA').crop((60, 170, 1000, 870))


def recolor(img, hex_color):
    """Keep the light structure of the orange 70, in another accent color."""
    if not hex_color:
        return img
    c = np.array([int(hex_color[i:i + 2], 16) for i in (1, 3, 5)], float)
    a = np.asarray(img).astype(float)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255
    ref = 0.55  # luminance of the original orange body
    k = np.clip(lum / ref, 0, 2)[..., None]
    base = np.clip(c * np.minimum(k, 1), 0, 255)
    hi = np.clip(k - 1, 0, 1) * 0.65  # highlights toward white, like the original's hot core
    out = base * (1 - hi) + 255 * hi
    return Image.fromarray(np.dstack([out, a[..., 3]]).astype('uint8'), 'RGBA')


def foreground(img, px, scale=0.56):
    """108dp canvas; the 70 is `scale` of the width, centered (inside the 66dp safe zone)."""
    can = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    w = round(px * scale)
    g = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    can.alpha_composite(g, ((px - g.width) // 2, (px - g.height) // 2))
    return can


def main():
    g = glyph()
    a = np.asarray(g)
    mono = Image.fromarray(np.dstack([np.full(a.shape[:2] + (3,), 255, 'uint8'), a[..., 3]]), 'RGBA')
    for dens, f in DENSITIES.items():
        d = RES / f'mipmap-{dens}'
        d.mkdir(parents=True, exist_ok=True)
        for old in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
            (d / old).unlink(missing_ok=True)
        px = round(108 * f)
        for t, col in THEMES.items():
            foreground(recolor(g, col), px).save(d / f'ic_launcher_fg_{t}.png', optimize=True)
        foreground(mono, px).save(d / 'ic_launcher_mono.png', optimize=True)
    any26 = RES / 'mipmap-anydpi-v26'
    for old in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        (any26 / old).unlink(missing_ok=True)
    for t in THEMES:
        (any26 / f'ic_launcher_{t}.xml').write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_bg" />\n'
            f'    <foreground android:drawable="@mipmap/ic_launcher_fg_{t}" />\n'
            '    <monochrome android:drawable="@mipmap/ic_launcher_mono" />\n'
            '</adaptive-icon>\n')
    (RES / 'drawable/ic_launcher_background.xml').unlink(missing_ok=True)
    # Splash: #0B0D10 + the icon (Android 12+ splash API icon, and the legacy full-screen splash.png).
    xx = RES / 'drawable-xxxhdpi'
    xx.mkdir(parents=True, exist_ok=True)
    foreground(g, 1152, 0.5).save(xx / 'splash_icon.png', optimize=True)
    for p in RES.glob('drawable*/splash.png'):
        w, h = Image.open(p).size
        can = Image.new('RGBA', (w, h), BG + (255,))
        side = round(min(w, h) * 0.5)
        can.alpha_composite(foreground(g, side, 0.9), ((w - side) // 2, (h - side) // 2))
        can.convert('RGB').save(p, optimize=True)
    # App shortcut icons: the web app's shortcut artwork.
    for k in ('water', 'food', 'scan', 'breathe'):
        Image.open(ROOT / f'icons/shortcut-{k}.png').save(RES / f'drawable-xhdpi/ic_shortcut_{k}.png', optimize=True)
    print('android icons written')


if __name__ == '__main__':
    main()
