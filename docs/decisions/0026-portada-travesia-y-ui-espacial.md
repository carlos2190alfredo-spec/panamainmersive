# ADR-0026 — Portada «Travesía» y UI espacial

- **Estado**: aceptada (2026-11-12). Elegida por la persona propietaria entre tres direcciones («usa la travesía, opción B»), con el añadido «quiero que el sitio tenga un diseño UI espacial».
- **Amplía**: ADR-0025 (identidad y ámbito inmersivo; la paleta, la tipografía y las reglas de contraste no cambian).

## Contexto

La persona propietaria pidió un rediseño «profesional, moderno, inmersivo e interactivo» que haga fácil entender Panamá y ver sus lugares, adaptado a cualquier dispositivo. Se propusieron tres direcciones estructuralmente distintas (comprobadas con `check_directions.py`: 9 de 9 ejes distintos en cada par): **A · Cuaderno de ruta** (editorial, ligera), **B · Travesía** (recorrer el istmo) y **C · Mapa vivo** (el mapa WebGL como portada). Se eligió **B**.

Restricción que manda: **no hay fotografías con derechos** ni contenido turístico verificado (CLAUDE.md: no se inventan imágenes ni datos). El diseño tiene que sostenerse con lo que es real: el contorno del país, las anclas de los nueve destinos, sus tipos y la tipografía.

## Decisión

**Concepto**: Panamá se recorre de **oeste a este**, entre el **mar Caribe** (norte) y el **océano Pacífico** (sur), y cada destino aparece en su **posición real**.

1. **El istmo real**. `pipelines/brand/make_isthmus.py` poligoniza el contorno del país de Overture (`boundaries.geojsonl`, `subtype=country`, que incluye las costas), lo contrasta con la capa de tierra (≥ 95 % de coincidencia o falla), conserva el continente y las islas de ≥ 25 km², simplifica a ≈ 1,3 km y proyecta (equirectangular con corrección de latitud media) a un `viewBox` de 1000 × 433. Con la **misma** proyección sitúa el ancla de cada destino. Salida: `src/domains/tourism/isthmus.generated.json` (no se edita a mano; lleva su procedencia y la atribución ODbL). Derechos **provisionales** (L-01).
2. **Orden de la travesía** (`src/domains/tourism/travesia.ts`, puro): longitud creciente; un destino sin ancla lanza (no se coloca a ojo). Coordenadas con dos decimales en el formato del idioma y la letra del hemisferio de cada idioma (`Home.travesia.hemisphere`).
3. **Héroe**: el texto (sin cambios de contenido) sobre su tarjeta sólida y el istmo como segunda columna desde 64rem (debajo del texto en pantallas menores; sin `order`). La marca P ya no se repite en el héroe: está en la cabecera.
4. **Travesía**: una barra de paradas pegada bajo la cabecera (`<nav>` con un enlace por parada; `TravesiaProgress` marca la actual con `aria-current="step"`, llena la barra y la desplaza solo a ella misma, nunca la página) y una escena por destino (`<li data-destination data-kind id="parada-…">`, dos enlaces hermanos: la ficha, estirada, y «Ver en el mapa» con la clave).
5. **UI espacial**, como profundidad y no como vidrio con texto encima (el texto sigue sobre superficies sólidas: axe no mide el contraste sobre translúcido):
   - capas del istmo a distinta profundidad (`data-depth` far/mid/near) que `DepthStage` desplaza con el puntero, **solo** con `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`;
   - en cada escena, el localizador detrás y el panel delante, elevado (`--shadow-depth-3`) y solapándolo, que se separan al desplazarse (`animation-timeline: view()`, solo con soporte y `no-preference`; solo `translate`/`scale`).

## Consecuencias

- **Rechazado**: fotos de archivo o generadas (serían inventadas), vidrio con texto encima, WebGL en la portada (la dirección C; el mapa 3D sigue en Explorar, opt-in), un margen negativo del istmo (desbordaba 14–45 px de 1024 a 1440 px).
- Coste medido: portada 194,1 KB de JS (+0,7) y 16,7 KB de CSS (+0,8) de 210 / 20. Dos islas de cliente nuevas, mínimas (`DepthStage`, `TravesiaProgress`).
- Pendiente de la persona propietaria: **fotos con derechos** de cada destino (el hueco natural es el panel de cada escena), la revisión humana de los textos nuevos en en/pt/fr/de (traducción automática) y L-01 para el contorno.
- Si cambia el mapa base o un ancla, se regenera con `.venv/bin/python -I pipelines/brand/make_isthmus.py` (necesita `data/build/basemap/`, `pnpm data:build`); las pruebas de `tests/unit/domains/travesia.test.ts` comprueban que los puntos son las anclas reales.
