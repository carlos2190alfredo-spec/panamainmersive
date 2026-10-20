# 0015 — Ingesta controlada de áreas: cuarentena en lugar de reparación, derechos ejecutables y defensa en profundidad

- Estado: Aceptada
- Fecha: 2026-10-20
- Relacionadas: ADR-0007 (derechos), ADR-0009 (ETL en Python), ADR-0014 (basemap y mapa), `docs/gis.md` §1 y §11

## Contexto

La Fase 3 necesita geometrías **en la base de datos** (no solo en teselas) para medir superficies, localizar puntos y servir una API espacial acotada. La única fuente de geometrías disponible es Overture (derivada de OpenStreetMap): no hay límites oficiales (L-03) ni acceso a los hosts oficiales (E-00). Importar datos externos a PostGIS es la frontera de confianza más delicada del proyecto: aquí entran bytes de terceros que luego se publican, y un error se propaga a mapas, superficies y fichas.

## Decisión

1. **Dos etapas con un contrato estricto entre ellas.** Python (`pipelines/ingest/`) extrae, valida y escribe artefactos inmutables + un **manifiesto** (`schema` 1, claves cerradas en `manifest-keys.json`, hash `sha256` del contenido, recuentos, reglas de validación, política de derechos, enlaces a destinos). El cargador de TypeScript (`scripts/db/import-areas-lib.ts`) **no confía** en el manifiesto: lo revalida con un esquema estricto (claves de más → rechazo), recalcula el hash y los recuentos y solo entonces escribe, **en una única transacción**.
2. **Cuarentena, nunca reparación silenciosa.** Una entidad que incumple una regla (fuera del área de trabajo, coordenadas fuera de rango, geometría no poligonal, demasiados vértices, identificador duplicado…) va a `quarantine.jsonl` con un **código de incidencia**; no se recorta ni se «arregla» con `ST_MakeValid`. El manifiesto declara `repairs: 0`. Recortar una geometría para que «quepa» fabricaría una forma que nadie midió (E-49).
3. **Defensa en profundidad.** La BD vuelve a validar lo que ya validó Python: `CHECK geometry_in_working_area`, orden de ejes, validez calculada por el _trigger_ de `geometry_versions` (PostGIS), nombres sin caracteres de control, unicidad por `overture_id`. Hay pruebas que **recalculan el hash a propósito** (para pasar el control del manifiesto) y comprueban que la BD aún rechaza la entrada y no queda nada escrito.
4. **Identidad por ID, no por nombre.** El `overture_id` es único (`geographic_areas_overture_id_uq`); un conflicto de identidad (mismo ID, otro tipo) detiene la importación. Los enlaces a destinos usan la clave estable del destino con rol `context` y su evidencia; **nunca** hay un enlace por nombre.
5. **Versionado.** Cada ingesta crea una `source_version` (`<release>:<dataset>:<sha[0:12]>`) y un registro en `import_runs` (`applied` | `noop`, recuentos, cuarentena). Repetir el mismo contenido es **idempotente** (`noop`, sin escrituras). Una geometría que cambia crea la **versión 2**, deja la 1 como histórica y mantiene **una sola vigente**.
6. **Superficie geodésica.** `area_m2 = ST_Area(geography)` calculada por la BD y etiquetada con su método (`ST_Area(geography, EPSG:4326)`); nunca superficie en grados.
7. **Visibilidad separada de la importación.** Lo importado entra con `is_public = false`. Publicar es una acción distinta, solo posible si el conjunto es `publishable` **y** la política de derechos permite `display` en el entorno de destino.
8. **Derechos ejecutables, con una sola fuente.** `data/rights/policies.json` la leen el evaluador de TypeScript (`evaluateRights`) y el pipeline de Python (`pipelines/ingest/rights.py`). Deny-by-default: sin política o sin la acción permitida, se deniega; una política `provisional` **no** permite preparar datos para producción; el manifiesto **no puede mejorar** una política (solo la política manda).
9. **Entrada hostil.** Lectura segura (`pipelines/lib/safe_io.py`): sin _path traversal_ ni enlaces simbólicos que escapen, rechazo de FIFOs y de ZIP/XML disfrazados, límite de tamaño tras descomprimir (gzip bomb), JSON estricto, tope de líneas. Red: lista blanca de hosts, solo `https` y puerto 443, sin credenciales en la URL y **sin seguir redirecciones** (E-50).
10. **Nombres por procedencia.** `geographic_area_names` guarda el nombre **local** de la fuente (sin idioma) y los nombres por idioma **solo si la fuente los trae**; un nombre `editorial` lo aporta una persona y solo puede registrarlo un editor sobre un área `editorial` (nunca sobre un área de fuente). **Los topónimos no se traducen automáticamente.**
11. **Seguridad por RLS.** Los visitantes solo ven nombres de áreas visibles; los nombres de fuente (`source_*`) no los puede escribir un editor (sí un administrador o el propietario que ejecuta la importación); `import_runs` no tiene política de escritura para ningún rol de la aplicación (solo el propietario); `import_runs` solo lo lee el personal. Todo cambio queda en la auditoría inmutable.

## Alternativas descartadas

| Alternativa                                                    | Por qué no                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ST_MakeValid` / recortar al área de trabajo                   | Inventa geometrías. Los dos casos rechazados (E-49) son un polígono que cruza el antimeridiano y una reserva que sale del área: recortarlos daría formas que nadie midió |
| Cargar con `ogr2ogr`/`COPY` directo                            | No hay un punto donde imponer derechos, hash, cuarentena ni versionado; la validación quedaría solo en la BD                                                             |
| Confiar en el manifiesto porque lo generamos nosotros          | El fichero se puede alterar entre las dos etapas (hay una prueba con el **mismo tamaño** y distinto contenido); el hash y el esquema estricto lo detectan                |
| Importar y publicar en un solo paso                            | Mezcla dos decisiones con responsables distintos (datos vs. derechos/editorial)                                                                                          |
| Relacionar áreas con destinos por nombre                       | Hay homonimias (distrito _Barú_ ≠ _Volcán Barú_; cuatro «Santa Catalina») (E-41)                                                                                         |
| Seguir redirecciones de la fuente                              | `fsspec` las sigue por defecto: un host de la lista blanca podría redirigir a un destino interno (SSRF) (E-50)                                                           |
| Traducir nombres de áreas con IA para llenar los cinco idiomas | Inventaría topónimos. Overture casi no trae nombres por idioma en Panamá (E-43); se muestra el nombre local y se dice que no hay traducción                              |

## Consecuencias

- Hoy se importan **137 áreas protegidas** y **11 entidades poligonales de referencia** de Overture `2026-09-23.1` (todas `osm_derived`, no oficiales); **2** áreas protegidas quedan en cuarentena (E-49) y **9** referencias no poligonales (puntos de ancla) se omiten porque no son áreas. Nada es público: la política de Overture es `provisional` (L-01).
- Cuando haya límites oficiales (L-03) se importarán como **otra fuente** con su propia política y `source_class`; no sustituyen a estas en silencio.
- La ingesta exige Python + red hacia el S3 de Overture (`docs/setup.md` §7); la base de datos y el cargador funcionan sin Python si ya existen los artefactos.
- Coste: una pasada más (manifiesto + revalidación) y más pruebas; es el precio de que un cambio no autorizado en los datos no llegue a producción sin que algo lo detecte.

## Evidencia

E-33 (licencias de Overture, secundaria), E-41 (homonimias), E-43 (nombres por idioma), E-49 (cuarentena real), E-50 (redirecciones). Pruebas: `pipelines/tests/*` (90, `pnpm test:pipelines`), `tests/integration/import-areas.test.ts` (20, con datos reales), `tests/integration/area-names-rls.test.ts` (8), `tests/unit/domains/rights.test.ts`.

## Revisar cuando

- Haya acceso a una fuente oficial de límites (IGN/ANATI, MiAmbiente) o se lean los términos primarios de Overture (cambia la política de derechos, no el pipeline).
- Se importen conjuntos grandes (> 10⁵ entidades): hoy la importación es una transacción y carga en memoria el fichero válido.
- Se necesite importar actualizaciones incrementales de OSM entre _releases_ de Overture.
