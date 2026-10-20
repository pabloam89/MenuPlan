---
name: higiene-del-sistema
description: Úsala para medir si la factoría se está degradando y qué quitar, fusionar o endurecer: «revisa higiene», «¿se está complicando el sistema?», «¿qué sobra?», «higiene del sistema», y en el repaso semanal. No para: revisar una skill concreta (higiene-de-skills), el glosario (higiene-de-vocabulario), diagnosticar un fallo (causa-raiz) ni arreglar nada: devuelve acciones, no las hace.
metadata:
  tipo: revision
  juzga_artefacto: true
  dueno: constructor
  estado: borrador (Álvaro, 17 oct 2026); entra en .claude/skills/ solo tras pasar por forja-de-skills
---

# Higiene del sistema

## Cuándo y para qué

Todo sistema se degrada: crece, acumula piezas sin uso, copia reglas en dos
sitios y deja normas que nada hace cumplir. Esta skill lo mide una vez por
semana y devuelve **como mucho 3 acciones**, con preferencia por quitar
(principio 0 del núcleo, `docs/ops/METAMODELO.md`). No arregla nada.

## Las seis señales de degradación

Cada una con su cifra, su comando y su techo. Un techo solo baja: si una
cifra lo supera, es hallazgo. Los techos de la tabla son **propuesta**;
el primer informe fija los reales con la cifra de ese día.

| # | Señal | Cifra | Cómo se mide | Techo propuesto |
|---|---|---|---|---|
| 1 | **Crecimiento** | principios, normas, agentes, skills, líneas de `CLAUDE.md`, líneas del agente más largo | contar en `ops/principios/principios/`, `ops/normas.json`, `.claude/agents/`, `.claude/skills/`; `wc -l` | 9 · cifra de hoy · 8 · cifra de hoy · 150 · 200 |
| 2 | **Piezas muertas** | skills sin abrir en 30 días, agentes sin encargo en 30 días, normas sin lector | `npm run planos` (medida `skills_sin_uso_semana`), `npm run fabrica` | 0 |
| 3 | **Dos fuentes** | fondos abiertos con `causa:dos-fuentes`; reglas repetidas entre `CLAUDE.md` y `.claude/rules/` | `gh issue list --label causa:dos-fuentes`; comparar | solo baja |
| 4 | **Blandura** | normas blandas, sin ejecutor o rotas | `ops/normas.json` (`veredicto`, `ejecutor`) | solo baja |
| 5 | **Caducidad** | piezas con `comprobado` de hace más de 30 días; juicios vencidos | cabecera de skills y agentes; `npm run planos` | 0 |
| 6 | **Trabajo atascado** | fondos abiertos, encargos sin PR en 14 días, ramas sin fusionar | `gh issue list --label tipo:fondo`, `npm run podar` (ensayo) | fondos ≤ 15 |

## Método

1. Lee el informe anterior (issue «Higiene: informe semanal») para comparar.
2. Mide las seis señales **en su fuente y en ese momento** (principio 6); lo
   que no puedas medir, «sin comprobar», nunca a ojo.
3. Para cada cifra por encima de su techo o que sube respecto a la semana
   anterior, propone una acción de uno de estos cuatro tipos, en este orden
   de preferencia: **quitar**, **fusionar**, **endurecer** (subir de escalón
   el mecanismo) o **techo** (aceptarla y fijar un techo nuevo, con su motivo).
4. Ordena por impacto contra esfuerzo y quédate con 3.
5. Escribe el informe (forma de abajo) como comentario en el issue semanal.

## Forma del informe

```
Higiene, <fecha>
Señales: crecimiento <cifra> (<sube|baja|igual>) · muertas <n> · dos fuentes <n> · blandas <n> · caducadas <n> · fondos <n>
1. <quitar|fusionar|endurecer|techo>: <qué>, porque <cifra>. Esfuerzo: <bajo|medio|alto>
2. …
3. …
Sin comprobar: <lo que no se pudo medir>
```

## Lo que no hace

- Arreglar: cada acción es un encargo aparte, con su rama y su PR.
- Añadir piezas para resolver una señal: si la única salida es añadir, lo
  dice y lo deja para decisión de una persona.
- Juzgar su propio informe la semana siguiente sin leer las cifras de nuevo.

## Sin comprobar

- Que `npm run fabrica` dé el uso por agente sin las transcripciones de
  todos los PC: hoy es un mínimo.
- Los techos: salen del primer informe real.
