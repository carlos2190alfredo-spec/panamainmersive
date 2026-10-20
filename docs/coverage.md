# Cobertura por destino y proveedor

Evaluación inicial, **2026-10-20**. Estados: `UNKNOWN`, `VERIFIED`, `PARTIAL`, `UNAVAILABLE`, `ERROR`. **`UNKNOWN` y `ERROR` no equivalen a ausencia.** Cada celda indica el alcance de lo observado (fuente + versión) y apunta a su evidencia (`docs/research/evidence-log.md`).

> Una documentación de cobertura global no prueba calidad local, y la visualización en un producto de consumo no demuestra disponibilidad en su API.

## Identidad estable de los nueve destinos

La clave (`key`) es inmutable y **no** se deriva del nombre mostrado. Los nombres por idioma y los slugs se gestionan aparte (`docs/i18n.md`).

| key | Destino (nombre en español) | Naturaleza |
| --- | --- | --- |
| `panama-city` | Ciudad de Panamá | Núcleo urbano / distrito |
| `casco-antiguo` | Casco Antiguo | Distrito histórico (UNESCO: «Panamá Viejo y Distrito Histórico») |
| `panama-canal` | Canal de Panamá | Infraestructura / paisaje |
| `el-valle-de-anton` | El Valle de Antón | Localidad en caldera volcánica |
| `boquete` | Boquete | Distrito / localidad de montaña |
| `volcan-baru` | Volcán Barú | Volcán / parque nacional |
| `bocas-del-toro` | Bocas del Toro | Archipiélago / provincia / localidad |
| `santa-catalina` | Santa Catalina | Localidad costera (Veraguas) |
| `coiba` | Coiba | Isla / parque nacional (UNESCO) |

## Matriz de cobertura

Leyenda: `V` VERIFIED · `P` PARTIAL · `U` UNAVAILABLE · `?` UNKNOWN. La columna **Geometría** describe **qué existe** en Overture `2026-09-23.1` (derivado de OSM, **no oficial**) para esa entidad.

| Destino | Geometría (Overture/OSM) | Terreno AWS (relieve en tierra) | Google 3D | Street View | Mapillary / KartaView | Imagen satelital abierta | Geometría oficial (IGN/ANATI, MiAmbiente, ATP, UNESCO) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Ciudad de Panamá** | **V** `county` «Distrito de Panamá» (+ localidades/barrios) · E-23 | **V** ≈33 m, SRTM · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Casco Antiguo** | **U** como límite del distrito histórico. Existe `landuse=retail` «Casco Viejo» (**no equivale** al distrito UNESCO) · E-23 | **V** ≈23 m (resolución 30 m: **sin utilidad a escala de edificio**) · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Canal de Panamá** | **P** líneas `waterway=canal`, Lago Gatún (MultiPolygon), esclusas (polígonos), presa de Gatún. **Sin polígono de zona del Canal** · E-23b | **V** ≈23 m en Miraflores · E-25 | `?` | `?` | `?` | `?` | `?` |
| **El Valle de Antón** | **P** solo punto de volcán «El Valle» (Wikidata Q1324715) y cerros; **sin polígono de localidad/corregimiento** · E-23 | **V** ≈589 m · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Boquete** | **V** `county` «Boquete», `locality` «Bajo/Alto Boquete» · E-22/E-23 | **V** ≈1 225 m · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Volcán Barú** | **P** polígono OSM «Parque Nacional Volcán Barú» (`protected`), pico (Q594726). **No oficial.** · E-23 | **V** ≈3 438 m (orden de magnitud) · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Bocas del Toro** | **V** `region`, `county` y `locality` (**tres entidades distintas**, ver nota) · E-22 | **V** ≈7 m en tierra; **sin batimetría a z12** · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Santa Catalina** | **P** `locality` de Veraguas (bbox ≈ 1,2 km). **Hay otras 3 «Santa Catalina»** · E-23c | **V** ≈50 m · E-25 | `?` | `?` | `?` | `?` | `?` |
| **Coiba** | **P** polígonos OSM «Isla de Coiba» (Q741636), «Parque Nacional Coiba», «P. N. Marino Golfo de Chiriquí». **No oficiales.** · E-23 | **P** relieve en isla ≈138 m; mar sin batimetría a z12 · E-25 | `?` | `?` | `?` | `?` | `?` |

### Por qué casi todo es `UNKNOWN` y qué lo desbloquea

| Capacidad | Motivo del `UNKNOWN` | Para verificarla |
| --- | --- | --- |
| Google 3D | Sin clave de Map Tiles API; la página de cobertura no se pudo leer; ninguna búsqueda devolvió una lista con Panamá (E-30). | Clave + sondeo del tile raíz por destino y revisión visual con `Tiles3DProvider` (ver `docs/setup.md`). |
| Street View | Sin clave; `tile.googleapis.com` responde pero sin autenticación no se puede consultar. | Clave + endpoints de metadatos. |
| Mapillary / KartaView | Hosts bloqueados y Mapillary requiere token (E-00). | Token + desbloqueo de `graph.mapillary.com`/`api.kartaview.org`; distinguir fotos de panoramas 360. |
| Imagen satelital abierta | El bucket de Sentinel-2 COG es alcanzable, pero no hay servicio de teselas ni licencia de distribución evaluada. | Decidir proveedor y licencia (ADR futuro). |
| Geometrías oficiales | Hosts de IGN/ANATI, MiAmbiente, ATP, UNESCO bloqueados; licencia de reutilización desconocida (E-00, E-34). | Desbloqueo + consulta formal de licencia al IGN/ANATI y MiAmbiente. |

### Notas por destino (trampas detectadas)

- **Homonimia**: el distrito *Barú* **no** es el *Volcán Barú*; hay cuatro «Santa Catalina» (E-23c). **Regla**: nunca se asigna geometría por coincidencia de nombre; solo mediante `destination_areas` con rol y evidencia revisada.
- **Bocas del Toro**: provincia (`region`), distrito (`county`) y pueblo (`locality`) comparten nombre. El «destino» turístico (archipiélago + pueblo + acceso marítimo) **no** es ninguno de ellos exactamente: requiere decisión editorial documentada.
- **Casco Antiguo**: **no** usar el `landuse=retail` «Casco Viejo» como límite del distrito histórico. Si se dibuja uno sin fuente oficial, será **editorial** y se etiquetará como tal.
- **Volcán Barú**: Boquete y Volcán son **accesos** (`access_via`), no contenedores.
- **Coiba**: la isla y el parque tienen el mismo QID de Wikidata (Q741636) en OSM; son entidades distintas (tierra vs. parque con zona marina). Cualquier superficie se calculará **con método identificado** (`geography`).
- **Mar**: el terreno AWS no representa batimetría a z12 (devuelve 0 m, E-25). Las áreas marinas se dibujan con vectores, no con relieve, y sin presentar los 0 m como medición.

## Método de verificación

1. **Geometría**: búsqueda por nombre sin acentos en Overture (`pipelines/spikes/ov_names.py`) en `division`, `division_area`, `base/{land,land_use,water,infrastructure}`; el resultado es una **pista**, la asignación a destino se revisa manualmente.
2. **Terreno**: tile Terrarium z8/z10/z12 en un punto de sondeo **aproximado** (no es geometría ni se publica); se lee elevación y metadatos de fuente (`terrain_probe.py`).
3. Las capacidades de proveedores comerciales se verificarán con **sondeo programático** por destino y se guardarán como filas de `visual_coverage` con método, extensión, calidad observada, fecha, versión, evidencia y caducidad.

## Caducidad

[Supuesto] La evidencia de cobertura caduca a los **90 días** o al cambiar la versión del proveedor/dataset, lo que ocurra primero (para Overture, cada release). Una cobertura caducada pasa a `UNKNOWN` en el resolver, nunca a `UNAVAILABLE`.
