# Seguridad y privacidad

Estado: modelo de amenazas inicial + controles de la Foundation. Etiquetas: `IMPLEMENTED` (existe), `VERIFIED` (con prueba observada), `PLANNED`. Ver `docs/progress.md` para lo verificado en cada entrega.

## Principios

1. **Autorización en servidor y RLS.** Nunca solo en cliente. Se prueban visitante, usuario, propietario de empresa, editor, revisor y administrador.
2. **Mínimo privilegio**: los usuarios no editan sus propios privilegios; `user_roles` solo lo escribe `admin`.
3. **Sin secretos en el cliente.** `service-role`, claves de IA y credenciales privadas **nunca** llevan prefijo `NEXT_PUBLIC_`. Las claves obligatoriamente públicas de mapas se restringen por origen/API y cuota.
4. **Validar toda entrada**: parámetros, uploads, URLs externas, consultas espaciales (zod + límites).
5. **Deny-by-default** en derechos de proveedores (ADR-0007).
6. **No rodear controles** para avanzar (sandbox, permisos, pruebas, CSP).

## Amenazas y controles

| Amenaza | Control | Estado |
| --- | --- | --- |
| XSS | CSP estricta (ADR-0010), React escapa por defecto, sin `dangerouslySetInnerHTML` (regla ESLint), mensajes ICU con interpolación segura | PLANNED→Fase 1 |
| Inyección de entorno / config rota | `src/config/env.ts` con zod: falla al arrancar con valores inválidos; separación cliente/servidor | Fase 1 |
| Fuga de claves | Prefijo `NEXT_PUBLIC_` solo para lo público; prueba que los secretos no aparecen en el bundle cliente | Fase 1 |
| Escalada de privilegios | RLS + función `app.has_role`; pruebas de integración | Fase 1 |
| Manipulación de traducciones (marcar IA como revisada) | Restricciones SQL + trigger + política de publicación | Fase 1 |
| SSRF en importaciones | Lista blanca de hosts, sin redirecciones a hosts no permitidos | Fase 3 |
| Zip bomb / path traversal / XML (XXE) / geometrías excesivas | Límites de tamaño y vértices, rechazo de `..`, parser sin entidades externas | Fase 3 |
| Abuso de API espacial | Validación de bbox/zoom/capas, límites de resultados y tiempo, *rate limit* | Fase 3 |
| Abuso general | *Rate limits* por operación (IP + cuenta) | Fase 1 (cabeceras) / 3 |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | Fase 1 |
| Robo de sesión/CSRF | Cookies `Secure`, `HttpOnly`, `SameSite=Lax` según despliegue; sin sesiones en Fase 1 | PLANNED |
| Proxy de teselas que infrinja términos | **No** se crea (ver `provider-rights.md`) | Política |
| Inyección de prompts vía fuentes | Fuentes como **datos**; herramientas tipadas; sin SQL libre | Fase 9 |
| Registro de datos personales | No se registran ubicaciones precisas ni prompts con PII sin necesidad; retención definida | Fase 1 (política) |

## Cabeceras (ADR-0010)

`X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` (geolocalización solo `self`; cámara, micrófono, etc. denegados) · `X-Frame-Options: DENY` · `Cross-Origin-Opener-Policy: same-origin` · HSTS solo en producción · CSP con orígenes **explícitos** (`connect-src`, `img-src`, `worker-src blob:` para MapLibre). Cada origen nuevo exige una entrada en la lista y su derecho en `provider-rights.md`.

## Privacidad

- **Ubicación precisa**: solo con consentimiento explícito; siempre se ofrece **origen manual**.
- **Cookie de idioma**: de sesión por defecto (ADR-0003); persistente solo tras revisión legal.
- **Preferencias** (moneda, unidades): `localStorage`, no se envían al servidor.
- **Analítica**: no hay analítica de terceros en la Foundation. Si se añade: sin datos personales innecesarios y sin degradar el mapa.
- **Datos personales de Overture Places** (teléfonos/emails/redes): no se importan sin base legal y revisión (E-24).
- [Supuesto] Marco panameño de protección de datos personales (Ley 81 de 2019): **pendiente de revisión legal** antes de recoger datos de usuarios.
- **Retención** [propuesta]: ubicaciones precisas no se persisten; registros de aplicación ≤ 30 días; auditoría de cambios editoriales conservada mientras exista la entidad; borrado de cuenta elimina perfil y favoritos.

## Dependencias y licencias

`pnpm audit` y revisión de licencias en CI **sin bloquear por alertas no aplicables** (se evalúan caso a caso y se documentan). `pnpm` bloquea por defecto los *scripts* de instalación; solo se permiten los necesarios en `onlyBuiltDependencies`.

## Lo que NO está hecho

Autenticación real, CSRF/sesiones, rate limiting efectivo, revisión legal de privacidad, pruebas de penetración. Todo se lista en `docs/backlog.md`.
