# 0016 — API espacial acotada: rol `anon` bajo RLS, derechos antes que datos y límites duros

- Estado: Aceptada
- Fecha: 2026-10-21
- Relacionadas: ADR-0007 (derechos), ADR-0014 (mapa), ADR-0015 (ingesta), `docs/gis.md` §5 y §12

## Contexto

Con las áreas ya en PostGIS (ADR-0015) la aplicación necesita consultarlas por ventana, por punto y por identificador, para el selector de áreas del mapa (F3.d) y para quien integre el servicio. Es el primer código de la aplicación que **lee la base de datos en ejecución**, expuesto a Internet y con entrada no confiable. Hay tres riesgos que no se pueden aplazar: (1) servir lo que no es público o lo que no tenemos derecho a redistribuir, (2) consultas caras (una ventana enorme, una geometría de millones de vértices), (3) mostrar como exacto o como oficial algo que no lo es.

## Decisión

1. **La RLS decide qué se ve, no el código.** Cada petición abre una transacción `begin read only` con `set local role anon`, `search_path = public, extensions` y tiempos máximos (`statement_timeout` 3 s, `lock_timeout` 1 s, transacción inactiva 10 s). La visibilidad (áreas públicas o ligadas a un destino publicado, solo la versión vigente) es la política ya probada de la migración 0005. Si el usuario de `DATABASE_URL` es el propietario, `set local role anon` aplica igualmente la RLS (probado).
2. **Todas las consultas son estáticas y parametrizadas.** Ningún valor de la petición entra en el SQL (prueba: los valores aparecen en `values`, nunca en el texto). Las capas se traducen a listas de `kind` desde un registro cerrado.
3. **Entrada validada con una lista cerrada y contratos duros** (`src/domains/geography/spatial-query.ts`, lógica pura): parámetros conocidos, sin repetir, ≤ 256 caracteres; números con regex estricta (sin `1e3`, `NaN`, hex ni `+`); `bbox` dentro del área de trabajo (−85…−75, 5…11) y recortado a ella, de **≤ 25 grados²** (todo Panamá continental ≈ 15); lat/lon **intercambiados se rechazan** (no se adivinan); `zoom` 0–18; `limit` ≤ 200; ≤ 4 capas; `id` solo UUID. Los errores son **códigos de máquina**, sin eco de la entrada.
4. **Derechos primero, por capa y por fila.** Servir geometrías exige poder **mostrar, transformar (simplificar) y redistribuir** la fuente (`SPATIAL_SERVE_ACTIONS`). Si ninguna capa pedida está permitida → **403 `rights_blocked` sin consultar la BD**; si solo lo está una, se sirve esa y se avisa en `meta.blockedLayers`. Además cada **fila** se comprueba contra su fuente (`data_sources.key` = sujeto de la política): una fuente sin permiso no se sirve aunque la capa lo estuviera. Hoy, con la política `provisional`, **en producción no se sirve nada** (verificado a mano con un build de producción).
5. **Qué se devuelve.** GeoJSON con: geometría **simplificada para mostrar** (`ST_SimplifyPreserveTopology`, tolerancia = 1 píxel de una tesela de 512 px; decimales ≈ 1/10 de píxel) y declarada en `meta.simplification`; `sourceClass` (`osm_derived` nunca se presenta como oficial); nombre **de la fuente sin traducir** (el del idioma pedido si existe; si no, el local; nunca el de otro idioma); **superficie solo si se conoce su método** (`ST_Area(geography)` sobre el original); procedencia deduplicada en `sources` (institución, versión, licencia, atribución, estado de derechos). Lo que no cabe en el presupuesto (≤ 1,5 MB, ≤ `limit` entidades) se omite de forma **explícita** (`truncated`, `skippedTooLarge`).
6. **Semántica geométrica declarada.** Ventana: `&&` (GiST) + `ST_Intersects`. Punto: `ST_Covers` sobre el **original** (el borde cuenta como dentro; plano lon/lat, como GeoJSON y como lo dibuja el mapa), ordenado de la más pequeña (más específica) a la mayor. Solo geometrías **válidas** y **vigentes**.
7. **Sin oráculo de existencia.** «No existe», «no es público» y «geometría inválida» devuelven el mismo `404`.
8. **Caché por validación, no por parámetro de versión.** Cada 200 lleva un `ETag` débil (sha-256 del cuerpo) y se atiende `If-None-Match` con 304; `Cache-Control: public, max-age=60, stale-while-revalidate=300` (los datos servidos son los de `anon`, idénticos para todos). Se **descarta el parámetro `version` previsto en `gis.md` §5**: un identificador de versión enviado por el cliente no se puede confiar ni aporta nada que el ETag no dé. Errores: `no-store`.
9. **Errores sin fugas.** 400 parámetros · 403 derechos · 404 · 503 `database_unavailable` (sin `DATABASE_URL`, sin conexión) · 504 `query_timeout` (SQLSTATE 57014) · 500 genérico. Ni el mensaje de la BD, ni el SQL, ni credenciales llegan al cliente **ni al registro del servidor** (se registra solo el nombre y el código del error).
10. **Fronteras de código.** `src/domains/**` sigue siendo puro; el acceso a la BD vive en `src/server/spatial/` y ESLint impide importar `pg` o `@/server/*` desde dominio y componentes (verificado provocando la violación). Los manejadores reciben sus dependencias (entorno, políticas, ejecutor) para probarse sin servidor.

## Alternativas descartadas

| Alternativa                                            | Por qué no                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtrar `is_public` en el código de la aplicación      | Duplica la política y puede divergir de la RLS; con el rol `anon` la RLS es la única fuente                                                                                  |
| PostgREST / Supabase directo desde el navegador        | No hay despliegue ni credenciales (L-01); además impediría el control de derechos por capa, los límites de tamaño y el truncado explícito                                    |
| Un parámetro `version` del cliente para la caché       | No es confiable; el ETag del cuerpo es exacto                                                                                                                                |
| Recortar la geometría a la ventana (`ST_Intersection`) | Fabrica bordes artificiales y cuesta CPU; la simplificación + presupuesto de bytes + truncado explícito bastan hoy                                                           |
| Simplificar y guardar en la BD                         | Las simplificaciones son derivados descartables; la BD guarda el original (gis.md §1)                                                                                        |
| `ST_Covers` sobre `geography` para el punto            | Aristas geodésicas ≠ aristas planas que dibuja el mapa y define GeoJSON; el resultado diferiría de lo que ve la persona. La **superficie** sí es geodésica                   |
| Paginar con cursor                                     | Añade estado y complejidad sin necesidad hoy (137 áreas); se trunca de forma explícita. Si hiciera falta (miles), se usará teselado (PMTiles) en lugar de paginar el GeoJSON |

## Consecuencias

- **No hay limitación de tasa** (`security.md`): cada petición está acotada en coste, pero no su frecuencia. Hay que ponerla en la infraestructura (cortafuegos/CDN) antes de publicar. **DEFERRED**.
- **Si cambia la política de derechos**, las respuestas 200 ya cacheadas pueden seguir sirviéndose hasta ≈ 6 min (60 s + 300 s de `stale-while-revalidate`).
- **Usuario de la BD en producción**: lo correcto es un rol de login **dedicado**, miembro de `anon` y sin más privilegios, no el propietario (un superusuario podría salir del rol con `reset role` si hubiese una inyección; las consultas son estáticas y parametrizadas, pero es defensa en profundidad). No se crea ningún rol ni contraseña desde las migraciones. **Pendiente de configurar** con el despliegue (`docs/setup.md` §7).
- **Conexiones**: el pool es de 5 clientes por proceso. En un entorno sin servidor hay que usar un _pooler_ (p. ej. el de Supabase) para no agotar conexiones. No probado fuera de local.
- **El truncado descarta lo más pequeño** (se ordena por superficie descendente): a zooms bajos con muchas áreas, las pequeñas pueden no aparecer; `meta.truncated` lo dice. El selector de áreas (F3.d) debe mostrarlo.
- El JS del cliente no cambia por esta fase; el chunk de _runtime_ de Turbopack creció **+451 B gzip** al añadir las rutas (`191,1 KB` la línea base, presupuesto 210 KB). Causa no investigada más allá de aislarla a ese chunk.

## Evidencia

Pruebas: `tests/unit/domains/spatial-query.test.ts` (71, incl. fuzz determinista y contratos con SQL/Python/políticas), `spatial-response.test.ts` (9), `tests/unit/server/spatial-handlers.test.ts` (21), `tests/integration/spatial-api.test.ts` (22, PostGIS real), `e2e/spatial-api.spec.ts` (5, build real de Next). Mutaciones comprobadas (se rompió a propósito y fallaron pruebas): quitar `set local role anon` (4), `ST_Contains` en lugar de `ST_Covers` (1), no filtrar geometrías inválidas (4), ignorar derechos (1).

## Revisar cuando

- Haya despliegue: rol dedicado, _pooler_, limitación de tasa y medición real de latencia (no se ha medido).
- Existan miles de áreas o geometrías muy grandes: pasar a teselas vectoriales servidas desde la BD o PMTiles de áreas.
- Haya límites oficiales (L-03): nueva capa/fuente con su política.
