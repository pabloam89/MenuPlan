/**
 * Los vocabularios cerrados del registro de entidades (#566): ops/entidades.json y
 * ops/entidades-sujetos.json. Los valores van en inglés (decisión de Pablo del 11 oct 2026);
 * las definiciones, en castellano. Cada vocabulario está anclado en ops/vocabularios-vida.json
 * (`entidades.<nombre>`): un valor no se borra ni se reutiliza, se retira (principio 12 del N0).
 * Los lee ops/entidades.test.js, que vigila el registro.
 */

/**
 * A qué lado pertenecen las PIEZAS de una entidad (decisión de Pablo del 12 oct 2026, #652). Sustituye al
 * eje (horizontal, vertical, puente): «puente» deja de ser un valor y pasa a ser una propiedad calculada
 * (una entidad cuyas piezas están de los dos lados; ver `esPuente`). Un valor retirado de `entidades.axis`,
 * `bridge`, pasa aquí a `both`.
 */
export const SCOPES = {
  horizontal: "Factoría: sus piezas no cuelgan de ningún proyecto (cómo trabajamos)",
  vertical: "Sus piezas cuelgan siempre de un proyecto (el producto HoMenu hoy)",
  both: "Hay piezas de la factoría y de un proyecto; cada pieza declara su project o ninguno",
};

/** Una entidad es puente si sus piezas están de los dos lados. Calculado, no guardado. */
export const esPuente = (e) => e.scope === "both";

/** El nivel de las PIEZAS de una entidad: la escala única de la forja (docs/ops/FORJA.md). */
export const LEVELS = {
  meta: "N0: lo que hace buena una pieza de la familia (leyes, principios, criterios)",
  template: "N1: plantilla por tipo o perfil, de la que salen las piezas",
  piece: "N2: la pieza concreta",
};

/** La familia de una entidad: para agruparlas al leerlas, no un eje. */
export const FAMILIES = {
  work: "Cómo se trabaja: sesión, rama, PR, issues, fondos, encargos",
  access: "Quién y con qué cuenta: equipo, identidad, servicios, recursos",
  structure: "Cómo se organiza lo que hacemos: proyecto y repositorio",
  rules: "Lo que hace buena una pieza: principios, normas, criterios, estándares, vocabularios",
  agents: "Quién hace y quién juzga: agentes, tareas, skills, hooks",
  measure: "Lo que se mide: eventos, métricas, evals, planos",
  delivery: "Cómo llega el código a producción: entornos, migraciones, workflows",
  data: "Cómo se ordenan los datos del producto: tablas, fuentes, módulos",
  design: "El diseño: sistema, perfil, tokens, componentes y patrones",
  home: "La casa y su gente",
  food: "Comida: recetas, ingredientes, menús, despensa, compra",
  lola: "La conversación con Lola",
};

/** Quién crea las piezas de una entidad (puede ser más de uno). */
export const CREATORS = {
  agent: "Un agente o una sesión, con juez",
  human: "Una persona, a mano",
  automatic: "Un script, un hook o un servicio, sin intervención",
};

/** La clase de una relación (decisión de Pablo del 12 oct 2026, #652). */
export const RELATION_CLASSES = {
  is_a: "a es un tipo (subtipo) de b",
  part_of: "a es parte de b y desaparece con él: contención (factoría > proyecto > entorno, casa > persona)",
  parent_of: "b es hijo de a dentro de la misma naturaleza (fondo y sus casos); si el padre es un fondo, dice su clase en parent_kind",
  reference: "a nombra a b; ninguna de las tres anteriores",
};

/** Las dos clases de hijo de un fondo: reglas de ciclo de vida opuestas (issues.mjs, ENCARGO.md). */
export const PARENT_KINDS = {
  evidence: "Evidencia: los casos; crecen después de cerrar el fondo y pueden reabrirlo",
  remedy: "Remedio: los encargos; como mucho 3 por fondo y se cierran antes que él",
};

/** Cuántos de cada lado hay en una relación, leída de a hacia b. */
export const CARDINALITIES = {
  one_to_one: "Uno con uno",
  one_to_many: "Un a con varios b",
  many_to_one: "Varios a con un b",
  many_to_many: "Varios con varios",
};

/** Qué es la nueva forma de una entidad que deja de serlo (`becomes`). */
export const BECOMES = {
  value: "un valor de un campo de otra entidad",
  field: "un campo de otra entidad",
  event_type: "un tipo de evento",
  type: "un tipo de otra entidad",
};

/** Cómo vive hoy una entidad. */
export const REGISTRIES = {
  with_registry: "Tiene un fichero propio con id y test",
  partial: "Hay algo, pero incompleto o repartido",
  without_registry: "Solo existe en prosa o en logs",
};

/**
 * El estado de una entidad. Dos valores como `ESTADOS_TERMINO` del glosario (`activo`, `retirado`),
 * pero en inglés: la decisión de nombres del 11 oct 2026 vale para lo nuevo, y el glosario cambia sus
 * valores cuando se toque, no de golpe. No se reutilizan los de allí para no importar valores en castellano a un registro en inglés.
 */
export const STATUSES = {
  active: "Se usa",
  retired: "Ya no se usa: replaced_by dice qué lo sustituye y el id no se reutiliza",
};

/** La forma del id que tiene hoy una entidad en su fuente de verdad. */
export const ID_FORMATS = {
  kebab: "Palabras unidas por guion",
  snake: "Palabras unidas por guion bajo",
  camel: "camelCase",
  number: "Número que da GitHub",
  "number_with_name": "Número de cuatro cifras y nombre",
  uuid: "uuid de Postgres",
  "prefixed_text": "Texto con un prefijo fijo",
  compound: "Varias partes con separadores",
  mixed: "Varias formas a la vez",
  none: "La entidad no tiene id hoy",
  unchecked: "No se ha auditado",
};

/** Cómo se guarda hoy una relación entre dos entidades. */
export const STORED_AS = {
  field: "Un campo de un registro o de una tabla",
  file: "Un fichero o una constante, no un campo",
  none: "La relación existe y ningún campo la guarda",
  unaudited: "No se ha auditado (solo con una entidad vertical)",
};

/** Las relaciones. Se anotan una vez, desde quien guarda el campo. */
export const RELATIONS = {
  works_in: "a trabaja en b",
  is_a: "a es un tipo de b",
  has: "a contiene a b",
  belongs_to: "a pertenece a b",
  hangs_from: "a cuelga de b",
  uses: "a usa b",
  produces: "a produce b",
  enforced_by: "a se hace cumplir con b",
  judges: "a juzga b",
  cites: "a cita b",
  closes: "a cierra b",
  made_by: "a lo hace b",
  lives_in: "a vive en b",
  happens_in: "a ocurre en b",
  comes_from: "a sale de b",
  reads: "a lee b",
  creates: "a crea b",
  applied_in: "a se aplica en b",
  assigned_to: "a se asigna a b",
  coincides_with: "a puede ser la misma persona que b",
  measures: "a mide b",
  triggers: "a dispara la revisión de b",
  refers_to: "a nombra b",
  depends_on: "a depende de b",
};

/** Qué es un sujeto de una norma o de un estándar respecto a las entidades. */
export const SUBJECT_KINDS = {
  entity: "El sujeto es una entidad",
  type_of: "El sujeto es un tipo de una entidad; lo fijará su N2",
  part_of: "El sujeto es una parte de una entidad, no un tipo",
  instance_of: "El sujeto es una instancia concreta de una entidad",
  produced_by: "El sujeto es lo que produce una entidad",
  outside: "El sujeto queda fuera del registro, con su motivo",
};

/**
 * Qué verbos (`relation`) admite cada clase. `hangs_from` se lee de hijo a padre: `from` es el hijo.
 * La clase `reference` admite cualquier otro verbo.
 */
export const VERBOS_DE_CLASE = {
  is_a: ["is_a"],
  part_of: ["belongs_to", "has"],
  parent_of: ["hangs_from"],
};
