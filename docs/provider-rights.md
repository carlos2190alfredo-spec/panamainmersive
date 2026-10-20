# Derechos por proveedor

**Política por defecto: denegar.** Una acción solo se permite cuando existe una política registrada, vigente y verificada en la fuente primaria. Esta matriz es la **entrada de datos** del `RightsPolicyEvaluator` (ADR-0007). Fecha: 2026-10-20.

Acciones evaluadas: `display` mostrar · `combine` combinar con otros datos/mapas · `cache` cachear · `download` descargar · `transform` transformar · `redistribute` redistribuir · `offline` uso sin conexión · `ai_process` procesar con IA.

Leyenda: ✅ permitido (verificado en fuente primaria) · 🟡 permitido **con condiciones/probable**, no verificado en primaria · ⛔ prohibido (según resumen secundario) · ❓ desconocido.

| Proveedor / dato | display | combine | cache | download | transform | redistribute | offline | ai_process | Atribución | Verificación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Overture** (base, divisions, transportation) | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 *(ODbL: como base derivada, con licencia y atribución)* | 🟡 | ❓ | «© OpenStreetMap contributors, Overture Maps Foundation» | **E-33 secundaria** |
| **Overture Places** | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 *(CDLA-Permissive-2.0)* | 🟡 | ❓ | Según Overture | E-33 secundaria. **Contiene datos personales de contacto** |
| **Natural Earth** | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 *(dominio público)* | 🟡 | 🟡 | Cortesía recomendada | No leído hoy |
| **Terreno AWS (Terrarium)** | ✅ *(CORS verificado)* | 🟡 | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Fuentes SRTM/GMTED/ETOPO1 por tile (`x-amz-meta-x-imagery-sources`) | E-25 (técnica); licencia **no leída** |
| **Google Photorealistic 3D** | 🟡 *(con logo y atribución por tile)* | ⛔ *(no combinar con restricciones de Google)* | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | Logo Google + `asset.copyright` agregado | **E-31 secundaria** |
| **Google Street View / 2D Tiles** | 🟡 | ❓ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | Logo + atribución | E-31 secundaria |
| **Google Routes** | 🟡 | ⛔ *(mostrar en mapa no-Google)* | ❓ | ❓ | ❓ | ⛔ | ❓ | ❓ | Logo si no es mapa Google | **E-37 secundaria** |
| **Cesium ion** (activos) | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Por activo | Sin acceso |
| **Mapillary** | 🟡 *(CC BY-SA)* | ❓ | ❓ | ❓ | ❓ | 🟡 *(share-alike)* | ❓ | ❓ | Autor + CC BY-SA | **E-36 secundaria** |
| **KartaView** | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Sin acceso |
| **Wikimedia Commons** | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❓ | **Por archivo** (licencia, autor, fuente) | Sin acceso; la licencia se registra **por activo** |
| **IGN/ANATI, MiAmbiente, ATP** | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | **Sin acceso. Solicitar licencia por escrito** |
| **UNESCO** | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | Sin acceso |
| **Servidores de teselas OSM** | ⛔ en producción | — | ⛔ | ⛔ | — | — | ⛔ | — | — | E-39 no leída; **no se usan** |
| **Mapbox GL JS / Directions** | — | ⛔ | — | — | — | — | — | — | — | Licencia propia (E-07); **descartado** |

## Estado de cada política (cómo se concilian «deny-by-default» y el desarrollo local)

| Estado de la política | Significado | Efecto en el evaluador |
| --- | --- | --- |
| `verified` | Texto leído en fuente primaria, extracto y fecha guardados, revisado por otra persona | **Permite** la acción en cualquier entorno |
| `provisional` | Licencia conocida de forma secundaria o general (🟡), no leída en la fuente primaria | Permite **solo fuera de producción**; **bloquea la publicación a producción** y se lista como bloqueo de lanzamiento |
| *(sin política)* o ⛔/❓ | Desconocido o prohibido | **Deniega** siempre |

Hoy **ninguna** política es `verified`: Overture, Natural Earth y el terreno AWS están `provisional`. Es un **bloqueo de lanzamiento** registrado en `docs/backlog.md`, no un obstáculo para probar la aplicación localmente.

## Consecuencias de diseño

- **Offline**: ningún paquete incluirá Google 3D, Street View ni teselas de OSM. Solo datos con `offline` ✅/🟡 **verificado**.
- **Atribución**: el `AttributionComposer` agrega las atribuciones de **todo lo que está activo en la vista**, también en el paquete offline y en la página de fuentes.
- **IA**: nada se envía a un modelo si `ai_process` ≠ ✅ para ese dato.
- **Pendiente de revisión legal**: ODbL y share-alike de las capas derivadas publicadas; política de datos personales de Places.

## Cómo pasar de 🟡/❓ a ✅

Leer el texto de licencia/términos en la **fuente primaria**, guardar URL + fecha + extracto en `rights_policies`, y que otra persona lo revise. Hasta entonces el evaluador **deniega**. (El conjunto de hosts a desbloquear está en `docs/setup.md`.)
