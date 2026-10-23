# Pruebas de mutación

Una **mutación** cambia a propósito una pieza de código y comprueba que alguna prueba falla. Si ninguna falla, la
garantía que esa pieza daba **no está protegida**. Es la herramienta con la que se descubrió que 22 de 39 mutaciones del
SQL del modelo de contenido y 12 de 23 de su ruta de producción sobrevivían con la suite en verde (ADR-0020,
`docs/progress.md` Entrega 4b). Aquí está para que **cualquiera pueda reproducir** lo que la documentación afirma.

```bash
python3 scripts/mutation/db.py            # SQL (0007–0009) y exportador contra las suites de integración (~4 min)
python3 scripts/mutation/ts.py            # ruta de producción en TypeScript contra la suite unitaria (~2 min)
python3 scripts/mutation/cli.py           # CLI `content:export` contra su prueba de extremo a extremo (~1 min)
python3 scripts/mutation/ci.py            # orquestación y CI: `bundle-scan`, `check-bundle`, `e2e-report`, `e2e-run`, `pg-cluster`, configuraciones de Playwright, `ci.yml`, `package.json` y la propia `lib.py` (suite unitaria, señales y pytest)
python3 scripts/mutation/db.py F1 T2 G1   # solo las mutaciones con esos identificadores
```

Solo usa la biblioteca estándar de Python (no necesita `.venv`). Salida: `MATA` (alguna prueba falla: bien),
`SOBREVIVE` (hueco real, o mutante equivalente que hay que justificar), `INVÁLIDA` (rompió algo más: no se evaluó).

| Salida | Significado                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 0      | Todas las mutaciones evaluadas fueron detectadas (las «dependen del reloj» solo avisan).                 |
| 1      | Sobrevive alguna.                                                                                        |
| 2      | No se pudo evaluar: ID inexistente, árbol sucio, `git` no disponible o fallando, base no verde/completa. |
| 3      | Ninguna sobrevive, pero alguna fue `INVÁLIDA`: una garantía quedó **sin comprobar**, no «comprobada».    |

Un **0** solo se emite si se evaluó algo: pedir un ID que no existe, que todas las mutaciones sean inválidas o que las
pruebas se **omitan** (una prueba omitida no «mata») ya no termina en «0 supervivientes». Las pruebas de esta
herramienta están en `pipelines/tests/test_mutation_lib.py`.

## Reglas (cada una nació de un error real)

- **La base debe estar verde** antes de mutar: una base roja «mata» cualquier mutación sin probar nada.
- **El ancla debe existir exactamente una vez.** Prettier cambia comillas y saltos de línea; un `replace` que no encuentra
  su ancla no cambia nada y la mutación «sobreviviría» sin haberse aplicado.
- **Una mutación que rompe los tipos o la migración no es una muerte válida:** corre menos pruebas que la base y se marca
  `INVÁLIDA`.
- **Se muta la definición vigente.** La migración `0008` reemplaza funciones de la `0007`: mutar la `0007` no afecta a
  nada y su «supervivencia» no diría nada.
- **Los archivos se restauran siempre** (también con Ctrl+C) y el árbol de trabajo debe estar limpio en los archivos que
  se mutan (si el proceso muriera, `git checkout -- <archivo>` los recupera). Comprueba con `git status` al terminar.
- Un **superviviente no es automáticamente un fallo de las pruebas**: puede ser un mutante **equivalente** (p. ej. una
  segunda barrera de defensa en profundidad). Hay que justificarlo por escrito (ADR-0020); no se ignora en silencio.

## Límites conocidos

El informe de Vitest se indexa por «archivo › nombre completo»; dos casos de un `it.each` con el mismo título se distinguen con un
sufijo `#2` (antes se pisaban y la última ganaba).

Si Vitest agota el plazo (30 min) solo se detiene el proceso directo, no necesariamente sus procesos hijo; la mutación
queda `INVÁLIDA` y el archivo se restaura, pero conviene comprobar que no quedan procesos huérfanos.

`D1` (`app.panama_today()` calculado en UTC) solo se detecta entre las 00:00 y las 05:00 UTC, cuando el día de Panamá y el
UTC difieren, y PostgreSQL no permite falsear `now()`. Se avisa como «depende del reloj» en lugar de fallar.

## Mutantes equivalentes

Una mutación que **no cambia el comportamiento observable** (p. ej. quitar una comprobación previa que una segunda barrera ya hace redundante) se marca con `"equivalente", "justificación"` al final de su tupla. Se ejecuta y se informa como `EQUIVALENTE (justificado: …)`; no hace fallar la ejecución, pero **exige la justificación por escrito**: sin texto (o solo espacios) cuenta como superviviente. `ci.py` tiene dos (Q1, Q2). Antes de marcar una, intenta escribir la prueba: L1 («un ID inexistente se acepta») parecía equivalente porque una segunda barrera da el mismo código de salida, y era un hueco real (una selección mezclada con un ID inexistente se ejecutaba ignorándolo).

## Cómo añadir una mutación

Una entrada `(identificador y descripción, archivo, ancla, reemplazo)`. Debe ser una modificación **plausible** de un
error real (quitar una columna de una lista de campos congelados, ampliar un `grant`, invertir un `<`…), no un
destrozo que cualquier prueba detectaría. Si sobrevive, **escribe primero la prueba que falta** (y comprueba que falla
con la mutación y pasa sin ella).
