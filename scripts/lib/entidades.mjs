/**
 * Los vocabularios cerrados del registro de entidades (#566): ops/entidades.json y
 * ops/entidades-sujetos.json. Los valores van en inglés (decisión de Pablo del 11 oct 2026);
 * las definiciones, en castellano. Cada vocabulario está anclado en ops/vocabularios-vida.json
 * (`entidades.<nombre>`): un valor no se borra ni se reutiliza, se retira (principio 12 del N0).
 * Los lee ops/entidades.test.js, que vigila el registro.
 */

/** El eje de una entidad: a qué bloque pertenece. */
export const AXES = {
  horizontal: "Cómo trabajamos: sesiones, normas, agentes, issues y PR",
  vertical: "El producto HoMenu: casas, recetas, menús y Lola",
  bridge: "Lo que cruza los dos ejes y se define una sola vez",
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
