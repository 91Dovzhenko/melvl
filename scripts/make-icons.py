"""Рисует PNG-иконки приложения (логотип ME:LVL с холста) без внешних библиотек.
Запуск: python3 scripts/make-icons.py"""
import struct, zlib, os

DARK = (0x15, 0x17, 0x1A)
LIME = (0xC5, 0xF2, 0x5A)
BG = (0xEE, 0xF0, 0xEB)

def inside_rr(x, y, x0, y0, s, r):
    if x < x0 or y < y0 or x > x0 + s or y > y0 + s:
        return False
    cx = min(max(x, x0 + r), x0 + s - r)
    cy = min(max(y, y0 + r), y0 + s - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def render(size, full_bleed):
    # Логотип: тёмный квадрат 28 r9, внутри лайм 10 r3 (пропорции из меню).
    # full_bleed — для apple-touch/maskable: тёмный фон на весь квадрат, лайм по центру.
    ss = 3
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + .5) / ss) / size * 28
                    y = (py + (sy + .5) / ss) / size * 28
                    if full_bleed:
                        c = DARK
                        if inside_rr(x, y, 9.75, 9.75, 8.5, 2.6):
                            c = LIME
                    else:
                        c = BG
                        if inside_rr(x, y, 0, 0, 28, 9):
                            c = DARK
                            if inside_rr(x, y, 9, 9, 10, 3):
                                c = LIME
                    for i in range(3):
                        acc[i] += c[i]
            row += bytes(int(a / (ss * ss) + .5) for a in acc)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

out = os.path.join(os.path.dirname(__file__), '..', 'public')
for name, size, fb in [('icon-192.png', 192, False), ('icon-512.png', 512, False),
                       ('icon-512-maskable.png', 512, True), ('apple-touch-icon.png', 180, True)]:
    with open(os.path.join(out, name), 'wb') as f:
        f.write(render(size, fb))
    print('ok', name)
