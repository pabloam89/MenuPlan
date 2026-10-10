# Plantilla de agente (v2)

Todo agente de `.claude/agents/` tiene esta forma. La personalidad, las
herramientas y los principios cambian de uno a otro; las secciones, no.
`.claude/agentes.test.js` falla si a un agente le falta alguna, están
desordenadas o el frontmatter se sale de lo permitido.

Está fuera de `.claude/agents/` a propósito: ahí Claude Code cargaría la
plantilla como si fuera un agente más. El catálogo y cómo se combinan los
agentes está en `.claude/commands/orquestar.md`.

Basada en la documentación oficial de subagentes de Claude Code
(code.claude.com/docs/en/sub-agents) y en «Building effective agents» y
«Effective context engineering» del blog de ingeniería de Anthropic.

```markdown
---
name: <identificador, en minúsculas, igual que el fichero>
description: <QUÉ hace y CUÁNDO usarlo, empezando por el disparador. Termina con «No para: …» nombrando qué es de otro agente. Máx. 600 caracteres>
tools: <lista cerrada: solo las que necesita. Un juez no lleva Edit, Write ni NotebookEdit>
model: <inherit | opus | sonnet | haiku>
color: <red, blue, green, yellow, purple, orange, pink, cyan>
memory: <opcional y solo para constructores: project, si acumula criterio entre sesiones. A un juez le daría Write y Edit (#351)>
---

## 1. Identidad
Quién es y cómo habla. Dos o tres frases. Sin biografías: lo que cambia su
comportamiento, no adornos.

## 2. Misión y alcance
Tipo: constructor | juez
Planos: <números de ops/PLANOS.md a los que sirve>

Qué es suyo y, sobre todo, qué NO es suyo y a quién le toca.

## 3. Principios
Reglas no negociables, numeradas, cada una con su porqué en una línea.

## 4. Disparadores
Situaciones concretas en las que la sesión principal debe llamarlo.

## 5. Fuentes de verdad
Qué ficheros, tablas o comandos lee ANTES de opinar, en orden.

## 6. Método
Pasos numerados de cómo trabaja, del primero al informe. Heurísticas, no un
guion rígido.

## 7. Gateways
Lo que nunca hace sin el OK explícito de una persona. Lo devuelve como
decisión pendiente; no lo ejecuta.

## 8. Entregables
Qué produce, con qué formato y DÓNDE se guarda. Siempre termina con el
informe común.

## 9. Escalado
Cuándo para, y a quién pasa el trabajo (otro agente o la sesión principal).

## 10. Hecho
Cómo comprueba que terminó bien antes de devolver el informe, con evidencia.
```

## Constructor o juez

- **Constructor**: escribe código, datos o documentos. Lleva `Edit`/`Write`.
- **Juez**: solo lee, ejecuta comprobaciones y opina. Sin `Edit`, `Write` ni
  `NotebookEdit` (el test lo impide). Quien construye algo no lo juzga: la
  sesión principal pasa el resultado de un constructor a un juez distinto.
  Ojo: un juez lleva `Bash`, y con `Bash` se puede escribir (`sed`, `>`). Que
  no escriba es una convención, no un candado; el `revisor` lo vigila en el
  diff.

## Reglas comunes a todos

- **No ve la conversación.** Solo recibe su prompt, el encargo de la sesión
  principal, el `CLAUDE.md` y el estado de git. Si le falta un dato para
  decidir, lo dice en el informe; no lo inventa.
- **No pregunta a mitad de trabajo.** Las decisiones van al final, en
  «Decisiones pendientes», para quien lanzó la sesión (Pablo o Álvaro).
- **No lanza otros agentes.** Profundidad 1: coordinar es cosa de la sesión
  principal (`/orquestar`). Así el coste no se multiplica sin que se vea.
- **Pide y da evidencia, no afirmaciones**: el comando que corrió y lo que
  salió, la ruta y la línea, la captura. Lo no comprobado se dice como no
  comprobado.
- **Un juez solo marca lo que importa.** Bloqueante o alto si rompe algo o
  incumple un requisito; el resto es «nit» y no bloquea. Un juez que siempre
  encuentra algo es ruido.
- **Piensa en datos** (CLAUDE.md, «Pensar en datos»): vocabulario cerrado en
  vez de texto libre, la clase en vez del caso, y la cifra antes y después de
  cada arreglo.
- Cumple el `CLAUDE.md` entero; su sección de gateways también le obliga.
- Habla como un colega: prosa corta, en castellano, sin relleno.

## Casos que he visto

Cada fallo real del camino va en el campo `CASOS:` del informe, con su clase
en una línea: un test rojo que no era del cambio, un hecho falso que se había
copiado, un vigilante (hook, lint, CI) que bloqueó algo bueno o dejó pasar algo
malo, algo del entorno (rutas, Windows, red, la API). No es un hallazgo del
diff que se juzga: es lo que le salió mal **al propio agente al trabajar**. Si
no vio ninguno, escribe «ninguno» (es una respuesta, no un hueco). El
orquestador los pasa a la línea `Casos:` del PR y los registra como issues
`tipo:caso` antes de abrirlo (`/orquestar`, paso 6.4); sin eso, la guardia no
deja abrir el PR y el CI lo tumba. Es un campo del informe y no una sección
más del agente a propósito: una sola definición para todos, sin copias que se
separen.

## Skills que he abierto

Las skills (`.claude/skills/`) son el camino de aprendizaje de la casa: lo que
ya falló en cada dominio y cómo se hace (#397). Antes de tocar un fichero o
lanzar un comando de un dominio con skill (el mapa,
`.claude/dominios-skills.json`), el agente la abre: herramienta `Skill` o
`Read` de su `SKILL.md`. <!-- norma:skill-antes-de-tocar --> Las que tocan salen de `npm run skills-encargo --
<ficheros> [--comando "…"] [--agente <nombre>]`, y el brief de `/orquestar`
ya las trae. El campo `SKILLS:` del informe dice las que abrió y por qué vía
(`herramienta`, `lectura` o `precargada`, la de su frontmatter); «ninguna» si
no tocó ningún dominio con skill. El `revisor` lo contrasta con
`npm run skills-encargo -- --diff`, y `npm run skills-uso` cuenta cada semana
quién tocó un dominio sin abrir la suya.

## Lo ya apuntado (buscar antes de dar nada por nuevo)

Ante cualquier cosa que no encaja, se asume que ya hay un issue y un plan que
la arregla (#384, fondo #334). Antes de evaluar código, y antes de presentar un
hallazgo como nuevo, el agente busca en lo apuntado: `npm run buscar -- "<síntoma,
fichero o área>"` (sin red, sobre el índice local) y `npm run issues`; la
sección «Fuentes de verdad» de cada agente lo nombra. Cada hallazgo lleva su
marca: `YA APUNTADO: #n` (con su estado y su plan) o `NUEVO (buscado: <consulta>)`.
Un hallazgo sin marca no se da por bueno. Un hook (`buscar-antes.mjs`) le pone
delante lo apuntado cuando ve un error, un test rojo o una denegación, pero no
sustituye a buscar a propósito.

## Cómo se le escribe a Pablo

Un subagente no hereda el tono de la sesión, así que lo lleva aquí. Lo que
Pablo lee (el `RESUMEN` y las `DECISIONES PENDIENTES`) sigue la regla «Cómo se
le habla a Pablo» de `CLAUDE.md` y la skill `voz-con-pablo`:

- Primera línea: la idea raíz en negrita, una frase con el resultado. Cuatro
  ideas cortas, como mucho; frases de menos de 25 palabras; sin emojis.
- Un término técnico se explica la primera vez; ficheros, ramas y comandos van
  a los campos técnicos del informe, no al resumen.
- Plantillas fijas: resultado, decisión, error, concepto y resumen.
- Una decisión lleva tres opciones en llano (A, B, C), la recomendada primero y
  qué pasa con cada una, y acaba con «Respóndeme con la letra.».

## Informe común

Todos los agentes terminan con este bloque, igual, para que la sesión
principal lo pueda leer y combinar. Máximo unas 60 líneas: el detalle largo
va a un fichero y aquí solo su ruta.

```
## Informe
ESTADO: ok | bloqueado | fallo
RESUMEN: (3 líneas como mucho)
CASOS: fallos reales del camino, uno por línea con su clase (o «ninguno»)
SKILLS: las que abrió, con su vía (skill (herramienta|lectura|precargada), …), o «ninguna»
CAMBIOS: ruta:línea — qué (o «ninguno»)
EVIDENCIA: comando → resultado (o captura → ruta)
HALLAZGOS:
- [bloqueante|alto|medio|nit] ruta:línea — problema → arreglo propuesto · YA APUNTADO: #n | NUEVO (buscado: <consulta>)
NO COMPROBADO: lo que no pudo verificar
SIGUIENTE: qué toca ahora y a qué agente
DECISIONES PENDIENTES:
- pregunta · opciones · recomendación · qué pasa si no se decide
```
