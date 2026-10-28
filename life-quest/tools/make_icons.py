"""
生成应用图标（不用装任何设计软件）。
运行：python tools/make_icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
S = 1024            # 先画大图，最后缩小，边缘才平滑
BG_TOP = (27, 31, 51)
BG_BOTTOM = (11, 14, 21)
GOLD = (246, 196, 83)
GOLD_DARK = (214, 158, 38)
TEAL = (79, 209, 197)
PURPLE = (124, 108, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def star_points(cx, cy, r_out, r_in, n=5, rot=-90):
    pts = []
    for i in range(2 * n):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 360 / (2 * n))
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def build():
    img = Image.new("RGB", (S, S), BG_BOTTOM)
    d = ImageDraw.Draw(img)

    # 1. 竖向渐变背景
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(BG_TOP, BG_BOTTOM, y / S))

    # 2. 两团光晕
    glow = Image.new("RGB", (S, S), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-S * 0.25, -S * 0.35, S * 0.75, S * 0.35], fill=(38, 34, 78))
    gd.ellipse([S * 0.45, -S * 0.15, S * 1.25, S * 0.45], fill=(20, 58, 58))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.12))
    img = Image.blend(img, Image.blend(img, glow, 0.55), 0.7)
    d = ImageDraw.Draw(img)

    # 3. 中央五角星（金色，带一点立体感）
    cx, cy = S / 2, S * 0.535
    d.polygon(star_points(cx, cy + S * 0.012, S * 0.30, S * 0.126), fill=GOLD_DARK)
    d.polygon(star_points(cx, cy, S * 0.30, S * 0.126), fill=GOLD)
    d.polygon(star_points(cx, cy - S * 0.012, S * 0.20, S * 0.086), fill=(255, 226, 148))

    # 4. 底部经验条（三格，代表进度）
    bar_w = S * 0.52
    bar_h = S * 0.052
    gap = S * 0.028
    left = (S - bar_w) / 2
    top = S * 0.80
    # 底槽
    d.rounded_rectangle([left, top, left + bar_w, top + bar_h],
                        radius=bar_h / 2, fill=(34, 41, 58))
    # 已填充部分
    d.rounded_rectangle([left, top, left + bar_w * 0.62, top + bar_h],
                        radius=bar_h / 2, fill=TEAL)
    d.rounded_rectangle([left, top, left + bar_w * 0.30, top + bar_h],
                        radius=bar_h / 2, fill=PURPLE)

    # 5. 底部两个小点（装饰）
    r = S * 0.014
    for i, x in enumerate([S * 0.5 - gap - r, S * 0.5 + gap + r]):
        pass

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    big = build()
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"),
                       (180, "apple-touch-icon.png"), (32, "favicon-32.png")]:
        big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
        print("已生成", name)
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"), optimize=True)


if __name__ == "__main__":
    main()
