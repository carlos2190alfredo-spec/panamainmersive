"""Genera la imagen social (Open Graph / Twitter) y el icono de app de 512 px desde las marcas entregadas.

Uso (desde la raíz, con `.venv` activado: ahí está Pillow, fijado en pipelines/requirements.txt):
  python3 -I pipelines/brand/make_og.py            # escribe public/brand/og-1200x630.jpg y public/brand/icon-512.png
  python3 -I pipelines/brand/make_og.py --check    # regenera EN MEMORIA y sale con 1 si difiere de lo versionado

Por qué un script y no `next/og` (ADR-0025): satori no admite woff2 (las fuentes del proyecto lo son) y la imagen NO
lleva texto: son las dos marcas entregadas por la persona propietaria sobre los colores de la paleta. Un texto
horneado no se traduciría ni se leería con un lector de pantalla; el `alt` va localizado en `Meta.og.alt`.

Entradas: public/brand/mark-p-640.webp (la P) y public/brand/mark-map-640.webp (silueta del país), con alfa.
Colores: se LEEN de src/styles/tokens.css (`--color-brand-*`), la única fuente de colores del proyecto: este archivo no
declara ninguno.
Salidas (public/brand/):
  og-1200x630.jpg  JPEG progresivo, ≤ 300 KB. Izquierda Azul Profundo con la P; derecha Arena con la silueta; una
                   raya Rojo Panamá en la unión y una banda inferior con los colores de la paleta (sin texto).
  icon-512.png     Icono de app: la P sobre un azulejo blanco de esquinas redondeadas, con las mismas proporciones que
                   src/app/icon.png (192 px, entregado): azulejo 100 %, radio 18,75 %, la P a 75,5 % del alto.

Determinista: sin marcas de tiempo ni metadatos; el resultado depende de la versión de Pillow (13.0.0). Al regenerar
hay que actualizar los sha256 de public/brand/SOURCE.json (tests/unit/design/brand-files.test.ts lo exige).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "public" / "brand"
TOKENS = ROOT / "src" / "styles" / "tokens.css"

OG_NAME = "og-1200x630.jpg"
ICON_NAME = "icon-512.png"
OG_SIZE = (1200, 630)
OG_MAX_BYTES = 300 * 1024
JPEG_QUALITY = 85

# Proporciones medidas en src/app/icon.png (192×192): azulejo blanco opaco con esquinas redondeadas (la primera columna
# opaca de la fila 0 empieza en x = 36 → radio 36/192) y la P ocupando de y = 24 a y = 168 (145/192 del alto), centrada.
ICON_SIZE = 512
ICON_RADIUS = 36 / 192
ICON_MARK_HEIGHT = 145 / 192
SUPERSAMPLE = 4  # el redondeo del azulejo se dibuja a 4× y se reduce: bordes sin escalones


def brand_colors() -> dict[str, tuple[int, int, int]]:
    """`--color-brand-*` de tokens.css (solo el primer bloque `:root`: los de marca son constantes del tema)."""
    css = TOKENS.read_text(encoding="utf-8")
    colors: dict[str, tuple[int, int, int]] = {}
    for name, hex_value in re.findall(r"--color-brand-([a-z]+):\s*#([0-9a-fA-F]{6})\s*;", css):
        if name in colors:
            raise SystemExit(f"tokens.css declara --color-brand-{name} más de una vez")
        colors[name] = tuple(int(hex_value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[assignment]
    for needed in ("red", "blue", "sky", "green", "sand", "deep"):
        if needed not in colors:
            raise SystemExit(f"tokens.css no declara --color-brand-{needed}")
    return colors


def load_mark(name: str) -> Image.Image:
    image = Image.open(BRAND / name)
    image.load()
    if image.mode != "RGBA":
        raise SystemExit(f"{name}: se esperaba RGBA (con transparencia), hay {image.mode}")
    return image


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def fit_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def paste_centered(canvas: Image.Image, mark: Image.Image, center: tuple[int, int]) -> None:
    left = round(center[0] - mark.width / 2)
    top = round(center[1] - mark.height / 2)
    canvas.alpha_composite(mark, (left, top))


def build_og(colors: dict[str, tuple[int, int, int]]) -> Image.Image:
    width, height = OG_SIZE
    seam = 600  # unión entre el panel azul y el arena
    stripe = 10  # banda inferior de la paleta
    canvas = Image.new("RGBA", OG_SIZE, colors["deep"] + (255,))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((seam, 0, width, height), fill=colors["sand"] + (255,))
    # Raya Rojo Panamá en la unión (decorativa).
    draw.rectangle((seam - 3, 0, seam + 2, height), fill=colors["red"] + (255,))
    # Banda de la paleta: azul, azul claro, verde y rojo a partes iguales.
    bands = ("blue", "sky", "green", "red")
    band_width = width / len(bands)
    for i, key in enumerate(bands):
        draw.rectangle(
            (round(i * band_width), height - stripe, round((i + 1) * band_width), height),
            fill=colors[key] + (255,),
        )
    usable = height - stripe

    paste_centered(canvas, fit_height(load_mark("mark-p-640.webp"), 500), (seam // 2, usable // 2))
    paste_centered(
        canvas,
        fit_width(load_mark("mark-map-640.webp"), 500),
        (seam + (width - seam) // 2, usable // 2),
    )
    return canvas.convert("RGB")


def build_icon() -> Image.Image:
    size = ICON_SIZE * SUPERSAMPLE
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * ICON_RADIUS), fill=255
    )
    mask = mask.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (255, 255, 255, 255))
    mark = fit_height(load_mark("mark-p-640.webp"), round(ICON_SIZE * ICON_MARK_HEIGHT))
    paste_centered(tile, mark, (ICON_SIZE // 2, ICON_SIZE // 2))
    tile.putalpha(mask)
    return tile


def encode_jpeg(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, subsampling="4:2:0")
    return buffer.getvalue()


def encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="comparar con lo versionado sin escribir")
    args = parser.parse_args(argv)

    colors = brand_colors()
    outputs = {
        OG_NAME: encode_jpeg(build_og(colors)),
        ICON_NAME: encode_png(build_icon()),
    }
    if len(outputs[OG_NAME]) > OG_MAX_BYTES:
        print(f"{OG_NAME}: {len(outputs[OG_NAME])} B supera el tope de {OG_MAX_BYTES} B", file=sys.stderr)
        return 2

    status = 0
    for name, data in outputs.items():
        target = BRAND / name
        if args.check:
            current = target.read_bytes() if target.exists() else None
            same = current == data
            print(f"{'IGUAL' if same else 'DIFIERE'}  {name}  {len(data)} B  sha256 {sha256(data)}")
            if not same:
                status = 1
        else:
            target.write_bytes(data)
            print(f"escrito  {name}  {len(data)} B  sha256 {sha256(data)}")
    return status


if __name__ == "__main__":
    sys.exit(main())
