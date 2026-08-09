# Asset sources

| Asset | Source type | Tool | Purpose |
|---|---|---|---|
| `assets/imagegen/allies-source.webp` | generated | OpenAI built-in ImageGen | Six allied character source board |
| `assets/imagegen/enemies-source.webp` | generated | OpenAI built-in ImageGen | Four enemies and commander source board |
| `assets/imagegen/props-source.webp` | generated | OpenAI built-in ImageGen | Eight reusable battlefield props |
| `assets/imagegen/build-props-source.webp` | generated | OpenAI built-in ImageGen | Eight administrator BUILD-mode structures |
| `assets/imagegen/terrain-source.webp` | generated | OpenAI built-in ImageGen | Eight map-editor terrain decals |
| `assets/imagegen/floor-materials-source.webp` | generated | OpenAI built-in ImageGen | Eight grid-aligned floor material tiles |
| `public/assets/units/*.webp` | derived | ImageGen + Pillow normalization/WebP encoding | Runtime transparent unit sprites |
| `public/assets/build/*.webp` | derived | Chroma removal + Pillow normalization/WebP encoding | Runtime BUILD-mode construction sprites |
| `public/assets/terrain/*.webp` | derived | Chroma removal + Pillow normalization/WebP encoding | Runtime map-editor terrain sprites |
| `public/assets/floor/*.webp` | derived | Chroma removal + Pillow normalization/WebP encoding | Runtime 2:1 isometric floor tiles |
| `public/assets/icons/*.png` | derived | Pillow normalization | Favicon, Apple Touch, and PWA install icons; PNG retained for platform compatibility |

Build sheet prompt summary: strict 4×2 isometric sprite sheet containing a blue command tent, watchtower, sandbags, radar, generator, medic station, antenna, and lamp post; hand-painted tower-defense style with dark outlines on a flat magenta chroma background. The built-in ImageGen tool was used, followed by local chroma removal and Pillow normalization.

Terrain sheet prompt summary: strict 4×2 isometric ground-decal sheet containing rocks, grass, dirt, a crater, muddy water, ruined concrete, shrubs, and a reinforced road plate; hand-painted military battlefield style on a flat magenta chroma background. The built-in ImageGen tool was used, followed by local chroma removal and Pillow normalization.

Floor sheet prompt summary: strict 4×2 sheet of identically sized 2:1 isometric diamond tiles containing military grass, earth, concrete, asphalt, mud, steel, gravel, and mossy stone. The built-in ImageGen tool was used, followed by chroma removal and deterministic 248×124 normalization so adjacent GRID cells meet without gaps.

The attached gameplay mockup was used only as a rendering-quality reference. Characters are original designs generated for this project. Generated on 2026-08-06. No external copyrighted game assets are bundled.
