# Costos

> **Son estimaciones de un modelo con hipótesis declaradas, no cotizaciones.** Todos los precios proceden de fuentes **secundarias** (blogs y calculadoras de terceros, E-38/E-32) consultadas el **2026-10-20**; ninguno se verificó en la página oficial del proveedor (no accesible desde este entorno). Moneda: USD. Hay conflictos entre fuentes (se indican). Antes de cualquier decisión de compra: verificar en `supabase.com/pricing`, `vercel.com/pricing`, `developers.cloudflare.com/r2/pricing`, `cesium.com/platform/cesium-ion/pricing` y la documentación de Google Maps Platform.

## 1. Cómo se calcula (no solo «usuarios»)

Cada escenario parte de **usuarios activos mensuales (MAU)** y de **unidades facturables por sesión**. El modelo es reproducible: `docs/research/cost_model.py`.

### Hipótesis (todas **supuestos** hasta que se midan)

| Parámetro | Valor | Nota |
| --- | --- | --- |
| Sesiones por MAU al mes | 2,0 | Turismo: uso episódico |
| Minutos de exploración por sesión | ~6 | Informativo; el coste se modela por bytes y peticiones |
| Proporción de sesiones con 3D de Google | **0 %** en el MVP | Sin cobertura verificada ni clave. Sensibilidad al 15 % más abajo |
| Lecturas Range de PMTiles por sesión | 180 | A medir en Fase 2 |
| Transferencia de teselas por sesión | 2,5 MB | A medir; servida por CDN/R2 |
| Transferencia de la app por sesión | 1,2 MB | JS/HTML/medios |
| Peticiones al host de la app por sesión | 40 | Cada acierto de CDN cuenta |
| Invocaciones de función por sesión | 12 | SSR/API |
| Cálculos de ruta por MAU y mes | 1 | Autoalojado |
| Cache hit ratio de teselas | 90 % | Solo los fallos son operaciones Clase B |
| Almacenamiento (PMTiles + paquetes + medios) | 8 GB | |

### Precios usados (secundarios, sin verificar)

| Servicio | Precio usado | Fuente / conflicto |
| --- | --- | --- |
| Vercel Pro | 20 USD/puesto; 1 TB transferencia y 10 M peticiones edge incluidos; 0,15 USD/GB extra; 2 USD/M peticiones extra; 0,60 USD/M invocaciones | makerkit; **fuentes en conflicto** sobre funciones/CPU |
| Supabase Pro | 25 USD/mes (+10 USD de crédito de cómputo, 8 GB BD, 250 GB egress); cómputo adicional **supuesto**: 0 / 0 / 60 / 410 USD según escala | makerkit; **conflicto** en MAU incluidos |
| Cloudflare R2 | 0,015 USD/GB-mes; Clase B 0,36 USD/M; egress gratis | semaphore/spendbase |
| Google Photorealistic 3D | 6 USD/1 000 solicitudes de tile raíz | **Conflicto** (foro Cesium vs blog); SKU Enterprise; tramo gratuito no confirmado |
| Routing (Valhalla autoalojado) | 40 USD/mes de VM (×3 a 1 M MAU) | **Supuesto** |
| Cesium ion | Community gratis / Commercial 149–524 / Premium 499–874 | cesium.com (fragmento) |

## 2. Escenarios (MVP: 2D + relieve, sin Google 3D)

| MAU | Sesiones/mes | Transf. app (GB) | Transf. teselas CDN (GB) | Vercel | R2 | Supabase | Google 3D | Routing | **Total/mes** |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 000 | 2 000 | 2,3 | 4,9 | 20,01 | 0,13 | 25,00 | 0 | 40 | **≈ 85** |
| 10 000 | 20 000 | 23,4 | 48,8 | 20,14 | 0,25 | 25,00 | 0 | 40 | **≈ 85** |
| 100 000 | 200 000 | 234 | 488 | 21,44 | 1,42 | 85,00 | 0 | 40 | **≈ 148** |
| 1 000 000 | 2 000 000 | 2 344 | 4 883 | 375,96 | 13,08 | 435,00 | 0 | 120 | **≈ 944** |

**Sensibilidad A — Google 3D al 15 % de las sesiones** (si se verificara cobertura y se activara): +1,8 / +18 / +180 / +1 800 USD → totales ≈ **87 / 103 / 328 / 2 744**. Es el único rubro que domina el coste.

**Sensibilidad B — peor caché (50 %) y 400 lecturas/sesión**: R2 sube a ≈ 0,26 / 1,56 / 14,5 / 144 → totales ≈ **85 / 87 / 161 / 1 075**.

### Lectura honesta del modelo

1. **La infraestructura es barata** con este diseño (PMTiles estáticos, egress gratis en R2). El riesgo económico está en otro sitio.
2. **El coste dominante es humano**: curaduría de contenido, **revisión lingüística en cinco idiomas** y **verificación de empresas** (ver §4). No aparece en la tabla anterior.
3. **Google 3D** (si se activa) escala linealmente con las sesiones 3D; hace falta cuota y *circuit-breaker* **antes** de activarlo (§5).
4. Estas cifras **no** incluyen: dominio, correo transaccional, IA (ver §3), observabilidad de pago, copias de seguridad adicionales ni *staging*.

## 3. Rubros que el modelo aún **no** cuantifica (a rellenar con datos)

| Rubro | Qué falta saber |
| --- | --- |
| **IA** (concierge, traducción, embeddings) | Precio por millón de tokens del modelo elegido (no verificado hoy), tokens por conversación, conversaciones por MAU. Fórmula: `conversaciones × (tokens_entrada·p_in + tokens_salida·p_out)`. Se acota por límites duros por conversación. |
| **Satélite/terreno de otros proveedores** | No hay proveedor elegido (el terreno AWS es gratuito, términos sin leer). |
| **Cesium ion** | Solo si se activa Cesium (ADR-0004). |
| **Observabilidad** (Sentry, OpenTelemetry) | Se difiere hasta conocer el despliegue. |
| **Copias, *staging*, transferencia entre nubes** | Depende de la arquitectura de despliegue elegida. |

## 4. Trabajo editorial, verificación y revisión lingüística (costos operativos distintos)

No se cotiza: depende de tarifas **no conocidas**. Fórmula de planificación:

```
horas_revisión = Σ_idiomas ( palabras_a_revisar × h/palabra ) + Σ_entidades ( horas_verificación )
```

Ejemplo ilustrativo **(solo para mostrar la estructura, valores supuestos)**: 9 destinos × 800 palabras × 4 idiomas traducidos = 28 800 palabras a revisar, más la interfaz. Cada nueva entidad o cada cambio en el original **reinicia** la revisión de sus traducciones (`outdated`). Este coste **crece con el contenido**, no con los usuarios.

## 5. Control de gasto (diseño)

Presupuestos por proveedor y por operación; **reservas de gasto** cuando sea viable (`budget_reservations`); cuotas; alarmas; **margen por facturación retrasada** (los proveedores facturan con retraso: la cuota local debe cortar antes del límite contractual); *circuit-breakers* con *fallback* (el *Experience Resolver* degrada a relieve/2D). **Una alerta de presupuesto no es un límite duro de gasto.** Fase 9/10.

## 6. Qué revisar antes de comprar nada

Los términos de Google (3D/Street View/Routes) pueden prohibir combinaciones y almacenamiento que el diseño asume (ver `docs/provider-rights.md`). La decisión de activar Google 3D **requiere** cobertura `VERIFIED`, derechos leídos en la fuente primaria, presupuesto y autorización explícita.
