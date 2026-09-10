/**
 * El registro de preguntas del wizard: una pregunta es una FILA, no una
 * pantalla.
 *
 * ── Qué sustituye ─────────────────────────────────────────────────────────
 * Hoy el recorrido son diecisiete pantallas numeradas a mano en App.jsx, con
 * el siguiente paso decidido por índices mágicos (`nextOf(3)`, el filtro
 * `i === 4 && skipSchoolMenu`, y un `_doGoToOnboardingStep(2)` que enlaza con
 * alérgenos y lleva encima un comentario pidiendo que nadie desordene el
 * array). Con diecisiete pasos y tres condiciones ya incomoda; con las treinta
 * y cinco preguntas del motor y sus cuatro tipos de dependencia es
 * inmantenible.
 *
 * Aquí la siguiente pregunta la decide el grafo: es la primera fila cuyas
 * dependencias están satisfechas y que sigue sin resolverse. Reordenar el
 * wizard es mover una fila, y añadir un eje del motor es escribir una.
 *
 * ── Este fichero NO es la tabla del panel ─────────────────────────────────
 * `notepadFields.js` es el vocabulario del parser: lo que el modelo puede
 * emitir. Y tiene un test que impide que ninguna de sus filas apunte a
 * alergias, porque un alérgeno que entra como preferencia es el fallo
 * peligroso de todo esto.
 *
 * El wizard sí pregunta por alergias —es de los cimientos—, así que su
 * registro tiene que ser otra tabla. Las filas que además son ejes de la
 * libreta la referencian por `campo`; las que no (miembros, alergias,
 * horarios) leen de `data` y se marcan `parser: false`. Así el wizard crece
 * sin ensanchar en un milímetro lo que el modelo puede tocar.
 *
 * ── Los tres estados de una tarjeta ───────────────────────────────────────
 * La libreta tiene cuatro estados POR CAMPO; la tarjeta tiene tres de cara al
 * usuario, que son su agregado (ver `estadoDePregunta`). La regla que evita
 * que esto vuelva a ser un formulario: si el sistema puede hacer una
 * suposición razonable, la pregunta va a "aclarado" CON la suposición a la
 * vista. Solo va a "aclaracion" lo que no se puede decidir sin ponerle al
 * usuario un criterio en la boca. Una suposición visible cuesta cero si no la
 * miras; una aclaración pendiente cuesta siempre, aunque te dé igual.
 */

import { estadoDe, valorDe } from "./notepad.js";
import { COOK_LEVELS, COOK_TIME_DEFAULTS, cookLevelForMinutes, cookLevelMinutes } from "./cookTime.js";
import { rutaDeReparto } from "./reparto.js";
import { KID_DINNER_DEFAULTS, kidMembers, normalizeKidDinnerConfig } from "./kidsMenu.js";

/** Los ocho controles. Un control nuevo es trabajo; una fila nueva no. */
export const CONTROLES = [
  "chips",        // 1 · selección múltiple (alérgenos, trastos, cocinas)
  "contador",     // 2 · veces por semana, por familia
  "cards-ab",     // 3 · tarjeta ilustrada, dos o tres caminos
  "slider",       // 4 · un eje continuo (repetir, esfuerzo)
  "por-persona",  // 5 · una fila por miembro
  "rejilla",      // 6 · persona × día
  "fechas",       // 7 · ventana de validez
  "arbitraje",    // 8 · A o B, solo para choques
  // Novedad de este sprint: el slider de suma fija. No es el control 4 — ahí
  // cada eje se mueve solo, y aquí mover uno mueve a los demás.
  "reparto",
  // Un sesgo por cocina (menos / normal / más). No es "reparto" porque el
  // catálogo no puede servir un reparto de cocinas: `cocina` está ausente en
  // el 95 % de las recetas y ausente significa española, así que repartir 100
  // entre las ocho extranjeras prometería una semana que no existe.
  "cocina",
  // Selección múltiple sobre un dominio cerrado que vive en `data` y no en la
  // libreta (electrodomésticos). Es "chips" por dentro, pero el control 1 lee
  // de la libreta y este escribe con `escribe()`.
  "multi",
  // Varias preguntas pequeñas en una sola hoja. Los niños son tres decisiones
  // que no se entienden por separado —comida entre semana, cena, finde— y
  // partirlas en tres baldosas habría llenado la fila de "Niños 1/2/3".
  "grupo",
];

/**
 * Las tarjetas. No son campos: son preocupaciones que la gente reconoce como
 * suyas. Cada pregunta pertenece a una, y la tarjeta enseña su cobertura
 * ("Gustos, 1 de 6") en vez de un sí/no que mentiría.
 */
export const TEMAS = [
  { id: "cimientos", label: "Lo básico", fijo: true },
  { id: "calendario", label: "Calendario" },
  { id: "gustos", label: "Vuestros gustos" },
  { id: "tiempo", label: "Tiempo y maña" },
  { id: "cocina", label: "Vuestra cocina" },
  { id: "compra", label: "El presupuesto" },
];

/**
 * El registro.
 *
 * Columnas de dependencia, con el significado que fija el motor:
 *   requiere  sin lo otro la pregunta no tiene sentido
 *   activa    aparece sola cuando un dato la hace relevante
 *   refina    ajuste fino de algo más grueso
 *   anula     contestarla deja otra sin sentido
 *
 * `suposicion: false` marca las preguntas donde el sistema NO puede inventarse
 * la respuesta: van a "necesita aclaración" en cuanto se infieren, nunca a
 * "aclarado". Hoy solo las alergias, y es a propósito.
 *
 * ── Las columnas de la fila de controles ──────────────────────────────────
 * `enControles` saca la fila al panel de botones que vive sobre el menú.
 * NO están todas: quiénes coméis, las alergias y el cole son PERFIL —se
 * contestan una vez y viven en su pantalla—, mientras que el reparto, la
 * cocina o el tiempo son mandos del menú, cosas que se tocan cada semana
 * mirando lo que salió. Mezclarlos convertiría la fila en un menú de ajustes.
 *
 * Las BALDOSAS de esa fila van todas con recorte de /categories/cut: dibujo con
 * transparencia flotando sobre blanco. Nada de cards a sangre aquí, ni aunque
 * la ilustración exista y quede bien sola — una baldosa con fondo entre seis
 * sin él se lee como una categoría aparte, y no lo es. Hay un test que lo
 * sujeta ("todas las baldosas de la fila usan el mismo tipo de ilustración").
 *
 * `arteOpcionesLlenas` es otra cosa y sigue viva: DENTRO de las hojas, las
 * opciones sí son cards de /avatares/cards con su propio fondo, y ahí van a
 * sangre todas las de una hoja. Es la misma regla —una hoja, un tipo—, aplicada
 * al otro sitio.
 *
 * `arte` es el recorte de Midjourney que representa el eje, cuando lo hay:
 * son las mismas ilustraciones que ya usan las tarjetas del panel y las
 * facetas, y con transparencia real. Donde NO hay una que represente el eje
 * entero —"de dónde es el plato" tiene una por cocina, no una para el eje— se
 * cae a `icono` + `color`, que es el nombre del icono (este fichero es lógica y
 * no debe arrastrar JSX) y su tinte de la paleta de categorías (§1.6).
 *
 * `escribe(data, valor)` devuelve el `data` nuevo. Solo lo llevan las filas de
 * `data`; las de la libreta se escriben con `poner()` y su ruta.
 */
export const PREGUNTAS = [
  // ── Cimientos ───────────────────────────────────────────────────────────
  {
    id: "cole",
    tema: "calendario",
    label: "¿Coméis del comedor del cole?",
    control: "cards-ab",
    fuente: "data",
    lee: (data) => data?.schoolChoice ?? null,
    // Va la PRIMERA, antes que miembros y alergias. En el motor esta pregunta
    // se "activa" solo si hay niños escolarizados —lo que obliga a saber
    // quiénes sois antes—, pero preguntada como casa ("¿hay comedor?", con
    // "no aplica" de respuesta) no necesita a nadie: es un sí/no del hogar. Y
    // puesta delante paga: si hay comedor, el menú del cole es una restricción
    // que condiciona las cenas de toda la semana, y quien lo tiene lo tiene
    // presente desde el primer segundo.
    requiere: [],
    activa: null,
    refina: null,
    anula: [],
    delegable: false,
    parser: false,
    orden: 5,
  },
  {
    id: "members",
    tema: "cimientos",
    label: "¿Quiénes coméis en casa?",
    control: "por-persona",
    fuente: "data",
    lee: (data) => (data?.members?.length ? data.members : null),
    requiere: [],
    activa: null,
    refina: null,
    anula: [],
    delegable: false,
    parser: false,
    orden: 10,
  },
  {
    id: "alergias",
    tema: "cimientos",
    label: "¿Alergias o intolerancias?",
    control: "chips",
    fuente: "data",
    // "Ninguna" es una respuesta, y por eso se lee el flag y no la lista: un
    // array vacío no distingue "no tenemos" de "no lo hemos mirado", y esa
    // diferencia es justo la que no se puede suponer.
    lee: (data) => (data?.allergiesReviewed ? (data.allergies ?? []) : null),
    requiere: ["members"],
    activa: null,
    refina: null,
    anula: [],
    delegable: false,
    // Nunca se da por buena una alergia inferida del texto: se pinta para que
    // la confirmes. Es la única fila con `suposicion: false`, y el motivo es
    // que el fallo peligroso no es no entenderte — es entenderte, decir "vale,
    // te lo quito", y que te quedes creyendo que estás cubierto.
    suposicion: false,
    parser: false,
    orden: 20,
  },
  {
    id: "comidas",
    tema: "cimientos",
    label: "¿Qué comidas planificamos?",
    control: "chips",
    fuente: "data",
    lee: (data) => (data?.meals?.length ? data.meals : null),
    requiere: ["members"],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    orden: 30,
  },

  // ── Gustos ──────────────────────────────────────────────────────────────
  {
    id: "ninos",
    tema: "cimientos",
    label: "¿Cómo comen los niños?",
    corto: "Niños",
    arte: "/categories/cut/controles/ninos.png",
    color: "#4a9d6b",
    control: "grupo",
    fuente: "data",
    // La primera fila que usa `activa`: sin niños en casa, la pregunta no
    // existe — no se pinta gris ni se explica, simplemente no está.
    activa: (data) => kidMembers(data?.members).length > 0,
    // Se lee el primer niño porque es lo que hace el motor: `householdKidPolicy`
    // resuelve UNA política para el (único) grupo de Niños, y "Todos" mantiene
    // a los hermanos en sinc. Un menú de verdad distinto por hermano no es
    // representable con un solo grupo, así que tampoco se ofrece aquí.
    lee: (data) => {
      const kids = kidMembers(data?.members);
      if (kids.length === 0) return null;
      const cfg = normalizeKidDinnerConfig(data?.kidDinnerConfig);
      return cfg.byMember[kids[0].id] ?? null;
    },
    escribe: (data, valor) => {
      const kids = kidMembers(data?.members);
      const cfg = normalizeKidDinnerConfig(data?.kidDinnerConfig);
      const byMember = { ...cfg.byMember };
      // Se escribe a TODOS los niños: es lo que significa la política de hogar
      // que luego lee el planner. Guardarlo solo en el primero dejaría a los
      // hermanos con lo que hubiera antes y el menú saldría de otra cosa.
      for (const k of kids) {
        byMember[k.id] = { ...KID_DINNER_DEFAULTS, ...(byMember[k.id] ?? {}), ...valor };
      }
      return { ...data, kidDinnerConfig: { ...cfg, byMember } };
    },
    // Los tres ejes que consume `kidsSlotAction`, en el orden en que ocurren.
    // Cada opción con la ilustración que YA usa el wizard clásico para esa
    // misma decisión (KID_DINNER_ILLUS en Onboarding.jsx): es la misma
    // pregunta, y verla con otro dibujo en otro sitio se lee como otra cosa.
    subejes: [
      {
        campo: "weekdayLunch",
        label: "Entre semana, al mediodía",
        opciones: [
          { valor: "together", etiqueta: "Lo mismo que vosotros", arte: "/avatares/cards/ninos_comen_cenan_mismo.jpg" },
          { valor: "own", etiqueta: "Su propio plato", arte: "/avatares/cards/ninos_menu_propio_nino.jpg" },
        ],
      },
      {
        campo: "dinner",
        label: "Las cenas",
        opciones: [
          { valor: "sameDinner", etiqueta: "Cenan lo mismo", arte: "/avatares/cards/ninos_todos_cenan_igual.jpg" },
          { valor: "different", etiqueta: "Cena aparte", arte: "/avatares/cards/ninos_cena_diferente.jpg" },
        ],
      },
      {
        campo: "weekend",
        label: "El fin de semana",
        opciones: [
          { valor: "together", etiqueta: "Todos igual", arte: "/avatares/cards/ninos_findesemana_juntos.jpg" },
          { valor: "own", etiqueta: "Ellos aparte", arte: "/avatares/cards/comemos_por_separado.png" },
        ],
      },
    ],
    requiere: ["members"],
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    enControles: true,
    orden: 35,
  },
  {
    id: "reparto",
    tema: "gustos",
    label: "¿Cuánto de cada cosa?",
    corto: "Reparto",
    arte: "/categories/cut/variedad.png",
    color: "#3f9656",
    control: "reparto",
    fuente: "libreta",
    campo: "reparto",
    // Requiere las comidas porque sin saber cuántos huecos hay, un reparto no
    // se puede bajar a máximos por semana.
    requiere: ["comidas"],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: true,
    enControles: true,
    orden: 40,
  },
  {
    id: "cocina",
    tema: "gustos",
    label: "¿Añadimos algo de fuera?",
    corto: "Cocina",
    arte: "/categories/cut/controles/cocina.png",
    color: "#8a6cc4",
    control: "cocina",
    fuente: "libreta",
    campo: "cocina",
    requiere: [],
    activa: null,
    refina: "reparto",
    anula: [],
    delegable: true,
    parser: true,
    enControles: true,
    orden: 50,
  },
  {
    id: "estructura",
    tema: "gustos",
    label: "¿Uno o dos platos?",
    corto: "Platos",
    arte: "/categories/cut/controles/platos.png",
    color: "#c9820a",
    control: "cards-ab",
    fuente: "data",
    lee: (data) => data?.mealStructure ?? null,
    escribe: (data, valor) => ({ ...data, mealStructure: valor }),
    // Los dos valores que el planner entiende de VERDAD. Ojo con "1_plato":
    // parece un histórico y no lo es — es el valor que compara aiPlanner.js
    // (`mealStructure === "1_plato"`). Ofrecer "unico" aquí dejaba el control
    // pintándose bien y sin efecto ninguno sobre el menú. "unico" existe, pero
    // es el override de UN día concreto (`data.slotType`), no el de la casa.
    //
    // Mismas dos tarjetas y mismos textos que el wizard clásico
    // (MEAL_STRUCTURE_CARDS en Onboarding.jsx): es la misma pregunta, y verla
    // con otro dibujo en otro sitio se lee como otra cosa.
    opciones: [
      { valor: "primero_segundo", etiqueta: "Primero y segundo", detalle: "Dos platos" },
      { valor: "1_plato", etiqueta: "Plato combinado", detalle: "Un solo plato" },
    ],
    arteOpcionesLlenas: true,
    arteOpciones: {
      primero_segundo: "/avatares/cards/estructura_primero_segundo.png",
      "1_plato": "/avatares/cards/estructura_plato_combinado.png",
    },
    requiere: ["comidas"],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    enControles: true,
    orden: 60,
  },
  {
    id: "tecnica",
    tema: "gustos",
    label: "¿Cómo os gustan hechos?",
    corto: "Cómo",
    // FUERA de la fila de mandos (`enControles: false`), y no por sitio: es
    // que no hacía nada. `tecnica` se lee en UN solo punto de todo el código
    // —menuRecuento.js, y solo para contarlo en la frase de contexto del bot—;
    // ni el planner ni el filtro lo miran. Un mando que se pinta bien y no
    // cambia el menú es peor que no tenerlo.
    //
    // La fila sigue viva y el bot la sigue escribiendo, porque el dato es el
    // mejor del catálogo: 710 de las 711 estrella etiquetadas, cinco técnicas,
    // 9-10 proteínas distintas en cada una. Cuando tenga consumidor de verdad
    // —o se reformule como eje de ligereza, que es como se piensa: "menos
    // fritos", "más al horno"— vuelve.
    arte: "/categories/cut/tecnica/sarten.png",
    color: "#c0392b",
    // Las cinco técnicas, cada una con su recorte. Mismo set que ya usa el
    // mapa ARTE de panelParser.js para pintar un ajuste.
    arteOpciones: {
      horno: "/categories/cut/tecnica/horno.png",
      plancha: "/categories/cut/tecnica/plancha.png",
      sarten: "/categories/cut/tecnica/sarten.png",
      olla: "/categories/cut/tecnica/olla.png",
      crudo: "/categories/cut/tecnica/crudo.png",
    },
    control: "chips",
    fuente: "libreta",
    campo: "tecnica",
    requiere: [],
    activa: null,
    refina: "reparto",
    anula: [],
    delegable: true,
    parser: true,
    enControles: false,
    orden: 70,
  },

  // ── Tiempo y maña ───────────────────────────────────────────────────────
  {
    id: "tiempo",
    tema: "tiempo",
    label: "¿Cuánto tiempo tienes para cocinar?",
    corto: "Tiempo",
    arte: "/categories/cut/controles/tiempo.png",
    color: "#5a5fc8",
    // No es un slider de minutos: `data.cookTime` no es un número sino
    // `{ mode, weekday: {Comida, Cena}, weekend: {Comida, Cena} }`. Y aunque
    // lo fuera, la app ya decidió que la gente no marca un número exacto —el
    // tiempo es variable— y ofrece cuatro ritmos (lib/cookTime.js), que es el
    // lenguaje que el usuario ya conoce de la pantalla de siempre.
    control: "cards-ab",
    fuente: "data",
    lee: (data) =>
      data?.cookTime ? cookLevelForMinutes(data.cookTime?.weekday?.Comida) : null,
    escribe: (data, id) => {
      const minutos = cookLevelMinutes(id);
      const base = data?.cookTime ?? COOK_TIME_DEFAULTS;
      // Se escriben las cuatro casillas: este control es el mando grueso. El
      // editor fino de entre semana / finde sigue en su pantalla y no se pisa
      // más de lo que el usuario acaba de pedir aquí.
      return {
        ...data,
        cookTime: {
          ...base,
          weekday: Object.fromEntries(Object.keys(base.weekday ?? {}).map((m) => [m, minutos])),
          weekend: Object.fromEntries(Object.keys(base.weekend ?? {}).map((m) => [m, minutos])),
        },
      };
    },
    opciones: COOK_LEVELS.map((l) => ({ valor: l.id, etiqueta: l.label, detalle: l.sub })),
    arteOpcionesLlenas: true,
    // Una por nivel, las cuatro que ya existen para esta misma pregunta.
    arteOpciones: {
      con_prisa: "/avatares/cards/cook_con_prisa.png",
      normal: "/avatares/cards/cook_normal.png",
      con_tiempo: "/avatares/cards/cook_con_tiempo.png",
      depende: "/avatares/cards/cook_depende.png",
    },
    requiere: ["comidas"],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    enControles: true,
    orden: 80,
  },
  {
    id: "esfuerzo",
    tema: "tiempo",
    label: "¿Qué tal se te da cocinar?",
    corto: "Esfuerzo",
    color: "#cf7833",
    // Apunta a `data.cookLevel` y NO al eje `esfuerzo` de la libreta, aunque
    // ese exista y el panel sepa escribirlo. El motivo es que `cookLevel` lo
    // consume filterRecipes de verdad (filtra por dificultad), mientras que
    // `esfuerzo` cae en `sesgos`, que hoy no lo lee nadie — un control que se
    // pinta bien y no cambia el menú es peor que no tenerlo.
    //
    // El eje `esfuerzo` sigue vivo para el bot ("algo más rápido"): el día que
    // `sesgos` tenga consumidor, los dos tendrán que reconciliarse.
    control: "cards-ab",
    fuente: "data",
    lee: (data) => data?.cookLevel ?? null,
    escribe: (data, valor) => ({ ...data, cookLevel: valor }),
    // Mismos tres niveles, mismas tarjetas y mismos textos que el wizard
    // clásico (Onboarding.jsx): es la misma pregunta.
    opciones: [
      { valor: "basic", etiqueta: "Básico", detalle: "Lo justo y sin liarme" },
      { valor: "normal", etiqueta: "Normal", detalle: "Me defiendo" },
      { valor: "pro", etiqueta: "Me gusta cocinar", detalle: "Dame algo con gracia" },
    ],
    arteOpcionesLlenas: true,
    // En COLUMNA y en 16:9, igual que el wizard clásico, porque este arte es
    // el apaisado (`_h`) y existe justo por eso: los cuadrados originales
    // recortados por arriba y por abajo dejaban al personaje descabezado. En
    // la rejilla de dos columnas volvía a pasar lo mismo, esta vez recortando
    // a 1:1 los tres platos que están en el borde inferior.
    arteApaisado: true,
    arteOpciones: {
      basic: "/avatares/cards/cook_nivel_basico_h.webp",
      normal: "/avatares/cards/cook_nivel_normal_h.webp",
      pro: "/avatares/cards/cook_nivel_pro_h.webp",
    },
    arte: "/categories/cut/controles/esfuerzo.png",
    requiere: [],
    activa: null,
    refina: "tiempo",
    anula: [],
    delegable: true,
    parser: false,
    enControles: true,
    orden: 90,
  },

  // ── Cocina y compra ─────────────────────────────────────────────────────
  {
    id: "trastos",
    tema: "cocina",
    label: "¿Qué tenéis en la cocina?",
    corto: "Trastos",
    // El recorte del horno, sacado de su card con cutout-illustrations.mjs.
    // La card entera valía —y llenaba la baldosa— pero era la ÚNICA a sangre
    // de los siete mandos: una baldosa con fondo entre seis con el dibujo
    // flotando sobre blanco se lee como que significa algo distinto, y no
    // significa nada. La fila es de un solo tipo de imagen o de ninguno.
    arte: "/categories/cut/controles/trastos.png",
    color: "#2f6f9f",
    // Las seis tarjetas de electrodomésticos que ya usa el onboarding. Van por
    // ETIQUETA porque el dominio de `appliances` son los nombres tal cual
    // ("Olla rápida"), que es lo que filterRecipes cruza. Y a sangre: son
    // CARDS con su propio fondo, no recortes con transparencia — encogidas
    // dentro de una baldosa blanca se veían como una foto pequeña y suelta.
    arteOpcionesLlenas: true,
    arteOpciones: {
      "Airfryer": "/avatares/cards/electrodomesticos/airfryer.webp",
      "Horno": "/avatares/cards/electrodomesticos/horno.webp",
      "Microondas": "/avatares/cards/electrodomesticos/microondas.webp",
      "Thermomix": "/avatares/cards/electrodomesticos/thermomix.webp",
      "Olla rápida": "/avatares/cards/electrodomesticos/olla_rapida.webp",
      "Vaporera": "/avatares/cards/electrodomesticos/vaporera.webp",
    },
    control: "multi",
    fuente: "data",
    lee: (data) => (data?.appliances?.length ? data.appliances : null),
    escribe: (data, valor) => ({ ...data, appliances: valor }),
    // El vocabulario de KITCHEN_TOOLS de Menu.jsx, que es lo que filterRecipes
    // cruza contra `requiredAppliance`. Inventar uno nuevo aquí lo dejaría sin
    // consumidor.
    opciones: ["Airfryer", "Horno", "Microondas", "Thermomix", "Olla rápida", "Vaporera"],
    requiere: [],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    enControles: true,
    orden: 100,
  },
  {
    id: "presupuesto",
    tema: "compra",
    label: "¿Cuánto quieres gastar?",
    control: "slider",
    fuente: "data",
    lee: (data) => data?.budget ?? null,
    requiere: [],
    activa: null,
    refina: null,
    anula: [],
    delegable: true,
    parser: false,
    orden: 110,
  },
  {
    id: "despensa",
    tema: "compra",
    label: "¿Aprovechamos lo que ya hay en casa?",
    control: "cards-ab",
    fuente: "data",
    lee: (data) => data?.pantryMode ?? null,
    requiere: [],
    activa: null,
    refina: "presupuesto",
    anula: [],
    delegable: true,
    parser: false,
    orden: 120,
  },
];

export const PREGUNTAS_POR_ID = Object.fromEntries(PREGUNTAS.map((p) => [p.id, p]));

/** El registro ordenado. El `orden` deja hueco entre filas a propósito. */
export function registroOrdenado(registro = PREGUNTAS) {
  return [...registro].sort((a, b) => a.orden - b.orden);
}

/**
 * El estado de un campo de la libreta para una pregunta, o el que deduce de
 * `data` cuando la pregunta no vive en la libreta.
 *
 * Las preguntas de `data` no tienen los cuatro estados —`data` no guarda
 * procedencia— así que solo distinguen contestado de vacío. Es una pérdida
 * real y conocida: hasta que esos ejes migren a la libreta, una alergia
 * inferida del texto no se puede marcar como "sin confirmar" en `data`, y por
 * eso el parser no escribe ahí (ver `parser: false` en esas filas).
 */
export function estadoDelCampo(pregunta, notepad, data) {
  if (!pregunta) return "vacio";
  if (pregunta.fuente === "libreta") return estadoAgregado(pregunta, notepad);
  const valor = pregunta.lee?.(data, notepad);
  return valor === null || valor === undefined ? "vacio" : "fijado";
}

/**
 * Las claves de la libreta que pertenecen a una pregunta.
 *
 * En la libreta un eje NO se guarda entero: se guarda VALOR a valor
 * (`cocina.italiana`, `freqs.pescado`, `reparto.carne`), porque un ajuste del
 * panel toca un valor concreto y su procedencia es la de ese valor, no la del
 * eje. Así que "¿está contestada la pregunta de cocina?" no es leer una clave
 * `cocina`, que no existe nunca: es mirar si hay alguna que empiece por
 * `cocina.`.
 *
 * Se compara con el punto incluido a propósito: sin él, un eje futuro llamado
 * `cocinaRapida` contaría como respuesta de `cocina`.
 */
export function clavesDePregunta(pregunta, notepad) {
  const prefijo = `${pregunta?.campo}.`;
  return Object.keys(notepad?.campos ?? {}).filter((k) => k.startsWith(prefijo));
}

/**
 * El estado del EJE, agregando el de sus valores. Un eje con seis familias no
 * tiene un estado: tiene seis, y la tarjeta enseña uno.
 *
 * Manda el más fuerte de lo que haya: basta con que un valor esté fijado para
 * que el eje cuente como contestado, porque el usuario ya tomó una decisión
 * ahí. `delegado` solo gana si TODOS lo están — un "lo que tú veas" suelto
 * entre cinco valores dichos no convierte el eje entero en delegado.
 */
function estadoAgregado(pregunta, notepad) {
  const claves = clavesDePregunta(pregunta, notepad);
  if (claves.length === 0) return "vacio";
  const estados = claves.map((k) => estadoDe(notepad, k));
  if (estados.every((e) => e === "delegado")) return "delegado";
  if (estados.includes("fijado")) return "fijado";
  return "inferido";
}

/**
 * La ruta de la libreta para un valor concreto de una pregunta. Sin `valor`
 * devuelve el prefijo del eje, que NO es una clave que exista: sirve para
 * buscar, no para leer.
 */
export function rutaDePregunta(pregunta, valor = null) {
  if (pregunta?.campo === "reparto" && valor) return rutaDeReparto(valor);
  return valor ? `${pregunta.campo}.${valor}` : `${pregunta?.campo}.`;
}

/**
 * Qué tiene puesta una pregunta ahora mismo. Es lo que la tarjeta enseña como
 * afirmación ("alergias: ninguna") en vez de como hueco: un campo vacío se
 * salta sin pensar, una frase se puede desmentir.
 *
 * Para los ejes de la libreta devuelve un mapa valor → contenido, porque eso
 * es lo que son: `{ italiana: true, asiatica: true }`, no un escalar.
 */
export function valorDePregunta(pregunta, notepad, data) {
  if (!pregunta) return null;
  if (pregunta.fuente !== "libreta") return pregunta.lee?.(data, notepad) ?? null;

  const claves = clavesDePregunta(pregunta, notepad);
  if (claves.length === 0) return null;
  const salida = {};
  for (const clave of claves) {
    // La clave puede llevar ámbito o servicio detrás (`freqs.carne.@ninos`);
    // el valor del eje es el segundo segmento.
    const valorId = clave.split(".")[1];
    salida[valorId] = valorDe(notepad, clave, null);
  }
  return salida;
}

/**
 * ¿Están satisfechas las dependencias de esta pregunta?
 *
 * `requiere` mira que las otras estén CONTESTADAS (delegado cuenta: "lo que tú
 * veas" es una respuesta, no un hueco). `activa` es una condición sobre los
 * datos, no sobre otra pregunta. `refina` NO bloquea: una pregunta fina puede
 * contestarse antes que la gruesa, solo se ordena detrás.
 */
export function dependenciasCumplidas(pregunta, notepad, data, registro = PREGUNTAS) {
  if (!pregunta) return false;

  for (const id of pregunta.requiere ?? []) {
    const otra = registro.find((p) => p.id === id);
    if (!otra) continue;
    if (estadoDelCampo(otra, notepad, data) === "vacio") return false;
  }

  if (typeof pregunta.activa === "function" && !pregunta.activa(data, notepad)) return false;

  return true;
}

/**
 * ¿La ha matado otra? Contestar "concentro el esfuerzo el domingo" deja sin
 * sentido "¿cuánto tiempo tienes entre semana?", y preguntarlo igual sería
 * pedirle al usuario que se contradiga.
 */
export function anulada(pregunta, notepad, data, registro = PREGUNTAS) {
  return registro.some(
    (otra) =>
      otra.id !== pregunta?.id &&
      (otra.anula ?? []).includes(pregunta?.id) &&
      estadoDelCampo(otra, notepad, data) !== "vacio",
  );
}

/**
 * El estado de cara al usuario: el agregado de los cuatro de la libreta.
 *
 * `dudas` son los ids que el parser marcó como ambiguos o en choque al leer el
 * texto libre. Van a "aclaracion" aunque tengan valor, porque contar más no
 * solo rellena: también genera ocasiones de contradecirse.
 */
export function estadoDePregunta(pregunta, notepad, data, dudas = []) {
  if (!pregunta) return "por-tocar";
  const estado = estadoDelCampo(pregunta, notepad, data);

  if (estado === "vacio") return "por-tocar";
  if (dudas.includes(pregunta.id)) return "aclaracion";
  if (estado === "fijado" || estado === "delegado") return "aclarado";

  // Inferido: aclarado CON la suposición a la vista, salvo donde suponer sería
  // ponerle al usuario un criterio en la boca (hoy, solo las alergias).
  return pregunta.suposicion === false ? "aclaracion" : "aclarado";
}

/** Las preguntas que hoy tienen sentido, en orden. Ni anuladas ni inactivas. */
export function preguntasVisibles(notepad, data, registro = PREGUNTAS) {
  return registroOrdenado(registro).filter(
    (p) => dependenciasCumplidas(p, notepad, data, registro) && !anulada(p, notepad, data, registro),
  );
}

/**
 * La siguiente que hay que hacerse, o null si no queda ninguna.
 *
 * Primero lo que necesita aclaración —es lo único que puede permitirse gritar—
 * y después lo que está por tocar, en el orden del registro.
 */
export function siguientePregunta(notepad, data, { registro = PREGUNTAS, dudas = [] } = {}) {
  const visibles = preguntasVisibles(notepad, data, registro);
  return (
    visibles.find((p) => estadoDePregunta(p, notepad, data, dudas) === "aclaracion") ??
    visibles.find((p) => estadoDePregunta(p, notepad, data, dudas) === "por-tocar") ??
    null
  );
}

/**
 * Cuántas quedan. La barra de progreso no dice "paso 3 de 15" —que es una
 * amenaza y además miente, porque el total cambia— sino "quedan 4 cosas",
 * bajando. Un wizard que se acorta mientras hablas se siente lo contrario de
 * pesado, aunque tenga un paso más que el de hoy.
 */
export function cuantasQuedan(notepad, data, { registro = PREGUNTAS, dudas = [] } = {}) {
  return preguntasVisibles(notepad, data, registro).filter(
    (p) => estadoDePregunta(p, notepad, data, dudas) !== "aclarado",
  ).length;
}

/**
 * La cobertura de una tarjeta: "Gustos, 1 de 6". Marcarla resuelta mentiría y
 * dejarla intacta tiraría el dato — y es justo lo que deja decidir si merece
 * la pena abrirla.
 */
export function coberturaDeTema(temaId, notepad, data, { registro = PREGUNTAS, dudas = [] } = {}) {
  const suyas = preguntasVisibles(notepad, data, registro).filter((p) => p.tema === temaId);
  const hechas = suyas.filter((p) => estadoDePregunta(p, notepad, data, dudas) === "aclarado");
  return {
    tema: temaId,
    de: suyas.length,
    hechas: hechas.length,
    // Una tarjeta con una aclaración pendiente no es "casi hecha": es la única
    // que tiene que levantar la voz, y su recuento lo diría al revés.
    aclaraciones: suyas.filter((p) => estadoDePregunta(p, notepad, data, dudas) === "aclaracion").length,
  };
}

/**
 * Las filas que salen a la fila de botones sobre el menú, en orden.
 *
 * Se filtra por dependencias igual que el resto: un control cuyo `requiere` no
 * está resuelto no se pinta, en vez de abrir una hoja que no puede hacer nada.
 * Añadir un mando al menú es, por tanto, poner `enControles: true` en una fila
 * — no escribir un componente.
 */
export function controlesVisibles(notepad, data, registro = PREGUNTAS) {
  return preguntasVisibles(notepad, data, registro).filter((p) => p.enControles);
}

/** Las tarjetas que tienen sentido para esta casa, con su cobertura. */
export function temasVisibles(notepad, data, opciones = {}) {
  const registro = opciones.registro ?? PREGUNTAS;
  const conPreguntas = new Set(preguntasVisibles(notepad, data, registro).map((p) => p.tema));
  return TEMAS.filter((t) => conPreguntas.has(t.id)).map((t) => ({
    ...t,
    ...coberturaDeTema(t.id, notepad, data, opciones),
  }));
}
