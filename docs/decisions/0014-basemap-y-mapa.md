# 0014 — Basemap de una sola fuente, mapa con la URL como estado y relieve opt-in

- Estado: Aceptada
- Fecha: 2026-10-20
- Relacionadas: ADR-0004 (MapLibre), ADR-0005 (PMTiles), ADR-0007 (derechos), ADR-0010 (CSP)

## Contexto

La Fase 2 necesita un mapa real y útil de Panamá con **datos permitidos**, sin inventar geometrías ni cobertura, que funcione con teclado y lector de pantalla, en cinco idiomas, y que no contacte a terceros sin que la persona lo pida. Las evidencias E-42…E-48 (`docs/research/evidence-log.md`) condicionan varias decisiones.

## Decisión

1. **Una sola fuente de cartografía: Overture** (`2026-09-23.1`). `base/land` + `base/water` (`ocean`) cubren todo el área de trabajo (E-42), así que no se añade Natural Earth: una licencia menos y ninguna costura entre escalas. Capas: `land`, `landcover(+_detail)`, `protected`, `boundaries`, `ocean`, `water(+_detail)`, `waterway(+_detail)`, `places` → **un PMTiles** z4–14 (36,1 MB) servido por HTTP Range desde este origen.
2. **Reglas de teselado con evidencia (E-44)**: el rango de zoom se fija **por capa** (`-L{"minzoom":…}`) y las entidades se reparten en **bandas** (`water` / `water_detail`…); **no** se usa `tippecanoe:minzoom` por entidad ni `--drop-*-as-needed` (descartaban en silencio entre el 25 % y el 75 % de las entidades). Los puntos se conservan todos (`-r1`) y el estilo los adelgaza por clase.
3. **Verificación obligatoria antes de publicar el artefacto** (`pipelines/basemap/build_basemap.py`): toda tesela z7 del área trae tierra u océano; cada ancla tiene su tesela y su lugar dibujado a ≤ 25 m; **conservación exacta a z14** de todas las capas y de los lugares en todos los zooms. Si falla, no se publica. Los polígonos < 1 m² se descartan de forma explícita y contada.
4. **Artefactos fuera de git** (`/data/build/`, `/public/data/*`), reproducibles con `pnpm data:build` y con **manifiesto** (release, licencia, atribución, `sha256`, reglas por capa, versión de tippecanoe, resultados de verificación). Los glifos de Noto Sans (477 KB, OFL) sí se versionan, con su licencia y procedencia.
5. **Etiquetas**: nombre local; nombre por idioma **solo si la fuente lo trae** (E-43: casi ninguno en Panamá). Los topónimos **no se traducen automáticamente**.
6. **Relieve opt-in**: el terreno AWS (Terrarium) lo pide **el navegador** directamente y solo si se activa una capa de relieve; **no** está activo por defecto (revela la IP a un tercero). La CSP autoriza exactamente su origen y la atribución se muestra. El océano se dibuja **sobre** el relieve para no presentar batimetría ruidosa como «relieve» (E-25).
7. **La URL es el estado del mapa** (`d` destino por clave estable, `c` cámara, `l` capas), validado con analizadores puros: lo inválido se descarta y se avisa; nunca se corrige adivinando. Las escrituras usan `history.pushState/replaceState(null, …)` (E-47).
8. **Marcadores = botones HTML** de ≥ 44 px; los cercanos en pantalla se **agrupan** en un botón de grupo que acerca el mapa (la prueba de propiedad garantiza que no se solapan).
9. **Anclas por ID de Overture** (`pipelines/anchors/`): el marcador usa el punto `division` enlazado por `division_id` (no el punto representativo del polígono, que en «Bocas del Toro» caía a ≈ 6 km del pueblo) y el polígono solo encuadra. **No se dibuja ningún límite de destino**; una referencia que solo _contiene_ al destino (San Felipe ⊃ Casco Antiguo) se etiqueta como tal (E-41).
10. **Experience Resolver v1 + `RightsPolicyEvaluator`** (puros): una política `provisional` bloquea producción; en producción el mapa **no se inicializa** y el relieve no se ofrece ni se carga aunque el enlace lo pida. Hoy todas son `provisional` (L-01).
11. **MapLibre**: carga diferida (455 KB gzip, solo en `/explorar`); su worker se declara con `setWorkerUrl` a un activo emitido por el bundler (E-46).

## Alternativas descartadas

| Alternativa                                                        | Por qué no                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Natural Earth para zoom bajo                                       | Innecesario (E-42); añade una fuente y una costura visual entre escalas                                  |
| `--drop-densest/smallest-as-needed`, `tippecanoe:minzoom`          | Pérdida silenciosa de datos (E-44)                                                                       |
| Ampliar `maxBounds` y rellenar el fondo                            | Mostraría tierra o mar **inventados** fuera de los datos; se prefiere que el mapa cubra la vista         |
| Relieve autoalojado                                                | ≈ 250 MB [estimación: ≈ 3 200 teselas × 60–100 KB] y derechos de redistribución sin verificar → DEFERRED |
| Relieve activo por defecto                                         | Contacta a un tercero sin acción de la persona                                                           |
| Marcadores dibujados en el lienzo (capa de símbolos/clustering GL) | No son enfocables ni se leen; la accesibilidad exige elementos reales                                    |
| Traducir topónimos con IA                                          | Inventaría nombres; el modelo editorial exige revisión humana                                            |
| Punto representativo del polígono como ancla                       | Falla en multipolígonos (Bocas del Toro ≈ 6 km); se usa el punto `division` enlazado por ID              |

## Consecuencias

- Reproducir el mapa exige Python + tippecanoe + red hacia el S3 de Overture (`docs/setup.md` §6); la aplicación arranca sin ellos, con estado «faltan los datos del mapa base» (probado).
- El PMTiles pesa 36,1 MB (E-45); una sesión típica descarga ≈ 4 MB de teselas y glifos (E-48). Hay que servirlo con Range y caché (`next.config.ts`); si se mueve a un CDN/bucket, su origen entra en `connect-src` (`NEXT_PUBLIC_TILES_BASE_URL`).
- El mapa de producción queda **desactivado** hasta que L-01 se resuelva: es deliberado.
- Las etiquetas y los límites son **cartografía de referencia no oficial** (OSM): la interfaz lo dice.

## Evidencia

E-41 (anclas), E-42 (cobertura y esquema), E-43 (nombres), E-44 (tippecanoe), E-45 (artefacto), E-46 (worker), E-47 (historial), E-48 (terreno y transferencia).

## Revisar cuando

Se verifique una política de derechos; se obtengan límites oficiales (IGN/ANATI, MiAmbiente); una medición real (LCP/INP/FPS en dispositivo de referencia) contradiga el presupuesto; Overture publique traducciones de topónimos; MapLibre vuelva a deducir bien la URL del worker.
