# Puesta en marcha: cuentas, credenciales y configuración pendiente

Este documento lista **exactamente** lo que falta para pasar integraciones de `BLOCKED` a `VERIFIED`. Mientras tanto la aplicación funciona con datos abiertos (ver `docs/progress.md`).

> Ninguna cuenta se ha creado, ningún servicio se ha contratado y nada se ha publicado. No se ha gastado dinero.

## 1. Entorno de desarrollo (hecho)

Requisitos: Node ≥ 22, pnpm 10, Python ≥ 3.12, PostgreSQL 16 + PostGIS 3.4 (+ pgvector si se usa), tippecanoe, GDAL. Instrucciones de arranque en `README.md`.

## 2. Red del entorno de trabajo (bloqueo actual)

La política de red del entorno cloud **deniega** casi todos los hosts (E-00). Para poder leer documentación primaria y verificar fuentes, el propietario del entorno debe añadir a **Allowed domains** (menú del entorno de la sesión → _Edit_ → _Network access_; guía: https://code.claude.com/docs/en/cloud-environments#network-access):

| Prioridad | Hosts                                                                                                 | Para qué                                                 |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Alta      | `developers.google.com`, `mapsplatform.google.com`                                                    | Políticas y cobertura de Map Tiles/3D/Street View/Routes |
| Alta      | `docs.overturemaps.org`, `overturemaps.org`                                                           | Licencia por tema de Overture (bloquea publicar capas)   |
| Alta      | `sigigntg.anati.gob.pa`, `www.ign.gob.pa`, `ignpanama.anati.gob.pa`, `www.anati.gob.pa`               | Geometrías oficiales (ANATI/IGN)                         |
| Alta      | `miambiente.gob.pa` (+ su geoportal), `www.atp.gob.pa`                                                | Áreas protegidas y turismo oficial                       |
| Media     | `whc.unesco.org`                                                                                      | Límites de Casco Antiguo y Coiba                         |
| Media     | `commons.wikimedia.org`, `www.wikidata.org`, `*.wikipedia.org`                                        | Medios con licencia por archivo y QIDs                   |
| Media     | `graph.mapillary.com`, `www.mapillary.com`, `help.mapillary.com`, `api.kartaview.org`                 | Street imagery                                           |
| Media     | `operations.osmfoundation.org`, `download.geofabrik.de`                                               | Política de teselas y extracto OSM (routing)             |
| Baja      | `nextjs.org`, `next-intl.dev`, `maplibre.org`, `cesium.com`, `docs.protomaps.com`, `cdn.jsdelivr.net` | Documentación y comodidad                                |

## 3. Credenciales y cuentas (todas **pendientes**; ninguna creada)

| Servicio                 | Para qué                                                  | Qué hace falta                                                                                                      | Variable (ver `.env.example`)                                                                                              | Se necesita en        |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Google Maps Platform** | Verificar cobertura 3D/Street View; opcionalmente usarlas | Proyecto con facturación, **Map Tiles API** habilitada, clave **restringida por origen y API**, cuota y presupuesto | `GOOGLE_MAPS_API_KEY` (servidor) / `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (solo si es imprescindible pública)                       | Fase 2 (cobertura), 5 |
| **Cesium ion**           | Solo si se activa Cesium                                  | Token de acceso                                                                                                     | `CESIUM_ION_TOKEN`                                                                                                         | Opcional              |
| **Mapillary**            | Street imagery                                            | Token de cliente                                                                                                    | `MAPILLARY_ACCESS_TOKEN`                                                                                                   | Fase 5                |
| **Supabase**             | BD gestionada, Auth, RLS en producción                    | Proyecto (región), URL, clave anónima                                                                               | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; **`SUPABASE_SERVICE_ROLE_KEY` solo servidor, nunca expuesta** | Fase 6+ / despliegue  |
| **Cloudflare R2** (o S3) | PMTiles y medios con CDN                                  | Bucket + CORS (`GET`, `HEAD`, cabecera `Range`) + dominio                                                           | `TILES_BASE_URL`, credenciales de subida (solo CI)                                                                         | Despliegue            |
| **Vercel** (u otro)      | Alojamiento                                               | Proyecto y dominio                                                                                                  | —                                                                                                                          | Despliegue            |
| **Sentry**               | Errores                                                   | DSN                                                                                                                 | `SENTRY_DSN`                                                                                                               | Fase 10               |
| **Proveedor de IA**      | Concierge/traducción asistida                             | Clave API (servidor)                                                                                                | `AI_API_KEY`                                                                                                               | Fase 9                |
| **Dominio y marca**      | Nombre definitivo                                         | Decisión de negocio                                                                                                 | `NEXT_PUBLIC_SITE_URL`, `src/config/site.ts`                                                                               | Lanzamiento           |

## 4. Decisiones que solo puede tomar una persona

1. **Licencias** de IGN/ANATI y MiAmbiente: solicitud por escrito (o confirmación de datos abiertos).
2. **Revisión legal**: ODbL/share-alike de capas derivadas, privacidad (cookie de idioma persistente, geolocalización), marco de datos personales.
3. **Revisores humanos** por idioma (`es`, `en`, `pt`, `fr`, `de`) y variante del portugués (BR/PT).
4. **Nombre/dominio definitivo** (hoy «Panamá Immersive» provisional, centralizado en `src/config/site.ts`).
5. **Autorización de gasto** antes de activar cualquier servicio de pago (propuesta concreta con coste y efecto primero).

## 5. Variables de entorno

Plantilla sin secretos: `.env.example`. La configuración se valida al arrancar (`src/config/env.ts`); un valor inválido **detiene** la aplicación con un mensaje claro.

## 6. Datos del mapa (Fase 2)

La aplicación **arranca sin** los datos del mapa y lo dice (estado «faltan los datos del mapa base»). Para generarlos:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r pipelines/requirements.txt          # pyarrow, shapely, pmtiles, mapbox-vector-tile…
# tippecanoe ≥ 2.17 (salida PMTiles) en el PATH
pnpm data:anchors    # anclas por ID de Overture → data/anchors/destination-anchors.json (se versiona)
pnpm data:build      # extrae, tesela y VERIFICA; publica public/data/panama-basemap.{pmtiles,manifest.json}
```

- Red necesaria: `overturemaps-us-west-2.s3.amazonaws.com` (lista blanca en `pipelines/lib/overture.py`). `data:build` tarda ≈ 5 min.
- `--reuse-extract` repite solo el teselado y la verificación; `--verify-only` solo verifica el artefacto existente.
- Los artefactos (`data/build/`, `public/data/*`) **no se versionan**. Los glifos (`public/map-assets/glyphs/`) y las anclas **sí**.
- **Hosting de producción** [pendiente]: cualquier almacén estático con **HTTP Range** y CORS si es de otro origen; configurar `NEXT_PUBLIC_TILES_BASE_URL` (su origen entra solo en `connect-src`). Hoy el mapa de producción está **desactivado** por L-01.
- Relieve: `NEXT_PUBLIC_TERRAIN_TILES_URL` (por defecto AWS Terrarium); se valida la plantilla `{z}/{x}/{y}` y, en producción, https.
