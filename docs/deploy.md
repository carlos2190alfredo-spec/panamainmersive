# Despliegue

Estado: **PREPARADO Y ENSAYADO EN LOCAL; no ejecutado.** No existe repositorio remoto y **no se ha creado nada** en Vercel, Supabase ni en ningún otro servicio. Este documento recoge lo medido en un ensayo local (E-90) y los pasos para cuando exista el repositorio.

## 1. Qué se decidió y qué no

- **Decidido (2026-10-24, por la persona propietaria)**: primero un **staging privado en Vercel**; **no** producción pública. La razón es que producción pública está bloqueada por motivos que no son de configuración (§5).
- **Sin decidir**: dominio, base de datos remota, dónde alojar el mapa base, quién recibe los avisos de caducidad (T-19).

## 2. Ensayo local (medido el 2026-10-24, E-90)

Se clonó el paquete del repositorio (`git bundle`, HEAD `c542635`) en un directorio limpio, **sin** `public/data` (el mapa base no se versiona), y se compiló y sirvió con `SITE_ENV=staging`:

| Paso                                                                          | Resultado                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                              | Bien. Tardó 1 s porque el almacén de pnpm estaba caliente: **no es una instalación en frío**                                                  |
| `pnpm build` con `SITE_ENV=staging` y `NEXT_PUBLIC_SITE_URL=https://…`        | Bien, 14 s, 75 páginas estáticas                                                                                                              |
| `next start` (sin `-H`) y 12 URLs: 5 idiomas, explorar, destinos, ficha, etc. | Todas **200 sin redirecciones**                                                                                                               |
| `/api/health`                                                                 | `{"status":"ok","siteEnv":"staging",…}`                                                                                                       |
| Indexación                                                                    | `x-robots-tag: noindex, nofollow` (también en la ficha), `robots.txt` con `Disallow: /`, `sitemap.xml` vacío                                  |
| `/es/explorar` sin el mapa base (Chromium)                                    | Aviso «Los datos del mapa base no están disponibles», los 9 destinos en lista, sin lienzo y **un único 404** (`/data/panama-basemap.pmtiles`) |

**Mi error durante el ensayo**: arranqué primero con `next start -H 127.0.0.1` y salió el bucle 307 que ya está documentado en `CLAUDE.md` (no lo releí). Repetido sin `-H`, todo bien.

## 3. Pasos cuando exista el repositorio

1. **Persona**: crear un repositorio **vacío y privado** en GitHub y reconectar la cuenta en https://claude.ai/connect-github. Subir el historial: `git clone panama-immersive.bundle panama-immersive && cd panama-immersive && git remote add origin <URL> && git push -u origin main`.
2. **CI**: `ci.yml` y `audit.yml` **nunca han corrido**. El primer push es su primer ensayo real: puede fallar (p. ej. Chromium 156 frente al 141 local, T-15). Hay que tratarlo como medición, no como trámite. Tras el push, `pnpm check:action-pins --online`.
3. **Vercel** (el equipo ya existe): proyecto Next.js enlazado al repositorio, Node 22.x, instalación `pnpm install --frozen-lockfile`, compilación `pnpm build`.
4. **Variables** (en **todos** los entornos de Vercel, incluido el que Vercel llama «Production»: no es el `SITE_ENV=production` de este proyecto):

| Variable                        | Valor                                                   | Notas                                                                                                     |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `SITE_ENV`                      | `staging`                                               | Se hornea al compilar. Con `production` la política de derechos bloquea el mapa y la API espacial         |
| `NEXT_PUBLIC_SITE_URL`          | La URL estable del staging (`https://…vercel.app`)      | Canónicos y `hreflang`; **se hornea al compilar**: cambiarla exige un nuevo despliegue                    |
| `NEXT_PUBLIC_TILES_BASE_URL`    | Omitir (por defecto `/data`) o la URL https del almacén | Solo si se aloja el mapa base (§4)                                                                        |
| `NEXT_PUBLIC_TERRAIN_TILES_URL` | Omitir                                                  | Por defecto AWS Terrarium, que solo se carga si la persona activa el relieve (es un tercero que ve su IP) |
| `DATABASE_URL`                  | **No definir**                                          | Sin base la ficha ampliada de un área dice «no disponible» (probado en local)                             |
| `FEATURE_*` y sus credenciales  | Omitir                                                  | Ninguna integración tiene credencial                                                                      |

5. **Protección**: activar la autenticación de Vercel para **todos** los despliegues, incluida la URL estable del proyecto, y **comprobar** con una petición sin sesión (esperado: 401 o redirección al acceso de Vercel) **antes** de dar el staging por privado. Según el plan de Vercel puede no estar disponible para todos los despliegues; si no se puede comprobar, **no se despliega**.
6. **Primer despliegue y comprobaciones**: las del ensayo (§2) contra la URL real con sesión: `/api/health` con `siteEnv: staging`, `x-robots-tag: noindex, nofollow`, `robots.txt`, las páginas de los cinco idiomas.
7. **Segundo despliegue** con `NEXT_PUBLIC_SITE_URL` ya definitiva.

## 4. El mapa en staging

El mapa base **no viaja con el código**: es un PMTiles de 36 MB en `.gitignore` y sus derechos son **provisionales** (derivado de Overture/OpenStreetMap, ODbL). Sin él el staging muestra el aviso de §2. Para verlo hay que alojarlo en un almacén con **HTTP Range** (y CORS si es de otro origen) y fijar `NEXT_PUBLIC_TILES_BASE_URL`; solo **detrás de la protección**. Range y CORS cruzados **no se han probado** (`docs/testing.md`). No se puede subir con las herramientas de Vercel de esta sesión: reciben los ficheros dentro de la propia llamada (en línea o en base64, `upload_file` incluido), y un fichero de 36 MB no cabe de forma práctica.

## 5. Qué bloquea la producción pública (no es configuración)

| Bloqueo                             | Por qué                                                                                                                                                                     | Referencia                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Derechos del mapa, relieve y glifos | Todos `provisional`: el código los permite fuera de producción y los **bloquea** con `SITE_ENV=production` (`src/domains/geography/rights.ts`). Sin mapa ni API espacial    | L-01, `docs/provider-rights.md` |
| Contenido turístico                 | **Ninguna afirmación verificada**: las fichas dicen «sin verificar» y la instantánea publicada está vacía                                                                   | F4-1, F4-6                      |
| Base de datos remota                | No existe. Las migraciones solo se han probado en PostgreSQL local; Supabase real no. Falta un rol de login dedicado, un _pooler_ y limitación de tasa (`docs/setup.md` §7) | F4-8                            |
| Licencias provisionales             | 5 sin decisión legal (OFL-1.1, LGPL-3.0, CC-BY-4.0). Esto no es revisión legal                                                                                              | T-20, plazo 2027-01-22          |
| Dominio y https                     | En producción la configuración **se niega a arrancar** sin https o con `localhost` (`src/config/env.ts`)                                                                    | —                               |
| CI sin ejecutar                     | `ci.yml` y `audit.yml` nunca han corrido                                                                                                                                    | T-15                            |
| Cobertura                           | La evidencia caduca el **2027-01-18** y el resolver degradaría a mapa 2D                                                                                                    | T-19                            |
| Costes                              | `docs/costs.md` son estimaciones con hipótesis, no cotizaciones                                                                                                             | `docs/costs.md`                 |

Producción pública **hoy** serviría los nueve destinos y fichas honestas sin contenido, **sin mapa**, sin relieve y sin ficha ampliada de áreas.

## 6. Lo que NO se ha probado

Un despliegue real en Vercel; la protección de despliegues; las versiones de Node y pnpm que usará Vercel; una instalación en frío; los límites del plan; cualquier cosa contra una base de datos remota.
