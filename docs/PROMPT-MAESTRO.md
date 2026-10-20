# Panamá Immersive — Prompt maestro para Claude Code

Versión: 1.0 · Preparado el 20 de octubre de 2026  
Objetivo: investigar, diseñar y construir una plataforma turística geoespacial de Panamá, inmersiva, multilingüe y preparada para producción.

## 1. Tu misión y forma de trabajar

Actúa como arquitecto de software y GIS, ingeniero senior de Next.js/React/TypeScript, CesiumJS, MapLibre, PostgreSQL/PostGIS, rendimiento web, seguridad, UX y accesibilidad. Integra criterio de producto turístico, internacionalización, licencias de datos e IA con fuentes verificables.

Trabaja sobre el repositorio que tengas abierto. Tu tarea es convertir este documento en una implementación mantenible y comprobable. No te limites a responder con una arquitectura, una lista de tareas o una maqueta.

Primero realiza Architecture Discovery & Review. Antes de escribir código de aplicación, documenta decisiones, riesgos, cobertura, licencias y plan de ejecución. Después comienza la implementación local por fases, siguiendo los criterios de aceptación de este documento.

Cuestiona las tecnologías propuestas. Puedes sustituirlas si demuestras una mejora y documentas la decisión. Distingue entre hechos comprobados, supuestos de trabajo y decisiones pendientes.

Instrucciones operativas:

- Inspecciona archivos, estado de Git, dependencias, scripts, documentación e instrucciones aplicables, incluidos CLAUDE.md y AGENTS.md.
- Conserva cambios existentes y funcionalidades útiles. No reinicies un proyecto existente para ajustarlo a tu plantilla preferida.
- Si la carpeta está vacía, crea una base mínima coherente. Si ya hay una aplicación, trabaja incrementalmente.
- Investiga documentación oficial y versiones estables compatibles antes de elegir APIs. No asumas que una biblioteca conserva su API anterior.
- Registra URL y fecha de consulta para decisiones sobre precios, cobertura, licencias y límites.
- Resuelve decisiones reversibles con criterio y sigue trabajando. Pregunta solamente cuando falte información que cambie materialmente el resultado o autorización para una acción externa.
- No contrates servicios, generes cargos, publiques en producción, modifiques bases de producción ni ejecutes cambios destructivos sin autorización suficiente.
- No desactives permisos, sandbox, pruebas o controles de seguridad para avanzar.
- Si falta una credencial, aísla esa integración, explica qué falta y continúa las tareas independientes.
- No presentes un mock como integración terminada. Los fixtures deben vivir en pruebas o entornos de demostración claramente identificados.
- Mantén docs/progress.md y docs/backlog.md actualizados para continuar entre sesiones.
- No declares pruebas ejecutadas que no hayas ejecutado ni resultados que no hayas observado.

Comunícate conmigo en español. Usa inglés para identificadores de código y convenciones técnicas. El producto deberá funcionar en varios idiomas.

## 2. Visión del producto

Nombre provisional: Panamá Immersive. Centraliza nombre, dominio y marca en configuración para poder cambiarlos después.

Construye una experiencia que permita explorar, descubrir, comprender y planificar viajes por Panamá mediante mapas, relieve, fotografías reales, panoramas existentes, capas GIS, historias y recomendaciones.

La referencia conceptual combina exploración geográfica, documental interactivo y planificador turístico. Diseña identidad propia.

La experiencia debe ser:

- Map first, premium, móvil desde el inicio y visualmente cuidada.
- Rápida, progresiva y útil también sin 3D avanzado.
- Accesible por teclado y mediante una alternativa textual al mapa.
- Capaz de funcionar sin que Google u otro proveedor sea una dependencia indispensable.
- Honesta respecto a cobertura, actualidad, verificación y disponibilidad de datos.

No dependas de drones, cámaras propias, fotografías propias, captura 360 propia, fotogrametría propia ni LiDAR propio. Toda la solución debe funcionar con fuentes existentes y derechos de uso comprobados.

Nunca inventes fronteras, polígonos, carreteras, senderos, empresas, horarios, precios, cobertura fotogramétrica, imágenes, disponibilidad de reservas ni certificaciones oficiales.

## 3. Alcance inicial y experiencia

Prepara un motor nacional y desarrolla inicialmente estos nueve destinos:

1. Ciudad de Panamá.
2. Casco Antiguo.
3. Canal de Panamá.
4. El Valle de Antón.
5. Boquete.
6. Volcán Barú.
7. Bocas del Toro.
8. Santa Catalina.
9. Coiba.

Las relaciones geográficas y turísticas no son necesariamente un árbol. Distingue pertenencia administrativa, contención espacial, proximidad y acceso turístico. Por ejemplo, una localidad de acceso a un parque no debe convertirse automáticamente en su contenedor geográfico.

Flujos principales:

- Abrir Panamá y descubrir destinos.
- Seleccionar destino, polígono o punto y ver información contextual.
- Activar capas y comprender su leyenda.
- Filtrar por naturaleza, aventura, playa, cultura, gastronomía, familia, pareja, historia, relax y lujo.
- Consultar actividades y empresas, con estado de verificación visible.
- Explorar fotografías y panoramas disponibles.
- Crear rutas y viajes viables.
- Consultar recomendaciones e IA con fuentes.
- Descargar regiones permitidas para uso sin conexión.
- Cambiar de idioma conservando el contexto de exploración.

Reservas, pagos, marketplace, aplicaciones nativas y AR son extensiones futuras. Prepara límites de dominio adecuados sin implementarlas prematuramente.

## 4. Internacionalización obligatoria desde la primera fase

Idiomas iniciales del producto:

| Código | Idioma | Nombre en el selector |
| --- | --- | --- |
| es | Español, predeterminado | Español |
| en | Inglés | English |
| pt | Portugués | Português |
| fr | Francés | Français |
| de | Alemán | Deutsch |

Estos cinco idiomas son el alcance inicial acordado para este trabajo. Permite añadir más mediante un registro central, sin duplicar componentes ni entidades. Diferencia idioma, región, moneda y zona horaria.

Usa next-intl con Next.js App Router si encaja con las versiones verificadas. Justifica cualquier alternativa.

### Interfaz y formatos

Internacionaliza navegación, botones, filtros, categorías, leyendas, controles cartográficos propios, formularios, errores, validaciones, estados vacíos, avisos, accesibilidad, ayuda, administración, correos transaccionales que se implementen y contenido del planificador.

- No incrustes textos visibles en componentes.
- Usa mensajes ICU, interpolación segura y plurales.
- Carga solamente los mensajes necesarios del idioma activo.
- Usa Intl para números, fechas, horas y monedas.
- Emplea America/Panama como zona horaria de eventos y horarios locales, distinguiéndola de la zona del visitante.
- No conviertas moneda automáticamente al cambiar de idioma. Mantén moneda y unidades como preferencias independientes.
- Conserva nombres oficiales, atribuciones y textos legales originales cuando corresponda.
- Usa nombres de idioma en el selector; no dependas de banderas para representarlos.
- Prepara CSS con propiedades lógicas y espacio suficiente para textos largos. No afirmes soporte RTL hasta probarlo.
- Si un control externo no admite un idioma, documenta esa limitación y ofrece instrucciones accesibles traducidas sin falsear su soporte.

### Rutas y persistencia

Usa prefijos de idioma en las rutas. Por ejemplo:

- /es/explorar
- /en/explore
- /pt/explorar
- /fr/explorer
- /de/entdecken

Las rutas de destinos deben relacionarse por un ID estable. Los slugs pueden localizarse mediante una tabla o registro de rutas, conservando redirecciones al modificarlos.

La URL explícita determina el idioma de una página compartida. Para accesos sin idioma, utiliza preferencia guardada y después idioma del navegador, con español como fallback. No impongas idioma mediante geolocalización.

Al cambiar de idioma conserva destino, cámara, capas, filtros y viaje activo. Si la navegación requiere recrear el visor, restaura su estado y libera la instancia anterior; nunca mantengas dos escenas pesadas por accidente.

### Contenido y traducciones

Separa entidades de sus traducciones. Un destino tiene una sola identidad y geometría, con traducciones relacionadas.

Diseña tablas tipadas como destination_translations, activity_translations, business_translations, story_translations y layer_translations cuando correspondan. No construyas un EAV genérico que pierda integridad referencial.

Cada traducción editorial debe registrar:

- entity_id y locale.
- Campos traducidos y slug, cuando aplique.
- source_language y source_version.
- translation_status: draft, machine_translated, reviewed, published u outdated.
- translated_at, reviewed_at y responsable de revisión, cuando exista.
- Procedencia y relación con el contenido original.

Si cambia el original, marca las traducciones afectadas para revisión. Nunca marques una traducción automática como revisada por una persona ni como traducción oficial.

Traduce y revisa la coherencia técnica de la interfaz de los cinco idiomas. Para contenidos turísticos, crea traducciones a partir de fuentes permitidas, conserva su estado editorial y exige revisión humana antes de publicar traducciones de restricciones, seguridad o información legal sensible. Los bloqueos editoriales no deben impedir probar la aplicación localmente.

Si falta una traducción, muestra el original con una indicación clara. No presentes una página en español como si estuviera traducida al alemán. No anuncies un idioma como completamente publicado mientras tenga huecos relevantes.

### SEO y búsqueda multilingüe

- HTML con lang correcto y contenido público renderizable en servidor.
- Metadatos, títulos, descripciones, Open Graph y textos alternativos localizados.
- Canonical propio por versión idiomática válida.
- hreflang recíproco, autorreferencia y x-default donde corresponda.
- Sitemaps con variantes realmente publicadas.
- No apuntes todos los canonical a español.
- No indexes páginas vacías, traducciones pendientes ni duplicados presentados como traducciones.
- Búsqueda con alias, acentos, nombres oficiales, sinónimos y consultas en distintos idiomas.
- El modelo de embeddings, si se utiliza, debe admitir los idiomas activos.
- La IA responde en el idioma seleccionado y conserva la procedencia original de las fuentes.
- Los paquetes offline incluyen contenido, interfaz y recursos del idioma elegido.

## 5. Discovery y decisiones antes del código

Produce Architecture v1 con documentos útiles y concretos. Puedes agrupar apartados relacionados; evita documentos vacíos o repetidos.

Incluye:

A. Architecture Review: correcto, incorrecto, riesgoso, excesivo, faltante y recomendado.  
B. Technology Decision Matrix.  
C. Arquitectura final y diagramas.  
D. Frontend.  
E. Backend.  
F. Base de datos.  
G. GIS.  
H. Representación visual.  
I. Proveedores y derechos.  
J. Experience Resolver.  
K. Layer Engine.  
L. Legend Engine.  
M. Recomendaciones.  
N. Empresas y verificación.  
O. Routing.  
P. IA y RAG.  
Q. Offline.  
R. Seguridad.  
S. Costos.  
T. Rendimiento.  
U. Internacionalización y publicación editorial.

Compara CesiumJS, MapLibre GL JS, Mapbox GL JS, Google Maps, deck.gl y Three.js según realismo, rendimiento, móvil, GIS, 3D, licencias, costos y dependencia del proveedor.

Explica qué problema resuelve cada herramienta elegida y cuáles descartas. No confundas CesiumJS con Cesium ion, ni Google Maps con Google Photorealistic 3D Tiles.

Define criterios para cambiar decisiones mediante ADR. No conviertas una preferencia inicial en una obligación tecnológica sin evidencia.

## 6. Arquitectura inicial preferida

Usa esta base, sujeta al análisis:

- Next.js App Router, React y TypeScript estricto.
- next-intl para internacionalización.
- CesiumJS para exploración 3D cuando aporta valor.
- MapLibre GL JS para cartografía ligera, 2D y offline.
- Zustand para estado pequeño de interfaz.
- TanStack Query para estado remoto, invalidación y cancelación.
- PostgreSQL con PostGIS; Supabase como opción gestionada.
- Full-text search y pgvector cuando haya una necesidad probada.
- Almacenamiento compatible con S3; evaluar Cloudflare R2.
- CDN para recursos propios o con derechos de distribución.
- Backend modular inicialmente dentro de la aplicación.
- Procesos GIS y ETL pesados en un worker o contenedor independiente.
- Routing mediante adaptador, preferentemente Valhalla si la operación lo justifica.
- Vitest o equivalente y Playwright para pruebas.
- Sentry y OpenTelemetry con integración progresiva.

Aplica modular monolith first. No crees microservicios para cada módulo, Kafka, Kubernetes, múltiples gestores de estado, varios servidores de tiles ni una plataforma de plugins compleja sin necesidad demostrada.

Evalúa integración directa de Cesium frente a Resium. Prefiere un adaptador pequeño e imperativo si reduce problemas de lifecycle y renderizado. No construyas un SDK público ni una abstracción universal antes de tener casos reales.

WebGPU es una mejora opcional que requiere mediciones y soporte real. Mantén una ruta WebGL compatible.

## 7. Organización y límites

Organiza por dominios, con dependencias claras:

- Geography: áreas, geometrías, relaciones y fuentes espaciales.
- Tourism: destinos, atracciones, actividades y accesos.
- Business: empresas, establecimientos, servicios y verificación.
- Media: activos, licencias, atribución y derechos.
- Discovery: búsqueda, ranking, filtros y recomendaciones.
- Routing: perfiles, rutas, matrices y tramos.
- Trips: viajes, itinerarios, días, paradas y favoritos.
- Experience: cámara, resolución visual, historias y capas.
- Editorial: traducciones, revisiones y publicación.
- AI: herramientas, recuperación de fuentes y evaluación.

Usa una estructura sencilla, adaptada al repositorio. Separa dominio, acceso a datos, adaptadores externos e interfaz. Evita archivos gigantes y carpetas vacías para funcionalidades futuras.

Mantén configuración validada por entorno y feature flags para integraciones opcionales. Documenta .env.example sin secretos reales.

## 8. Frontend, mapas y experiencia visual

El mapa ocupa la mayor parte de la experiencia.

- Desktop: información contextual lateral, aproximadamente 70 % mapa y 30 % panel cuando está abierto.
- Móvil: bottom sheet accesible, controles alcanzables y gestos que no bloqueen la navegación.
- Tipografía legible, jerarquía clara, colores propios, fotografías reales y animación contenida.
- Evita un dashboard genérico de tarjetas permanentes.
- Diseña estados de carga, error, permisos denegados, datos desactualizados y cobertura insuficiente.

Separa estado de React de la escena cartográfica:

- Crea el visor una vez por ciclo de vida.
- Actualiza la escena mediante comandos y suscripciones controladas.
- No envíes posición de cámara por frame a un store que rerenderice toda la interfaz.
- Destruye listeners, requests, workers y recursos gráficos al desmontar.
- Comprueba comportamiento con StrictMode.
- Evita cargar simultáneamente Cesium y MapLibre completos en móviles.
- Usa lazy loading, división de bundles, requestRenderMode cuando aplique y cancelación de solicitudes obsoletas.

Guarda longitude, latitude, altitude, heading, pitch y roll con unidades claras. Para 2D define conversión explícita a zoom, bearing y pitch. Permite enlaces compartidos y deep links con destino, cámara y capas.

Las transiciones flyTo, orbit, focus y settle deben ser cancelables y respetar prefers-reduced-motion. Un enlace a un destino debe abrirlo directamente, sin obligar a recorrer una introducción cinematográfica.

Representa cada entorno según su contenido:

- Montaña: relieve, topografía, senderos y fotos.
- Isla: satélite, costa, relieve, áreas marinas y accesos.
- Ciudad: 3D disponible y autorizado, o cartografía con relieve y contenido real.
- Restaurante: información y ubicación; no exige modelo 3D.
- Calle: visor autorizado de imágenes a nivel de calle.
- Destino sin fotogrametría: terreno, imágenes, capas, fotos e historia.

No uses agua, iluminación o atmósfera como si fueran mediciones reales de condiciones ambientales.

## 9. Proveedores, cobertura y derechos

Evita una interfaz VisualProvider que obligue a todos los proveedores a ofrecer lo mismo.

Diseña contratos por capacidad:

- ImageryProvider.
- TerrainProvider.
- Tiles3DProvider.
- StreetImageryProvider.
- MediaProvider.
- InstitutionalDataSource.
- RoutingProvider.

Incluye identificación del proveedor, capacidades, restricciones de combinación, atribución, cobertura comprobada, control de errores y cancelación.

Añade servicios pequeños para CoverageCatalog, RightsPolicyEvaluator y AttributionComposer. Los nombres son orientativos; no conviertas cada concepto en un proceso separado.

Evalúa Google Photorealistic 3D Tiles, Cesium ion, proveedores de satélite/terreno compatibles, Mapillary, KartaView, Wikimedia Commons y fuentes institucionales.

No asumas que Panamá o los nueve destinos tienen fotogrametría detallada. Verifica documentación y APIs disponibles por área. La visualización en un producto de consumo no demuestra automáticamente disponibilidad en su API.

Para cada destino registra:

- Google 3D.
- Street View.
- Mapillary y KartaView, distinguiendo fotografías de panoramas 360.
- Satélite y relieve.
- Geometrías oficiales.
- Fotos reutilizables.
- OSM y Overture.
- Fuentes de IGN Tommy Guardia/ANATI, MiAmbiente, ATP y UNESCO cuando correspondan.

Estados de cobertura: UNKNOWN, VERIFIED, PARTIAL, UNAVAILABLE y ERROR. UNKNOWN o ERROR no equivalen a ausencia.

Guarda método, extensión espacial, resolución o calidad observada, proveedor, fecha, versión, evidencia y caducidad. Una documentación de cobertura global no prueba calidad local.

Revisa licencias para mostrar, combinar, cachear, descargar, transformar, redistribuir, utilizar offline y procesar con IA. Lo público no implica licencia abierta.

No hagas scraping indiscriminado de Google Images. No guardes tiles o panoramas que el proveedor prohíba almacenar. Conserva atribución visible y condiciones por activo.

El funcionamiento básico debe sobrevivir a la desactivación de un proveedor comercial. No reemplaces datos reales con imágenes inventadas o mapas falsos para aparentar disponibilidad.

## 10. Experience Resolver y calidad

Diseña un resolver determinista que produzca un ExperienceManifest.

Entradas:

- Destino y geometría relevante.
- Intención del usuario.
- Evidencia de cobertura.
- Derechos y restricciones de combinación.
- Dispositivo, red y preferencias.
- Salud de proveedores.
- Presupuesto y cuotas.
- Idioma.

Separa representación de calidad. Un equipo potente no crea cobertura fotogramétrica donde no existe.

Representaciones posibles: PHOTOREALISTIC_3D, SATELLITE_TERRAIN, TOPOGRAPHIC_TERRAIN, STREET_EXPLORER, PANORAMA_STORY, PHOTO_EXPLORER y MAP_2D.

Calidad posible: HIGH, STANDARD y LITE; añade ULTRA únicamente si hay diferencias medibles.

Proceso:

1. Excluir opciones sin derechos, sin configuración, sin evidencia suficiente o fuera de presupuesto.
2. Elegir representación adecuada al destino y a la intención.
3. Ajustar calidad según capacidad y mediciones.
4. Seleccionar capas, cámara, medios y atribuciones.
5. Definir fallback ordenado y motivo observable.
6. Degradar sin perder selección, idioma, cámara ni información turística.

No dependas de APIs de memoria, temperatura o red que no estén disponibles en todos los navegadores. Usa observaciones reales de tiempo de frame, errores, contexto gráfico y volumen de descargas. Aplica histéresis para evitar cambios continuos. Ofrece ahorro de datos manual.

## 11. GIS, tiles, capas y leyendas

Usa geometrías reales y versionadas. Mantén el original separado de las simplificaciones de visualización.

- EPSG:4326 para intercambio cuando corresponda.
- GeoJSON en orden longitude, latitude.
- Distancias en metros con geography o una proyección adecuada.
- No midas áreas o distancias precisas directamente en grados ni confundas Web Mercator con una proyección métrica apropiada.
- Distingue alturas elipsoidales y elevación sobre nivel del mar.
- Valida CRS, ejes, bbox, geometrías vacías, anillos, intersecciones y topología.
- No uses ST_MakeValid como reparación silenciosa de datos oficiales.
- Aclara si una consulta debe incluir puntos sobre el límite; utiliza ST_Covers cuando ese sea el significado.

Diferencia raster tiles, vector tiles/MVT, terrain tiles y 3D Tiles.

Preferencia inicial para capas relativamente estáticas: MVT empaquetado en PMTiles, generado con herramientas apropiadas y distribuido por almacenamiento/CDN. Evalúa Martin para necesidades dinámicas posteriores. Verifica soporte real de MVT en la versión de Cesium elegida; limita extensiones y niveles de zoom para evitar cargas globales y consumo excesivo de memoria.

No envíes GeoJSON nacionales enormes al navegador. Usa simplificación, tiling, clustering, LOD y carga por extensión visible.

Define una API espacial limitada por bbox, zoom, capas, filtros y versión. Valida tamaño de bbox, límites de resultados, tiempos de consulta y permisos.

Las capas deben referenciar datasets y estilos declarativos. Incluye id, nombre traducible, descripción, fuente, versión, geometría admitida, visibilidad, prioridad, escala mínima/máxima, picking y reglas de estilo.

Genera la leyenda a partir de las mismas reglas de estilo y filtros. Usa tokens semánticos de color, patrones, símbolos y texto. No dependas solamente del color.

Al seleccionar un área, muestra información, fuente de geometría, superficie con método identificado, actividades, restricciones verificadas, accesos y fotos.

Las áreas dibujadas por administradores sin fuente oficial deben identificarse como editoriales. Nunca las presentes como límites oficiales.

## 12. Base de datos, procedencia y administración

Diseña migraciones versionadas, claves foráneas, índices, restricciones y políticas RLS.

Entidades orientativas:

- destinations, attractions, geographic_areas, geometry_versions, geographic_relations, access_points.
- activities y relaciones con destinos, áreas, empresas y rutas.
- businesses, business_locations, offerings, business_memberships, registrations.
- trails, routes, route_segments.
- media_assets, media_links, rights_policies.
- data_sources, source_versions, source_records, field_assertions.
- verification_events, review_queue, audit_events.
- layers, style_versions, publications.
- visual_coverage, provider_usage, budget_reservations.
- itineraries, itinerary_days, itinerary_stops, itinerary_legs, favorites.
- events, seasonal_windows, advisories.
- Tablas de traducciones correspondientes.

Evita duplicar empresas creando registros independientes para hotel, restaurante y operador si pertenecen a la misma entidad. Modela categorías, establecimientos y servicios.

Conserva procedencia a nivel de dato relevante: institución, URL, licencia, fecha de consulta, versión, verificación, vigencia y confianza. Distingue fuente oficial, revisión editorial y actualidad.

No uses un único booleano verified para expresar todo. El estado mostrado debe derivarse de evidencia y caducidad.

El CMS debe permitir importar datos, editar contenido y geometrías editoriales, asociar actividades y medios, revisar traducciones y publicar. Implementa revisión y auditoría de cambios importantes: quién, qué, cuándo, antes y después.

Una empresa puede reclamar su ficha y proponer cambios; no puede otorgarse a sí misma verificación oficial.

## 13. Ingestión y actualización

Pipeline: extraer, comprobar derechos, poner en cuarentena, validar, normalizar, deduplicar, enriquecer con fuentes autorizadas, revisar y publicar una versión.

Admite progresivamente GeoJSON, GeoPackage, CSV, Shapefile, KML/KMZ, WFS, WMS, ArcGIS REST y OGC API. No confundas WMS de imágenes con geometrías descargables.

Evalúa GDAL, PROJ, PostGIS y herramientas pequeñas reproducibles. Procesa trabajos pesados fuera de las solicitudes web.

Los jobs deben ser idempotentes, tener checkpoints, reintentos limitados y registrar cambios de fuente. No geocodifiques a ciegas todo el catálogo con una API de pago.

Protege importaciones contra SSRF, archivos maliciosos, zip bombs, rutas relativas peligrosas, XML inseguro y geometrías excesivas.

## 14. Descubrimiento, empresas y recomendaciones

Combina filtros estructurados, consultas espaciales, búsqueda textual y búsqueda semántica cuando aporte valor.

El ranking debe considerar actividad, tiempo o distancia apropiados, calidad de información, verificación, horario conocido, disponibilidad comprobable, temporada, diversidad y preferencias explícitas.

- Cercanía geométrica no equivale a tiempo de viaje.
- Si desconoces horarios o disponibilidad, indícalo.
- No copies valoraciones sin derechos ni inventes puntuaciones.
- Separa recomendaciones editoriales de posiciones patrocinadas.
- Explica brevemente por qué se recomienda un lugar.
- Usa la ubicación precisa solamente con consentimiento; ofrece origen manual.
- Los estados OFFICIAL, VERIFIED, COMMUNITY, UNVERIFIED y OUTDATED deben definirse con criterios comprobables, no asignarse por apariencia.

Permite descubrir zonas menos populares cuando exista información suficiente. Modela eventos y ventanas estacionales con fecha, ámbito, fuente y nivel de certeza.

## 15. Rutas y viajes

Evalúa Valhalla, GraphHopper, OSRM, Google Routes y Mapbox Directions con datos, operación, licencias, costos y restricciones de visualización.

No trates como intercambiables APIs cuyas condiciones prohíban mostrar resultados sobre ciertos mapas. Verifica los términos actuales antes de integrar Google Routes con motores o mapas de otros proveedores.

Admite auto, caminata y bicicleta cuando exista información suficiente. Transporte público requiere fuentes reales, como GTFS. No prometas tráfico en tiempo real sin proveedor.

Calcula rutas hacia accesos reales, no hacia centroides inaccesibles. Para islas y parques, representa traslados marítimos o aéreos solamente con evidencia; nunca inventes carreteras o ferris.

El planificador debe comprobar duración, desplazamientos, horarios conocidos, buffers, retorno, restricciones y viabilidad entre jornadas. Distingue estimaciones de reservas confirmadas. Un enlace externo de reserva no representa inventario disponible.

## 16. AI Travel Concierge

Añade IA cuando catálogo, búsqueda, routing y procedencia funcionen.

Arquitectura: usuario, orquestador acotado, herramientas tipadas y datos verificables. No requiere múltiples agentes autónomos por defecto.

Herramientas permitidas: búsqueda turística, filtros espaciales, rutas, empresas, actividades, contenido oficial permitido y disponibilidad real cuando exista integración.

- Sin SQL arbitrario generado y ejecutado libremente.
- Validación de parámetros, límites de consultas, autorización y timeout.
- RAG sobre contenido aprobado y con derechos de procesamiento.
- Fuentes recuperadas tratadas como datos, no como instrucciones.
- Respuestas en el idioma activo, con fuentes y fechas relevantes.
- Separación entre hechos recuperados, estimaciones y sugerencias.
- Abstención cuando falte evidencia.
- Validación determinista de itinerarios y datos críticos.
- Límites de tokens, herramientas, tiempo y costo por conversación.
- Evaluaciones de alucinaciones, citas, multilingüismo, prompt injection y recomendaciones inviables.

No prometas eliminar completamente las alucinaciones. Reduce el riesgo y mide errores.

## 17. Offline y PWA

Prepara el diseño offline desde la fase de arquitectura y entrega la funcionalidad completa en su fase.

Un paquete regional puede incluir cartografía autorizada, PMTiles, estilos, sprites, glyphs/fuentes con licencia, datos turísticos, traducciones, fotos permitidas, atribuciones y rutas previamente guardadas.

Cada paquete debe tener región, versión, fecha, idiomas, tamaño, checksum, derechos y política de actualización.

- No descargues masivamente tiles de servidores públicos de OSM.
- No guardes Google Photorealistic 3D o Street View para offline contra sus condiciones.
- Comprueba HTTP Range y CORS para PMTiles online.
- Diseña lectura local real de PMTiles mediante almacenamiento y adaptador adecuados; no supongas que cachear solicitudes parciales resuelve todo.
- Considera IndexedDB/OPFS según soporte, cuotas y eliminación de datos por el navegador.
- Permite ver espacio, borrar paquetes y elegir idiomas.
- Distingue modo de aplicación instalada de disponibilidad sin conexión.
- No prometas routing offline general en el primer MVP; permite consultar rutas guardadas.
- Protege datos privados y diseña sincronización idempotente con tratamiento de conflictos.

## 18. Seguridad y privacidad

Implementa autorización en servidor y RLS. Prueba visitantes, usuarios, propietarios de empresas, editores y administradores.

- Nunca expongas service-role keys, secretos de IA ni credenciales privadas.
- Las claves obligatoriamente públicas de mapas deben tener restricciones por origen/API y cuotas admitidas.
- No crees un proxy de tiles que infrinja condiciones del proveedor.
- Valida parámetros, uploads, URLs externas y consultas espaciales.
- Usa CSP, CORS y cookies seguras según el despliegue.
- Aplica rate limits, protección contra abuso y límites por operación.
- Los usuarios no pueden editar sus propios privilegios.
- Mantén auditoría de publicación, verificación y cambios sensibles.
- No registres ubicaciones precisas, prompts con datos personales o tokens sin necesidad y protección.
- Define retención y eliminación de datos.
- Comprueba dependencias y licencias sin bloquear el proyecto por alertas no relacionadas o no aplicables.

## 19. Rendimiento y accesibilidad

Objetivos iniciales de laboratorio, sujetos a verificación con dispositivos y datos reales:

| Métrica | Presupuesto inicial |
| --- | --- |
| LCP público, p75 | ≤ 2,5 s |
| INP, p75 | ≤ 200 ms |
| CLS | ≤ 0,1 |
| Mapa 2D utilizable | ≤ 3 s |
| Primera vista 3D útil | ≤ 6 s |
| Respuesta visual a una acción | ≤ 200 ms |
| Nueva vista de destino | 2–4 s, según streaming |
| Fluidez desktop | Objetivo 60 FPS |
| Fluidez móvil | Objetivo estable de 30 FPS o más |
| API de búsqueda/detalle, p95 | ≤ 500 ms |
| Routing con servicio caliente, p95 | Objetivo ≤ 1,5 s |

Define un dispositivo móvil de referencia y una red de prueba, por ejemplo 10 Mbps y 100 ms RTT. Documenta lo que cada medición incluye. No presentes objetivos como resultados obtenidos.

Propón presupuestos de JS, memoria y transferencia por modo. Como punto inicial de discusión, limita el primer recorrido útil a aproximadamente 1,5 MB en modo ligero y 6 MB en 3D; ajusta con evidencia y sin esconder descargas posteriores.

Usa carga progresiva, workers donde sean útiles, clustering, culling, LOD, optimización de imágenes autorizadas y prioridad de solicitudes. No repitas cálculos GIS pesados en cada frame.

Cumple WCAG 2.2 AA en los flujos implementados: navegación por teclado, foco, contraste, textos alternativos, anuncios accesibles, controles etiquetados, reduced motion y alternativa textual. Comprueba todos los idiomas iniciales.

## 20. Costos y observabilidad

Investiga precios vigentes antes de estimar. Presenta escenarios de 1.000, 10.000, 100.000 y 1.000.000 de usuarios mensuales.

No calcules costos solamente con usuarios. Declara sesiones por usuario, minutos de exploración, proporción 3D, unidades facturables por sesión, transferencia, rutas, IA, almacenamiento y cache hit ratio.

Separa:

- Mapas y Google.
- Cesium ion, si se usa.
- Satélite y terreno de otros proveedores.
- Supabase/base de datos.
- Vercel u otro alojamiento.
- Cloudflare/R2/CDN.
- Routing y procesamiento GIS.
- IA, traducción y embeddings.
- Observabilidad, copias, staging y transferencia entre nubes.
- Trabajo editorial, verificación y revisión lingüística, como costos operativos distintos.

Registra URL, fecha, moneda, condiciones, unidades y supuestos. No presentes estimaciones como cotizaciones.

Diseña presupuestos por proveedor y por operación, reservas de gasto cuando sean viables, cuotas, alarmas, márgenes por facturación retrasada, circuit breakers y fallback. Una alerta de presupuesto no es un límite duro de gasto.

Mide tiempo de mapa útil, frame time, errores de tiles, pérdida de contexto, fallbacks, latencia, uso de APIs, descargas y costo por sesión. Evita instrumentación que degrade el mapa o capture datos personales innecesarios.

## 21. Pruebas y definición de terminado

Implementa pruebas que detecten riesgos reales. No crees tests que solamente repitan la implementación.

Incluye progresivamente:

- Unitarias: resolver, derechos, ranking, formatos y reglas de publicación.
- Integración: PostGIS, migraciones, RLS, búsqueda y APIs.
- Contratos: adapters y respuestas de proveedores.
- E2E: explorar, filtrar, seleccionar área, cambiar idioma, guardar viaje y usar offline.
- GIS: CRS, orden de coordenadas, distancias, límites, geometrías y rutas.
- Visuales: móvil/desktop, textos largos y cinco idiomas.
- Rendimiento: mapa, memoria, bundles y transferencia.
- Seguridad: acceso entre usuarios, privilegios y entradas maliciosas.
- IA: citas, abstención, traducción, contenido adversarial y viabilidad.
- i18n: claves completas, ICU válido, rutas, hreflang, fallback, accesibilidad y preservación del contexto.

Una fase está terminada cuando su flujo funciona, sus pruebas relevantes pasan, sus limitaciones están documentadas y no quedan errores arquitectónicos críticos dentro de su alcance.

Distingue IMPLEMENTED, VERIFIED, BLOCKED y DEFERRED. Una integración deshabilitada o una pantalla con fixtures no equivale a funcionalidad verificada.

## 22. Fases y puertas de avance

Fase 0 — Discovery:
Revisión, matriz tecnológica, fuentes, cobertura, derechos, arquitectura, i18n, modelo de datos, costos y riesgos. Identifica incógnitas que requieren claves o validación editorial. Resuelve con pruebas técnicas pequeñas los riesgos que puedan invalidar la arquitectura; no desarrolles destinos completos antes de esa revisión.

Fase 1 — Foundation:
Repositorio, herramientas, configuración, cinco idiomas, design tokens, componentes accesibles, migraciones iniciales, seguridad básica, CI y documentación.

Fase 2 — Exploración de Panamá:
Mapa real, adaptadores, estados de cámara, deep links, selección de destino y fallback. Una ruta operativa con datos permitidos; 3D avanzado solamente donde sea viable.

Fase 3 — GIS:
Importación controlada, geometrías, capas seleccionables, estilos, leyendas, clustering y consultas espaciales.

Fase 4 — Destinos:
Nueve fichas con fuentes, traducciones, medios autorizados, SEO y contenido contextual. No rellenes huecos con afirmaciones inventadas.

Fase 5 — Street imagery e historias:
Entrada y salida de imágenes/panoramas existentes, restauración de cámara, Guided Tour y Story Mode con contenido permitido.

Fase 6 — Empresas:
Catálogo, establecimientos, servicios, propuesta de cambios, revisión y verificación con evidencia.

Fase 7 — Actividades:
Relaciones, filtros, recomendaciones deterministas, estacionalidad y eventos.

Fase 8 — Rutas y viajes:
Routing real, accesos, tramos, planificación, favoritos y persistencia.

Fase 9 — IA:
Herramientas verificadas, RAG permitido, citas, controles de costo y evaluación multilingüe.

Fase 10 — Offline y preparación de lanzamiento:
Paquetes regionales, sincronización, PWA, pruebas de dispositivos, accesibilidad, recuperación, observabilidad y documentación operativa.

No avances sobre errores críticos de una fase anterior. Sí puedes trabajar en componentes independientes cuando una credencial o revisión editorial bloquee una integración concreta. Mantén visible el bloqueo y su impacto.

No intentes entregar todas las fases como una sola modificación imposible de revisar.

## 23. Documentación y continuidad

Mantén como mínimo:

- README.md: instalación, entorno, ejecución y flujo de trabajo.
- CLAUDE.md: instrucciones breves, comandos verificados y decisiones esenciales; conserva coherencia con instrucciones existentes.
- docs/architecture.md: arquitectura, diagramas de sistema, servicios y datos.
- docs/decisions/: ADR importantes.
- docs/data-model.md y docs/gis.md.
- docs/i18n.md: idiomas, rutas, traducciones, SEO y revisión.
- docs/coverage.md: evidencia por destino y proveedor.
- docs/data-sources.md y docs/provider-rights.md.
- docs/security.md, docs/performance.md y docs/costs.md.
- docs/setup.md: cuentas, credenciales y configuración exacta pendiente.
- docs/testing.md: pruebas y cómo ejecutarlas.
- docs/backlog.md y docs/progress.md.

Usa diagramas Mermaid pequeños cuando ayuden. No llenes CLAUDE.md con todo este documento: conserva instrucciones accionables y referencias al detalle.

Antes de finalizar una sesión, registra fase, tareas terminadas, archivos importantes, comandos ejecutados, resultados, bloqueos y siguiente acción concreta. La siguiente sesión debe poder continuar sin reconstruir decisiones desde cero.

## 24. Primer ciclo que debes ejecutar ahora

1. Inspecciona el repositorio y las instrucciones aplicables.
2. Resume el estado real y los supuestos necesarios.
3. Investiga las decisiones de mayor riesgo con fuentes oficiales.
4. Produce Architecture v1 y el plan por fases.
5. Completa la evaluación inicial de cobertura indicando lo que no se pueda comprobar.
6. Si no hay un impedimento arquitectónico crítico, inicia la Foundation local.
7. Entrega como primer hito una base ejecutable con navegación en cinco idiomas, interfaz map first, configuración segura y preparación real del mapa.
8. Integra la primera vista geográfica con datos permitidos en cuanto estén disponibles. No sustituyas esa integración por una imagen decorativa presentada como mapa.
9. Ejecuta las comprobaciones relevantes y corrige los fallos.
10. Continúa con la siguiente fase viable, manteniendo el trabajo revisable y el progreso documentado.

No necesitas solicitar una nueva confirmación para cada tarea local reversible ya incluida. Para acciones externas que requieran autorización, prepara primero una propuesta concreta con costo y efecto.

En cada entrega explica: qué funciona, cómo ejecutarlo, qué pruebas se ejecutaron, qué no pudo verificarse y qué falta exactamente. Si una limitación impide terminar, conserva un estado ejecutable y un punto de continuación claro.

## 25. Fuentes iniciales para verificar

Consulta documentación oficial actual. Estas referencias son puntos de partida, no una garantía de compatibilidad o cobertura:

- Claude Code: https://code.claude.com/docs/en/memory
- Next.js: https://nextjs.org/docs
- Internacionalización de Next.js: https://nextjs.org/docs/app/guides/internationalization
- next-intl: https://next-intl.dev/docs/routing/setup
- Google Search y variantes de idioma: https://developers.google.com/search/docs/specialty/international/localized-versions
- CesiumJS: https://cesium.com/learn/cesiumjs-learn/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Google Map Tiles: https://developers.google.com/maps/documentation/tile
- PostGIS: https://postgis.net/documentation/
- Supabase: https://supabase.com/docs
- PMTiles: https://docs.protomaps.com/pmtiles/
- Overture Maps: https://docs.overturemaps.org/
- Políticas de tiles de OSM: https://operations.osmfoundation.org/policies/tiles/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

Para fuentes panameñas, identifica los portales oficiales y los servicios concretos de IGN Tommy Guardia/ANATI, MiAmbiente y ATP. Comprueba procedencia y permisos antes de importar o redistribuir.

## 26. Regla final

Construye una plataforma turística real, multilingüe, atractiva y sostenible, que permita explorar Panamá utilizando información existente y verificable.

La calidad visual no justifica inventar datos. La complejidad técnica no sustituye una experiencia fluida. Una funcionalidad solamente puede declararse terminada cuando existe, funciona y ha sido comprobada dentro de los límites documentados.

