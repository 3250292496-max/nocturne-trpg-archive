from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(size: int):
    candidates = (
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def natural_page_key(path: Path):
    tail = path.stem.rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else tail


def build(input_dir: Path, output_dir: Path, label: str) -> None:
    pages = sorted(input_dir.glob("*.png"), key=natural_page_key)
    if not pages:
        raise SystemExit(f"no PNG pages found in {input_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    cols, rows = 3, 4
    thumb_w, thumb_h = 310, 438
    gap, top, label_h = 18, 70, 28
    sheet_w = gap + cols * (thumb_w + gap)
    sheet_h = top + rows * (thumb_h + label_h + gap)
    title_font = load_font(22)
    page_font = load_font(16)

    for start in range(0, len(pages), cols * rows):
        group = pages[start : start + cols * rows]
        canvas = Image.new("RGB", (sheet_w, sheet_h), "#1c222a")
        draw = ImageDraw.Draw(canvas)
        draw.text((gap, 18), f"{label} · pages {start + 1}–{start + len(group)}", fill="white", font=title_font)
        for offset, page_path in enumerate(group):
            row, col = divmod(offset, cols)
            x = gap + col * (thumb_w + gap)
            y = top + row * (thumb_h + label_h + gap)
            with Image.open(page_path) as image:
                image = image.convert("RGB")
                image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                px = x + (thumb_w - image.width) // 2
                py = y + (thumb_h - image.height) // 2
                canvas.paste(image, (px, py))
            draw.rectangle((x, y, x + thumb_w, y + thumb_h), outline="#738092", width=1)
            draw.text((x, y + thumb_h + 4), f"page {start + offset + 1}", fill="#d8dee9", font=page_font)
        destination = output_dir / f"{input_dir.name}-sheet-{start // (cols * rows) + 1:02d}.jpg"
        canvas.save(destination, quality=88, optimize=True)
        print(destination)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: make-contact-sheets.py PAGE_DIR OUTPUT_DIR LABEL")
    build(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])


if __name__ == "__main__":
    main()
