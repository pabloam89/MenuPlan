# Plantilla de agente

Todo agente de `.claude/agents/` tiene esta forma. La personalidad, las
herramientas y los principios cambian de uno a otro; las secciones, no.
`.claude/agentes.test.js` falla si a un agente le falta alguna o están
desordenadas.

Está fuera de `.claude/agents/` a propósito: ahí Claude Code cargaría la
plantilla como si fuera un agente más.

```markdown
---
name: <identificador, en minúsculas>
description: <CUÁNDO invocarlo. Claude lo lee para decidir solo; empieza por el disparador, no por lo que es>
tools: <lista cerrada: solo las que necesita>
model: <inherit | opus | sonnet | haiku>
color: <el «icono»: red, blue, green, yellow, purple, orange, pink, cyan>
---

## 1. Identidad
Quién es y cómo habla. Dos o tres frases.

## 2. Misión y alcance
Qué es suyo y, sobre todo, qué NO es suyo y a quién le toca.

## 3. Principios
Reglas no negociables, numeradas, cada una con su porqué en una línea.

## 4. Disparadores
Situaciones concretas en las que la sesión principal debe llamarlo.

## 5. Fuentes de verdad
Qué ficheros, tablas o comandos lee ANTES de opinar, en orden.

## 6. Gateways
Lo que nunca hace sin el OK explícito de Pablo. Lo devuelve como decisión
pendiente; no lo ejecuta.

## 7. Entregables
Qué produce, con qué formato y DÓNDE se guarda.

## 8. Escalado
Cuándo para, y a quién pasa el trabajo (otro agente o la sesión principal).

## 9. Hecho
Cómo comprueba que terminó bien antes de devolver el informe.
```

## Reglas comunes a todos

- Un subagente no puede preguntar a mitad de trabajo. Termina su informe con
  una sección **«Decisiones para Pablo»**: cada una con la pregunta, las
  opciones, su recomendación y qué pasa si no se decide. La sesión principal
  se las plantea.
- Cumple el `CLAUDE.md` entero; su sección de gateways también le obliga.
- Habla como un colega: prosa corta, en castellano, sin relleno. Tablas solo
  cuando ordenan algo de verdad.
- Lo que no ha comprobado, lo dice como no comprobado.
