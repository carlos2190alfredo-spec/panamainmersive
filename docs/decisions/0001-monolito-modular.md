# 0001 — Monolito modular; ETL fuera del proceso web

- Estado: Aceptada
- Fecha: 2026-10-20

## Contexto

El documento rector pide «modular monolith first». El producto tiene dominios claros (Geography, Tourism, Business, Media, Discovery, Routing, Trips, Experience, Editorial, AI) pero un único equipo/despliegue y ninguna necesidad demostrada de escalado independiente. El trabajo GIS pesado (extracción, validación, teselado) no debe ejecutarse en una solicitud web.

## Decisión

- Una sola aplicación Next.js con dominios en `src/domains/<dominio>/` (lógica pura) y adaptadores en `src/adapters/` (BD, proveedores). **Regla de dependencia**: dominio → nada de UI ni de adaptadores; los adaptadores implementan puertos del dominio.
- Carpetas de dominio **solo cuando contienen código**.
- El pipeline ETL/teselado es un proceso **independiente** (`pipelines/`, ADR-0009), invocable por CLI o contenedor, nunca desde un handler.
- Se aplica la regla a las carpetas, no a procesos: no hay servicios por dominio.

## Alternativas descartadas

Microservicios por dominio, Kafka, Kubernetes, múltiples servidores de tiles, plataforma de plugins: sin necesidad demostrada y con coste operativo alto.

## Consecuencias

(+) Un despliegue, un esquema, refactor barato. (−) Hay que **hacer cumplir** la regla de dependencia (lint de importaciones y revisión); sin ella el monolito se degrada.

## Revisar cuando

Un dominio requiera escalado, ciclo de despliegue o disponibilidad propios medidos (p. ej. routing con carga sostenida).
