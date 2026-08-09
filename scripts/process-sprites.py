"""Split the active map-editor sheets into normalized WebP game sprites."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

SHEETS = [
    (ROOT / "assets" / "approved" / "build-props-sheet.webp", 4, ROOT / "public" / "assets" / "build", [
        "command_tent", "watchtower", "sandbags", "radar",
        "generator", "medic_station", "antenna", "lamp_post",
    ]),
    (ROOT / "assets" / "approved" / "terrain-sheet.webp", 4, ROOT / "public" / "assets" / "terrain", [
        "rock_outcrop", "grass_patch", "dirt_mound", "crater",
        "mud_puddle", "ruin_slab", "shrubs", "road_plate",
    ]),
    (ROOT / "assets" / "approved" / "floor-materials-sheet.webp", 4, ROOT / "public" / "assets" / "floor", [
        "floor_grass", "floor_earth", "floor_concrete", "floor_asphalt",
        "floor_mud", "floor_steel", "floor_gravel", "floor_stone",
    ]),
]

for sheet_path, columns, output_dir, names in SHEETS:
    output_dir.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(sheet_path).convert("RGBA")
    cell_w, cell_h = sheet.width // columns, sheet.height // 2
    for index, name in enumerate(names):
        if not name:
            continue
        col, row = index % columns, index // columns
        cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        alpha = cell.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value > 20 else 0).getbbox()
        if not bbox:
            raise RuntimeError(f"No visible pixels found for {name}")
        sprite = cell.crop(bbox)
        is_floor = "floor-materials" in sheet_path.name
        max_width, max_height = (230, 232)
        scale = min(max_width / sprite.width, max_height / sprite.height)
        size = (248, 124) if is_floor else (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
        sprite = sprite.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        x = (256 - sprite.width) // 2
        y = (256 - sprite.height) // 2 if is_floor else 248 - sprite.height
        canvas.alpha_composite(sprite, (x, y))
        canvas.save(
            output_dir / f"{name}.webp",
            "WEBP",
            quality=92,
            method=6,
            exact=True,
        )
        print(f"{name}: {sprite.width}x{sprite.height}, pivot=(128,248)")
