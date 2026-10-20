# Spikes de Fase 0

Pruebas técnicas pequeñas ejecutadas el 2026-10-20 para resolver riesgos que podían invalidar la arquitectura. Los resultados están registrados en `docs/research/evidence-log.md`. Son **sondeos de descubrimiento**, no código de aplicación ni el pipeline definitivo (éste vive en `pipelines/` desde la Fase 3).

| Script | Qué prueba | Evidencia |
| --- | --- | --- |
| `ov_extract.py` | Extraer Panamá de un tema/tipo de Overture con poda por bbox sobre estadísticas de grupo de filas (HTTP Range). | E-21, E-22 |
| `ov_schema.py` | Volumen y columnas por tema de Overture para el bbox de Panamá. | E-24 |
| `ov_names.py` | Búsqueda por nombre (sin acentos) de los nueve destinos en Overture. | E-23 |
| `terrain_probe.py` | Elevación, fuentes y metadatos del terreno AWS Terrarium en puntos de sondeo. | E-25 |

Los puntos de `terrain_probe.py` son **aproximados y solo para sondear**; no son geometrías ni se publican.

## Cómo ejecutarlos

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipelines/requirements.txt
.venv/bin/python -I pipelines/spikes/ov_extract.py divisions division_area /tmp/division_area_pa.geojson \
  id,geometry,country,subtype,admin_level,class,names,region,division_id,version,sources,is_land,is_territorial,bbox
.venv/bin/python -I pipelines/spikes/ov_names.py base land_use /tmp/names_land_use.jsonl
.venv/bin/python -I pipelines/spikes/terrain_probe.py
```

La release de Overture está fijada en `REL` dentro de `ov_extract.py` (`2026-09-23.1`).

## Spike Next 16 + TypeScript 7 (reproducción manual)

```bash
mkdir spike && cd spike && pnpm init
pnpm add next@16.4.2 react@19.3.1 react-dom@19.3.1 next-intl@4.14.9
pnpm add -D typescript@7.0.2 @types/react @types/react-dom @types/node@22
# app/layout.tsx + app/page.tsx mínimos, tsconfig estricto
npx next build        # resultado 2026-10-20: compila y genera páginas
node -e "const ts=require('typescript');console.log(Object.keys(ts).length, typeof ts.createProgram)"  # 2 undefined
```
