"""Spike: observe Terrarium elevation + source metadata at probe points. Probe points are approximate, probe-only (not published)."""
import io, math, requests, numpy as np
from PIL import Image
BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
def tile(lon, lat, z):
    n = 2 ** z; x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n); return x, y
def px(lon, lat, z):
    n = 2 ** z; fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return int((fx % 1) * 256), int((fy % 1) * 256)
def elev(lon, lat, z):
    x, y = tile(lon, lat, z); r = requests.get(BASE.format(z=z, x=x, y=y), timeout=30)
    r.raise_for_status()
    im = np.array(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=float)
    # window max over 5x5 to avoid sub-pixel miss
    px_, py_ = px(lon, lat, z); w = im[max(py_-2,0):py_+3, max(px_-2,0):px_+3]
    e = (w[..., 0] * 256 + w[..., 1] + w[..., 2] / 256) - 32768
    return float(e.max()), float(e[2, 2] if e.shape == (5, 5) else e.mean()), r.headers.get("x-amz-meta-x-imagery-sources"), r.headers.get("Last-Modified")
# Approximate probe points (general knowledge; for terrain probing ONLY, not for display)
pts = {"volcan_baru_summit_approx": (-82.543, 8.808), "boquete_town_approx": (-82.437, 8.78), "el_valle_approx": (-80.126, 8.601),
       "panama_city_approx": (-79.52, 8.98), "bocas_town_approx": (-82.24, 9.34), "coiba_island_approx": (-81.75, 7.45),
       "sea_check_pacific": (-79.3, 8.2),
       "casco_antiguo_approx": (-79.535, 8.952), "canal_miraflores_approx": (-79.595, 8.996), "santa_catalina_approx": (-81.267, 8.14)}
for name, (lon, lat) in pts.items():
    for z in (8, 10, 12):
        try:
            mx, ctr, src, lm = elev(lon, lat, z)
            print(f"{name:28s} z{z:<2d} max5x5={mx:8.1f} m  centre={ctr:8.1f} m  src={src}  lm={lm}")
        except Exception as e:
            print(name, z, "ERR", e)
