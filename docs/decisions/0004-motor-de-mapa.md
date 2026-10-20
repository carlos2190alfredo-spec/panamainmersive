# 0004 — MapLibre como motor principal; Cesium diferido tras un adaptador

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

El documento rector propone CesiumJS para 3D «cuando aporta valor» y MapLibre para 2D/offline, y pide evitar cargar ambos completos en móvil. Evidencias:

- Cesium 1.146 no tiene lector de PMTiles; su soporte MVT es `MVTDataProvider` **`@experimental`** con plantilla `{z}/{x}/{y}` (E-06).
- La cobertura de Google Photorealistic 3D para Panamá y los nueve destinos es **desconocida** (E-30); no hay clave ni acceso a `cesium.com`/`ion.cesium.com` desde este entorno (E-00).
- Sin ion ni Google, Cesium no dispone de terreno ni imágenes globales propios gratuitos; el relieve gratuito verificado (Terrarium) es `raster-dem` que MapLibre consume de forma nativa.

## Decisión

- **MapLibre GL JS** (6.15) es el motor del MVP: mapa 2D, relieve 3D (`raster-dem` + hillshade/terrain), PMTiles, deep links y offline futuro.
- **Cesium se aísla tras un adaptador de visor imperativo** y un _feature flag_ (`FEATURE_CESIUM`), no implementado hasta que existan: (a) cobertura 3D **VERIFIED** en al menos un destino, (b) credencial válida, (c) medición de bundle/memoria que cabe en el presupuesto.
- **No** se usa Resium. **No** se usa deck.gl ni three.js hasta que MapLibre no alcance en volumen de datos (medido).
- Un solo visor pesado vive a la vez; el adaptador define `create / flyTo / setLayers / getCameraState / destroy`.

## Alternativas descartadas

Cesium como base (peso y dependencia de datos de pago); Mapbox GL JS (licencia propia + token, ver E-07); Google Maps JS (el producto debe sobrevivir sin Google).

## Consecuencias

El 3D «fotorrealista» **no** forma parte del MVP; la representación 3D inicial es relieve. Si más adelante se activa Cesium, los layers vectoriales necesitarán un **puente XYZ** sobre PMTiles (ADR-0005).

## Revisar cuando

Exista cobertura 3D verificada y credenciales, o `MVTDataProvider` deje de ser experimental y se mida su rendimiento con nuestros datos.
