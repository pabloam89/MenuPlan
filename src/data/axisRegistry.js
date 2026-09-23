/**
 * EL REGISTRO DE EJES — lo que hace viable declarar cuarenta y cinco sin que
 * cuarenta y cinco se pudran.
 *
 * Un eje es una pregunta que alguien puede hacerle al catálogo. La lista sale
 * del documento de normalización (§6, «El vocabulario: los 45 ejes») y los
 * números se conservan: el eje 23 es `tecnica` aquí y en el documento, para
 * que una discusión sobre el 23 se pueda seguir en los dos sitios.
 *
 * ── Por qué existe este fichero ────────────────────────────────────────────
 *
 * Porque `mainBase` ya enseñó cómo se pudre un eje: tiene esquema, columna y
 * sincronización, 14 valores donde debería haber 8, y NINGUNA regla lo lee.
 * Nadie lo notó porque un campo sin lector no falla — deja de decidir, que es
 * peor, porque no avisa. El documento lo dice sin rodeos:
 *
 *     «Cuarenta y cinco ejes sin disciplina son cuarenta y cinco `mainBase`.»
 *
 * Y también dice que este fichero va ANTES que los ejes que declara: «Si no se
 * construye primero, B3 y B9 no deberían empezar».
 *
 * ── Un eje con cobertura 0 NO es un error ──────────────────────────────────
 *
 * Es la excepción disciplinada, y es el motivo de la columna `estado`. Habrá
 * ejes declarados con cero recetas —`festividad`, `cocina:es-ct`— y eso es
 * correcto, porque el valor no está en tener la receta:
 *
 *     «está en SABER que no la tienes».
 *
 * Un eje `silencioso` permite contestar «todavía no tengo nada catalán, ¿te
 * propongo algo mediterráneo a la brasa?» en vez de improvisar una calçotada.
 * Lo que no se tolera es el silencio SIN declarar, que es lo que le pasó a
 * `mainBase`.
 *
 * ── Cómo se lee cada columna ───────────────────────────────────────────────
 *
 *   n             el número del eje en el documento. No se reordena.
 *   tipo          enum · jerarquico · tags · numerico · booleano · derivado
 *   estado        CUATRO, y la primera versión de este fichero tenía dos.
 *
 *                 activo      tiene datos Y tiene quien los lea
 *                 silencioso  declarado a propósito, sin datos y sin lector.
 *                             NO es un fallo: es lo que permite decir «todavía
 *                             no tengo nada catalán» en vez de improvisar.
 *                 sin_lector  tiene datos y NADIE los lee. Es `mainBase`, y es
 *                             `mainIngredients`: 665 recetas, enum, columna en
 *                             Supabase y cero consumidores.
 *                 sin_datos   tiene lector y CERO datos. Es `scalesWithEaters`:
 *                             `effectiveRecipeTime` lo consulta en las 1.033 y
 *                             siempre le sale `undefined`.
 *
 *                 Los dos últimos son el mismo fallo visto desde cada lado, y
 *                 con dos estados no se distinguían: los dos caían en
 *                 «silencioso», que es el estado SANO. Un fallo disfrazado de
 *                 excepción disciplinada es exactamente lo que este fichero
 *                 viene a impedir.
 *   campo         dónde vive hoy, o null si todavía no vive en ninguna parte
 *   vocabulario   null cuando el documento no lo fija. NO se inventa aquí:
 *                 un vocabulario a ojo es la forma rápida de tener 14 valores
 *                 donde debían ser 8.
 *   consumidores  quién lo lee HOY. Un array vacío con estado `activo` es una
 *                 contradicción y el test la caza.
 *   cobertura     medida sobre las 1.033 recetas (o los 396 alimentos, cuando
 *                 el eje es del alimento) el 22 sep 2026.
 *
 * Medido, no estimado: los números de `cobertura` salen de contar el campo en
 * el catálogo, y el test los vuelve a contar para que no se queden viejos.
 */

/** @typedef {"enum"|"jerarquico"|"tags"|"numerico"|"booleano"|"derivado"} TipoEje */
/** @typedef {"activo"|"silencioso"|"sin_lector"|"sin_datos"} EstadoEje */

export const AMBITO = {
  RECETA: "receta",
  /**
   * Una PARTE del plato, no el plato entero.
   *
   * Existe por el mismo motivo que el eje 45: «Lomo a la plancha con ensalada»
   * tiene un principal seco y una guarnición que es ensalada, y obligarle a
   * elegir uno de los dos formatos es tirar información. Un eje de ámbito
   * PARTE solo se puede rellenar donde `stepsRich[].part` existe — hoy el
   * 17,4 % — y eso es una limitación honrada, no un defecto del eje.
   */
  PARTE: "parte",
  ALIMENTO: "alimento",
  HOGAR: "hogar",
};

/**
 * Los 45. Ordenados por número de documento, agrupados como allí.
 *
 * `cobertura` es la fracción del ámbito que tiene el eje relleno. Para los que
 * no existen todavía es 0, y eso NO los hace inválidos: los hace silenciosos.
 */
export const EJES = [
  // ── Composición y nutrición (1-5, 45) ────────────────────────────────────
  {
    n: 1, id: "composicion", nombre: "Composición jerárquica ponderada, por parte",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 1.0,
    nota: "Estaba repartida en cuatro campos sin pesos. Hoy la calcula derive/composicion.js: 98,6 % de acuerdo con la curación en proteína, 99,5 % en hidrato.",
  },
  {
    n: 2, id: "subtipoIngrediente", nombre: "Subtipo de ingrediente (garbanzo vs lenteja, bivalvo vs crustáceo)",
    ambito: AMBITO.ALIMENTO, tipo: "jerarquico", estado: "activo",
    campo: "alimentos.taxonomia", vocabulario: null,
    consumidores: ["masaServida"], cobertura: 0.924,
    nota: "El documento lo daba por FALTA y se construyó. Pero NO está «al 100 %», que es lo que decía aquí antes: reino, clase y subclase sí (396/396), la especie está en 366 y la VARIEDAD en CERO de las 396. La cobertura que cuenta es la de la especie, porque es el peldaño que hace comparables el eje del ingrediente y el de la receta. Su granularidad (pollo/pavo/pato, patata/boniato, arroz/quinoa/cuscús) quitó 21 discrepancias con la curación.",
  },
  {
    n: 3, id: "densidadNutricional", nombre: "Densidad nutricional (kcal/100 g, g proteína/100 kcal, fibra, saciedad)",
    ambito: AMBITO.RECETA, tipo: "numerico", estado: "sin_lector",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 1,
    nota: "DERIVADO, no curado: `densidadDe` en src/lib/derive/ejesDePlato.js da kcal/100 g del plato servido y gramos de proteína por 100 kcal, de las macros de receta (al 100 %) sobre la masa del vector. Cobertura 100 % del catálogo, mediana 113 kcal/100 g con p05 50 y p95 212. El segundo número es el que de verdad separa: un plato puede ser denso en calorías y pobre en proteína, que es justo lo que alguien quiere saber al pedir «algo que llene».",
  },
  {
    n: 4, id: "micronutrientes", nombre: "Micronutrientes (hierro, calcio, B12, omega-3, folato)",
    ambito: AMBITO.ALIMENTO, tipo: "numerico", estado: "activo",
    campo: "alimentos.nutricion", vocabulario: null,
    consumidores: ["ingredients", "recipeCatalog", "healthFlags", "aiPlanner", "userRecipes"], cobertura: 0.896,
    nota: "El documento decía «BEDCA los tiene; el pipeline no los trae». Ya los trae: 24 micros por alimento. Pero la cobertura NO es la del calcio (94,9 %), que es de los mejores: es la del PEOR de los que el nombre del eje promete, y ese es la B12 con 89,6 %. Y hay uno que no se puede contestar en absoluto: el OMEGA-3 no tiene campo — omega3100g no existe en ninguna de las 396 filas, así que «dame algo con omega-3» no tiene respuesta por mucho que el eje diga 90 %. Falta además la TABLA DE RETENCIÓN POR TÉCNICA: un hervido pierde folato y el crudo no.",
  },
  {
    n: 5, id: "nova", nombre: "Grado de procesado (NOVA 1-4)",
    ambito: AMBITO.ALIMENTO, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 0,
    nota: "Sale gratis del atributo `transformacion` de la variante, que hoy vive en alimentos.dimensiones.procesado (16 % donde aplica).",
  },
  {
    n: 45, id: "parte", nombre: "Parte del plato",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "activo",
    campo: "stepsRich[].part", vocabulario: ["principal", "guarnicion", "salsa", "combinado"],
    consumidores: ["recipeSteps", "solver", "RecipeSteps", "stepParts", "userRecipes"], cobertura: 0.240,
    nota: "El eje que salió de un vector que daba la respuesta equivocada: en la «Merluza rebozada con patatas fritas», el vector plano decía patata 0,41 > pescado 0,33 porque metía en la misma bolsa el principal y la guarnición. Por parte, el principal es 79 % pescado y la guarnición 93 % patata, y nunca compitieron. Es TAMBIÉN lo que resuelve las 99 patatas sin tope: la patata gasta presupuesto de guarnición, no convierte el plato en un plato de patatas. La cobertura es la CURADA, y el 24 % NO es el 24 % de lo posible: es casi el techo. El modelo ha juzgado ya 818 recetas con el criterio aparte/dentro y ha dicho MONOCOMPONENTE en 570 de ellas. O sea que la mayoría de los platos de este catálogo no tienen partes que separar, y eso es una respuesta, no un hueco: lo que queda sin juzgar son las 189 excluidas por construcción —salsas, guarniciones, bases, bebés, postres, desayunos y meriendas—, que son el componente y no pueden separarse de sí mismas. El operador `deriveStepParts` podría cubrir el 96 % pero concuerda al 54,5 % con lo curado —y `salsa` solo al 44 %—, así que se mide y no se escribe.",
  },

  // ── Percepción del plato (6-13) ──────────────────────────────────────────
  {
    n: 6, id: "formato", nombre: "Formato",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "sin_lector",
    campo: "formato",
    vocabulario: ["ensalada", "sopa", "cremoso", "guiso", "plato_seco"],
    consumidores: [], cobertura: 0.725,
    nota: "Disfrazado en `category`. Es ORTOGONAL a todo lo demás: hay ensaladas de pasta y ensaladas de legumbre. Entre nueve legumbres conviven «Lentejas con verduras» (guiso caliente) y «Ensalada de garbanzos con chorizo» (fría) con la MISMA firma en todos los ejes existentes: les separan formato y temperatura. — VOCABULARIO REHECHO antes de poblarlo, y ese orden importa: el primero (ensalada · guiso · sopa · plato_seco · montaje · masa · bol) se probó contra 31 recetas reales y dio 52 % de encaje único, con 4 sin ningún valor posible y 11 con dos. Cometía el pecado de `category` — mezclaba hidratación (guiso/sopa/seco) con estructura (masa/montaje) y con recipiente (bol) —, así que `masa` y `montaje` salen a ejes propios (46 y 47: la empanada es masa sin montaje, el pan tumaca montaje sin masa, la lasaña las dos), `bol` se cae por ser dónde se sirve y no cómo se hace, y entra `cremoso`, que faltaba para las 65 recetas que empiezan por «Puré» o «Crema». `salsa` no entra: la tiene ya el eje 45. Y el ámbito pasa a PARTE, que es lo que resuelve «Lomo a la plancha CON ENSALADA» — principal seco, guarnición ensalada — y era el mismo error que el eje 45 existe para arreglar, cometido aquí. — POBLADO el 22 sep por derive/formato.js: 749 de 1.033, y se ABSTIENE en 284. La abstención no es pereza: 172 de esas son recetas de olla sin señal en el nombre, y en olla conviven «Brócoli al vapor» y «Ternera guisada» sin nada que las separe. El valor escrito es el de la receta ENTERA, que es el de su parte principal; cuando el eje 45 suba del 17 % pasará a calcularse por parte de verdad. — ÁMBITO CORREGIDO A RECETA el 22 sep, y es una rectificación: se declaró PARTE porque es lo que el eje DEBERÍA ser, pero `formato` no existe en ninguno de los 12.105 pasos de `stepsRich` —solo hay text, kind, minutes, part, base y during—, así que era exactamente el error que el eje 46 explica haber evitado, cometido aquí por querer adelantar el futuro. El ámbito describe dónde vive el dato, no dónde nos gustaría que viviera. Vuelve a PARTE el día que haya un `stepsRich[].formato` de verdad.",
  },
  {
    n: 7, id: "temperatura", nombre: "Temperatura de servicio",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "sin_lector",
    campo: "temperatura", vocabulario: ["caliente", "templado", "frio"],
    consumidores: [], cobertura: 0.887,
    nota: "Poblado el 22 sep 2026 por derive/formato.js: 916 de 1.033. La técnica lo da casi entero —lo que se cocina se sirve caliente— y el nombre manda sobre ella, porque un escabeche se cocina y se come frío. Se abstiene en las 117 sin técnica. Queda SIN_LECTOR a propósito: el dato está y todavía no lo lee nadie, y el registro lo dice en vez de dejar que se pudra en silencio. Su primer lector natural es filterRecipes, para poder pedir «algo frío».",
  },
  {
    n: 8, id: "textura", nombre: "Textura",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 0,
    nota: "Solo implícita en `etapaBebe`, que la esconde dentro de una categoría.",
  },
  {
    n: 9, id: "sabor", nombre: "Perfil de sabor + intensidad",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "activo",
    campo: "healthFlags", vocabulario: null,
    consumidores: ["validateMenu", "filterRecipes", "aiPlanner", "healthProfileMatch"], cobertura: 0.006,
    nota: "OJO A LA COBERTURA, que son DOS y esta columna solo sabe decir una: en el JSON hay 6 recetas de 1.033 con `healthFlags`, pero `recipeCatalog` lo deriva al cargar con `deriveHealthFlags`, así que lo que los cuatro lectores ven está al 100 %. El 0,6 % es la parte CURADA; el resto se calcula. Y el campo mezcla sabor con salud (frito, embutido, picante): no es este eje, es tres.",
  },
  {
    n: 10, id: "carga", nombre: "Carga / saciedad",
    ambito: AMBITO.RECETA, tipo: "numerico", estado: "sin_lector",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 0.881,
    nota: "Seis reglas del prompt la invocan. Es una de las tres que la función objetivo del solver necesita, junto con completitud y densidad. DERIVADA por `cargaDe` (src/lib/derive/ejesDePlato.js) de `protein_g` y `fiber_g` por ración, que están en 910 de 1.033: lo que sacia no son las calorías sino la proteína, la fibra y el volumen — 600 kcal de pasta con nata dejan con hambre a las dos horas y 400 de legumbre con verdura no. NO devuelve un índice de saciedad a propósito: hay media docena publicadas y ninguna es consenso, así que da los gramos y los dos ratios por 100 kcal y quien pregunte decide. Mediana 5,08 g de proteína por 100 kcal.",
  },
  {
    n: 11, id: "completitud", nombre: "Completitud (¿es comida entera?)",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 1,
    nota: "DERIVADO por `completitudDe` (src/lib/derive/ejesDePlato.js): un plato es entero cuando trae proteína, hidrato Y verdura, leídos del vector de composición. La verdura se mide por masa y no por presencia —40 g por ración—, porque dos hojas de perejil no completan nada. Cobertura 100 %, y DISCRIMINA: 261 de 947 son completos, así que el eje sirve para elegir cena. Nace de un caso en vivo: el solver dio por bueno un menú con «Brócoli al vapor en árbol» de segundo, cumpliendo TODAS las restricciones — las restricciones descartan, pero lo que hace bueno un menú es la función objetivo.",
  },
  {
    n: 12, id: "fotogenia", nombre: "Aspecto y fotogenia",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "apetecible", vocabulario: null,
    consumidores: ["CatalogBrowserSheet", "aiPlanner", "pairGarnishes"], cobertura: 0.124,
    nota: "Parcial. `apetecible` existe en 128 recetas y no lo lee nadie.",
  },
  {
    n: 13, id: "connotacion", nombre: "Connotación emocional",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "silencioso",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 0,
    nota: "Responde a «algo reconfortante», que es una petición real y hoy no se puede honrar.",
  },

  // ── Cultura y rito (14-22) ───────────────────────────────────────────────
  {
    n: 14, id: "cocina", nombre: "Cocina jerárquica con región",
    ambito: AMBITO.RECETA, tipo: "jerarquico", estado: "activo",
    campo: "cocina", vocabulario: null,
    consumidores: ["filterRecipes", "solver", "cuotaCocinas", "cocinaTopes", "menuRecuento"], cobertura: 0.2,
    nota: "Insuficiente: ocho países planos, y España es la AUSENCIA del campo. El árbol del documento baja a andaluza (12), vasca (7), valenciana (3), catalana (2, ninguna calçotada).",
  },
  {
    n: 15, id: "autenticidad", nombre: "Autenticidad (tradicional, adaptado, fusión)",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 16, id: "epoca", nombre: "Época",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 17, id: "festividad", nombre: "Festividad",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "Un plato pertenece a 0..n festividades, así que es `tags` y no `enum`. Es el ejemplo canónico del eje silencioso sano del documento.",
  },
  {
    n: 18, id: "estacionalidadIngrediente", nombre: "Estacionalidad real del ingrediente",
    ambito: AMBITO.ALIMENTO, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "`season` existe pero es de la RECETA y tiene tres valores. La estacionalidad es del ingrediente, y de ahí sube.",
  },
  {
    n: 19, id: "restriccionReligiosa", nombre: "Halal / kosher / sin cerdo / sin alcohol",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "sin_lector",
    campo: null, vocabulario: ["sin_cerdo"], consumidores: [], cobertura: 1,
    nota: "SOLO `sin_cerdo`, y el recorte es la parte importante. `sinCerdoDe` (src/lib/derive/ejesDePlato.js) lo deriva de la taxonomía al 100 %, contando el embutido como cerdo —el chorizo cuelga de `subclase: embutido` con `especie: chorizo`, así que buscar la especie «cerdo» daba sin_cerdo a un plato con chorizo, el falso negativo más caro posible aquí— salvo pastrami, cecina y pavo. HALAL Y KOSHER NO SE DERIVAN NI SE DERIVARÁN de esto: son cómo se sacrificó el animal y cómo se separó la vajilla, y eso no está en el repo ni puede estarlo; darlos por aptos porque no hay cerdo sería faltar al respeto a quien confía en la respuesta. El alcohol ya sale del plano B: `vino-generoso`, `brandy` y compañía declaran conflictsWith alcohol_cocina.",
  },
  {
    n: 20, id: "aptoVigilia", nombre: "Apto vigilia",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 1,
    nota: "DERIVADO por `aptoVigiliaDe` al 100 %, de `taxonomia.clase`, que está al 100 % en los 396 alimentos: no hay mamífero, ave ni víscera. La víscera cuenta porque unos callos son carne aunque el árbol los cuelgue aparte, y el pescado NO cuenta — ese matiz es lo que hace que esto sea un eje y no un sinónimo de vegetariano. 444 de 947 recetas son de vigilia.",
  },
  {
    n: 21, id: "aptoAyuno", nombre: "Apto ayuno",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 22, id: "vegetarianismoReligioso", nombre: "Vegetarianismos religiosos",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "`DIET_RULES` solo tiene dos valores.",
  },

  // ── Ejecución en la cocina (23-29, 42-44) ────────────────────────────────
  {
    n: 23, id: "tecnica", nombre: "Técnica",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "activo",
    campo: "tecnica", vocabulario: ["olla", "sarten", "horno", "plancha", "crudo"],
    consumidores: ["sesgos", "menuRecuento", "notepad", "panelParser"], cobertura: 0.883,
    nota: "Le FALTA `fritura`, está al 0 % en guarniciones y tiene valores falsos. 121 recetas sin técnica.",
  },
  {
    n: 24, id: "tiempoActivo", nombre: "Tiempo activo vs calendario",
    ambito: AMBITO.RECETA, tipo: "numerico", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0.971,
    nota: "DERIVADO por `tiempoActivoDe` de `stepsRich[].kind`: suma los pasos `prep`, `activo` y `emplatado`, y NO los `pasivo`, `espera`, `opcional` ni `paralelo` — un precalentado de horno es paralelo y no son manos de nadie. Mediana 20 minutos contra 30 de `time`, que es exactamente la distancia que el eje existe para enseñar: las cuatro horas de un guiso son cuatro horas en las que no estás en la cocina. OJO CON LO QUE MIDE: es SUMA DE TRABAJO, no minutos de pie. En 87 recetas supera el `time` declarado porque una receta solapa —mientras se fríe la berenjena se escurre la patata— y los dos pasos suman por separado. Sirve para comparar dos platos; para el reloj real harían falta las dependencias entre pasos, que el catálogo no tiene. Se abstiene cuando faltan minutos en más del 20 % de los pasos.",
  },
  {
    n: 25, id: "esfuerzoMental", nombre: "Esfuerzo mental / nº de componentes",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0.975,
    nota: "DERIVADO por `esfuerzoDe` de stepsRich: ingredientes que controlar, pasos, componentes y pasos `paralelo`. No es `difficulty` —que la cura una persona— ni el tiempo: es la carga de atención, y quince pasos con tres componentes que se cruzan cansan más que veinte en línea. Los `componentes` salen de `part`, así que valen null y NO 0 cuando la receta no lo tiene: que nadie lo mirara no significa que haya un solo componente, y esa es la distinción que el catálogo pagó cara contando 442 recetas juzgadas como sin mirar.",
  },
  {
    n: 26, id: "conflictoRecursos", nombre: "Conflicto de recursos (horno, fuegos)",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "sin_lector",
    campo: null, vocabulario: ["horno", "fuego", "ninguno"], consumidores: [], cobertura: 0.883,
    nota: "Un solver lo exige: dos platos al horno a la vez a temperaturas distintas no se pueden. DERIVADO por `recursoDe` de `tecnica` — 634 fuego, 173 horno, 105 ninguno—, y el conflicto se pregunta con `seEstorban(a, b)` porque NO es propiedad de una receta sino de un par. No sale de los marcadores `{{@Aparato}}` aunque parecieran el sitio natural: están en el 42,9 % de las recetas y 386 de 515 son «Sartén», así que un eje derivado de ellos habría contestado «fuego» a casi todo con cara de medido. Tampoco de `requiredAppliance` ni `methods`: el primero dice qué hace falta TENER y el segundo son alternativas que el usuario no ha elegido.",
  },
  {
    n: 27, id: "equipamiento", nombre: "Equipamiento requerido",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "activo",
    campo: "requiredAppliance", vocabulario: ["horno", "gofrera"],
    consumidores: ["filterRecipes"], cobertura: 0.155,
    nota: "SU VOCABULARIO TIENE QUE SER EL DEL ASISTENTE, y no lo era: eso hacía desaparecer 63 recetas. `filterRecipes` excluye la receta cuyo aparato no esté entre los `kitchenTools` declarados, y el asistente solo deja declarar seis (airfryer, horno, microondas, olla rápida, thermomix, vaporera). El catálogo exigía además `batidora` (60 recetas, 45 estrella: gazpacho, salmorejo, hummus, las cremas), `plancha` (2) y `gofrera` (1), que nadie puede declarar: esas recetas no salían nunca para ningún usuario, y no fallaban de forma ruidosa, simplemente no estaban. Resuelto quitando el campo a las 62 de batidora y plancha —una batidora de mano se presupone y «plancha» es una sartén, que ya vive en `tecnica`—, con lo que la cobertura baja del 21,5 % al 15,5 %: el campo dice ahora lo que decía significar. La gofrera se queda como única excepción escrita. Fusible en src/data/aparatos.test.js.",
  },
  {
    n: 28, id: "progresion", nombre: "Progresión / aprendizaje",
    ambito: AMBITO.RECETA, tipo: "numerico", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 29, id: "escalabilidadTanda", nombre: "Escalabilidad por tanda",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "scalesWithEaters", vocabulario: null, consumidores: ["filterRecipes", "recipeSchema"], cobertura: 0.883,
    nota: "ERA el caso de estudio del campo muerto —esquema, columna, sincronización y CERO recetas de 1.033—, y dejó de serlo sin curar ni una. `effectiveRecipeTime` lo consultaba en las 1.033 y siempre le salía `undefined`, así que el 12 % por comensal extra no se aplicaba jamás: un lector sin datos no falla, deja de decidir en silencio. La respuesta ya estaba en `tecnica`, porque «va por tandas» ES «el tiempo crece con los comensales»: `escalaPorTandas` (recipeSchema.js) usa el campo curado cuando existe y lo deriva del eje 42 cuando no. Cobertura 88,3 %. Queda como recordatorio de que un campo muerto no siempre necesita curación: a veces necesita que alguien mire si el dato ya estaba en otro sitio.",
  },
  {
    n: 42, id: "escalabilidadReal", nombre: "Escalabilidad real",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: ["escala", "por_tandas"], consumidores: [], cobertura: 0.883,
    nota: "Un guiso escala; doce filetes a la plancha, no. DERIVADO por `escalabilidadDe` de la técnica: olla, horno y crudo escalan (589 recetas) y sartén y plancha van POR TANDAS (323). La diferencia no está en los ingredientes sino en si el RECIPIENTE limita, y «por tandas» no es «no se puede»: es que el tiempo crece con los comensales en vez de quedarse igual, que es justo lo que hace falta saber antes de invitar a gente.",
  },
  {
    n: 43, id: "robustez", nombre: "Robustez ante el descuido",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: ["robusto", "atento", "fragil"], consumidores: [], cobertura: 0.975,
    nota: "DERIVADO por `robustezDe` de la racha más larga de MINUTOS activos seguidos: 632 robustas, 235 atentas, 56 frágiles. Lo de los minutos no es un detalle — contando PASOS, las «Lentejas con verduras» salían frágiles, porque un guiso encadena seis pasos activos (picar, sofreír, añadir, rehogar) que son doce minutos y luego hora y media de olla sola. El número de pasos mide cómo escribió la receta quien la escribió, no cuánto te ata. Hoy las lentejas salen `atento` con 15 min y el risotto `fragil` con 32, que es la distinción que el eje existe para hacer.",
  },
  {
    n: 44, id: "quienCocina", nombre: "Quién puede cocinarlo",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "`kidFriendly` dice quién lo COME; esto dice quién lo HACE. Son dos preguntas y hoy hay un solo campo.",
  },

  // ── Logística del plato (30-33, 40) ──────────────────────────────────────
  {
    n: 30, id: "transportabilidad", nombre: "Transportabilidad / tupper",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "tupperFriendly", vocabulario: null,
    consumidores: ["solver", "aiPlanner", "planner", "validateMenu", "menuInsights"], cobertura: 1.0,
  },
  {
    n: 31, id: "conLasManos", nombre: "Se come con las manos",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 1,
    nota: "DERIVADO por `conLasManosDe` al 100 %: 89 recetas. Sale del NOMBRE, y aquí el nombre es el dato y no un atajo — un plato que se llama «Bocadillo» se come con las manos lo diga quien lo diga. SOLO DE LA CABEZA del nombre, que es la lección de `formato` otra vez: unas «Alubias pintas CON COSTILLAS» salían de manos porque la palabra aparece, y ahí la costilla va dentro del guiso. Y el `formato` cierra la puerta que el nombre abre: cremoso, sopa o guiso mandan sobre él. Decide más de lo que parece — una cena de manos es otra cosa, delante de la tele y con niños—, y es una petición que la gente hace con esas palabras.",
  },
  {
    n: 32, id: "compartido", nombre: "Compartido vs individual",
    ambito: AMBITO.RECETA, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 33, id: "congelabilidad", nombre: "Congelabilidad y recalentado",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "freezable", vocabulario: null,
    consumidores: ["bases", "aiPlanner", "adelanto"], cobertura: 0.881,
    nota: "`thawSteps` lo acompaña al 28,4 %.",
  },
  {
    n: 40, id: "perecibilidad", nombre: "Perecibilidad y orden en la semana",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 1,
    nota: "Restricción DE POSICIÓN, no de selección: el pescado fresco va al principio de la semana, y eso no descarta la receta — la coloca. Es el único eje de posición de la lista. DERIVADO por `perecibilidadDe` al 100 % de la clase del alimento: pez, marisco y cefalópodo mandan 2 días (208 recetas), carne y lácteo 4 (578), y 161 no tienen nada que caduque. La conserva, el congelado y el ahumado NO cuentan: un «Atún en conserva» es pez y aguanta un año. — DE POCO USO HOY, y conviene que esté escrito para no sobrevalorarlo: la compra de MenuPlan va al congelador de partida, así que el orden de la semana no aprieta. El eje vale el día que haya compra fresca o lista diaria; mientras tanto es correcto y ocioso, que es distinto de estar mal.",
  },

  // ── Economía y sostenibilidad (34-36) ────────────────────────────────────
  {
    n: 34, id: "coste", nombre: "Coste por ración",
    ambito: AMBITO.RECETA, tipo: "numerico", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "Con `priceHistory` y 3.052 productos en el repo. Es el que menos trabajo nuevo pide.",
  },
  {
    n: 35, id: "huella", nombre: "Huella / sostenibilidad",
    ambito: AMBITO.ALIMENTO, tipo: "numerico", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
  },
  {
    n: 36, id: "aprovechamiento", nombre: "Aprovechamiento y merma",
    ambito: AMBITO.RECETA, tipo: "derivado", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "Eje de RELACIÓN ENTRE RECETAS: qué sobra de una y entra en otra. El único de la lista que no es una propiedad de un plato solo.",
  },

  // ── Curación editorial (37) ──────────────────────────────────────────────
  {
    n: 37, id: "curacionEditorial", nombre: "estrella · gourmet · occasion · kidFavourite",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "estrella", vocabulario: null,
    consumidores: ["filterRecipes", "aporte", "cocinaTopes", "BasesPreferidas"], cobertura: 0.725,
    nota: "El documento lo marca SANO: es el patrón correcto de campo curado. `occasion` 5 %, `kidFavourite` 6 %.",
  },

  // ── El comensal (38, 39, 41) ─────────────────────────────────────────────
  {
    n: 38, id: "objetivoCorporal", nombre: "Objetivo corporal",
    ambito: AMBITO.HOGAR, tipo: "enum", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "Falta entero, y gran parte es calculable ya con las macros al 100 %. OJO al error que el documento avisa: «adelgazar» no es propiedad del plato y «bajo en calorías» no es propiedad del usuario. Confundirlas lleva a inventar campos como `apto_dieta`, que envejecen mal.",
  },
  {
    n: 39, id: "contextoPeticion", nombre: "Contexto de la petición",
    ambito: AMBITO.HOGAR, tipo: "tags", estado: "sin_lector",
    campo: null, vocabulario: null, consumidores: [], cobertura: 1,
    nota: "NO FALTABA: estaba disperso. Es el único eje que no describe un plato ni un alimento sino la situación desde la que alguien pide de comer — «es martes, somos cuatro, hay niños y no tengo ganas» no es propiedad de ninguna receta. Y ya se recoge entero: `filterRecipes` declara quince argumentos sueltos (hasKids, maxTime, cookLevel, eaters, kitchenTools, pantryIngredients…) y cada consumidor los vuelve a pasar uno a uno, lo cual funciona mientras haya UN consumidor — con el modo chat serán dos, y quince parámetros sueltos entre dos sitios se desincronizan. `contextoDe` (src/lib/derive/contextoPeticion.js) los recoge y los traduce una vez: 20 minutos pasa a `prisa: mucha`. Declara sus huecos en vez de rellenarlos con un defecto que luego se lea como respuesta. Y `admiteOcasion` saca fuera la regla `plato_ocasion_entre_semana`, que hoy vive dentro de validateMenu y es este eje escrito allí: así se puede preguntar antes de armar el menú en vez de reprochar después.",
  },
  {
    n: 41, id: "protocoloDietetico", nombre: "Protocolo dietético (FODMAP, keto, mediterránea, DASH)",
    ambito: AMBITO.HOGAR, tipo: "tags", estado: "silencioso",
    campo: null, vocabulario: null, consumidores: [], cobertura: 0,
    nota: "El FODMAP prohíbe ajo y cebolla, que es otra prueba de que el aromático no es ornamental: si el eje `rol` no distingue aromático de ración, no se puede contestar.",
  },

  // ── Posteriores al documento ─────────────────────────────────────────────
  //
  // Del 46 en adelante son ejes que el documento no numeró y que salieron de
  // medir. Se numeran a continuación y NO se intercalan: los números 1-45 son
  // la referencia cruzada con §6 y reordenarlos rompería toda discusión que ya
  // se haya tenido sobre «el eje 23».
  //
  // Los dos primeros son el enum de `formato` partido en lo que de verdad era:
  // tres preguntas, no una. Que sean booleanos independientes está medido —
  // hay recetas con cada combinación de los cuatro cuadrantes.
  {
    n: 46, id: "montaje", nombre: "Se monta en el plato",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: "montaje", vocabulario: null,
    consumidores: ["solver", "bases", "aiPlanner", "userRecipes", "CatalogBrowserSheet"], cobertura: 0.092,
    nota: "Ámbito RECETA y no PARTE, aunque conceptualmente sea de la parte: el campo que existe es de la receta (95 de 1.033, cero pasos con él) y declarar un ámbito que el dato no tiene hace mentir al medidor. Ya existía como campo y NO tenía eje, que es la mitad de cómo se pudre un campo: 95 recetas, cinco lectores y ninguna declaración. Sale del enum de `formato` porque no es hermano de `guiso` ni de `sopa` — se monta una tosta y se monta un bol, y los dos pueden además llevar masa o no.",
  },
  {
    n: 47, id: "llevaMasa", nombre: "Lleva masa",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "sin_lector",
    campo: null, vocabulario: null,
    consumidores: [], cobertura: 1,
    notaDerivacion: "DERIVADO por `llevaMasaDe` (src/lib/derive/ejesDePlato.js) al 100 %: 40 recetas. POR ID Y NO POR NOMBRE, que es la lección que este repo repite — el regex sobre el nombre casa diez ingredientes y TRES no son masa: `pan-rallado` es un rebozado que va por fuera, `semola-de-trigo` es grano, y la `harina` sola espesa salsas en el 90 % de sus usos. A los ocho ids de masa comprada se suma la firma `harina + levadura`, que es la masa que se amasa en casa: la pizza casera, el calzone, la coca y tres empanadas se escapaban sin ella. Ámbito RECETA y no PARTE: el dato sale de `ingredients[]`, que es de la receta entera.",
    nota: "El otro que salía del enum de `formato`, y el que causaba 5 de sus 11 dobles encajes: tortitas, lasaña, gnocchi, nidos gratinados y burritos eran «masa» Y otra cosa a la vez. Es independiente del 46 y se demuestra con las cuatro combinaciones: la empanada gallega lleva masa y no se monta, el pan tumaca se monta y no lleva masa, la lasaña y los burritos son las dos, y un guiso no es ninguna.",
  },
  {
    n: 48, id: "gruposSecundarios", nombre: "Grupos de alimento secundarios (verdura, lácteo, fruta, frutos secos, seta, encurtido)",
    ambito: AMBITO.RECETA, tipo: "tags", estado: "sin_lector",
    campo: "mainIngredients", vocabulario: null,
    consumidores: [], cobertura: 0.644,
    nota: "EL PEOR CASO DEL CATÁLOGO, y estaba sin declarar. `mainIngredients` tiene 665 recetas rellenas, enum en el esquema, columna en Supabase y sincronización… y CERO lectores: el único sitio del código donde aparece la palabra fuera del esquema y del sync es una variable local del mismo nombre en `recipes.js`, que no tiene nada que ver. Es `mainBase` con el doble de cobertura y sin el consuelo de estar documentado. Se declara aquí para que deje de ser invisible: o alguien lo lee, o se borra — la regla del documento es que todo campo declara su consumidor y si no tiene, se va.",
  },

  // ── Lo que salió de la auditoría de estrella (49) ────────────────────────
  {
    n: 49, id: "antelacion", nombre: "Hay que empezarlo otro día",
    ambito: AMBITO.RECETA, tipo: "booleano", estado: "activo",
    campo: null, vocabulario: null,
    consumidores: ["filterRecipes", "necesitaVispera"], cobertura: 0.975,
    nota: "DERIVADO, no curado: sale de `stepsRich[].minutes >= 720` y por eso su cobertura es la de `stepsRich` (97,5 %) y no hay campo que mantener. Nace de un caso concreto: «Carpaccio de salmón con cítricos» es `montaje: true`, y el atajo de `recipeMatchesPreferType(\"cena_rapida\")` devolvía true por esa vía SIN mirar el tiempo, así que la app podía proponerlo como cena de hoy teniendo por primer paso «Congelar un mínimo de 48 h antes». Hoy son 12 recetas estrella con un paso pasivo de 12 h o más: los dos salmones de anisakis, los remojos de legumbre y los curados. NO es `adelanto`, que es de batch cooking y dice si el plato AGUANTA hecho; este dice si EXIGE empezarse antes, y son preguntas opuestas. Se deriva en vez de curarse porque el dato ya está escrito en los pasos y un campo nuevo sería una segunda verdad que se desincroniza.",
  },
];

/** Por id, para no recorrer el array en cada consulta. */
export const EJE_POR_ID = new Map(EJES.map((e) => [e.id, e]));

/**
 * ¿Cuánto del catálogo tiene este eje relleno?
 *
 * Devuelve `null` —y no 0— cuando el eje no existe: son dos respuestas
 * distintas y confundirlas es el error que este fichero existe para evitar.
 * Un 0 significa «el eje está declarado y no hay datos»; `null` significa
 * «esa pregunta no está ni registrada».
 *
 * @param {string} ejeId
 * @returns {number|null}
 */
export function cobertura(ejeId) {
  return EJE_POR_ID.get(ejeId)?.cobertura ?? null;
}

/**
 * ¿Puede el catálogo contestar a una petición sobre este eje?
 *
 * Es lo que permite decir «todavía no tengo nada catalán» en vez de
 * improvisar. Un eje silencioso NO es un fallo: es una respuesta.
 *
 * @param {string} ejeId
 * @returns {{puede: boolean, porque: string}}
 */
export function puedeResponder(ejeId) {
  const eje = EJE_POR_ID.get(ejeId);
  if (!eje) return { puede: false, porque: "el eje no está registrado" };
  if (eje.cobertura === 0) return { puede: false, porque: `«${eje.nombre}» está declarado y sin datos` };
  if (!eje.consumidores.length) return { puede: false, porque: `«${eje.nombre}» tiene datos y nadie los lee` };
  return { puede: true, porque: `cobertura ${(100 * eje.cobertura).toFixed(0)} %` };
}

/**
 * Los ejes podridos, que son los dos fallos y no el estado sano.
 *
 * Se consulta aparte y no se mezcla con `puedeResponder` porque contestan a
 * preguntas distintas: aquélla es del producto —¿puedo honrar esta petición?—
 * y ésta es del que mantiene el catálogo. Un eje `sin_lector` responde
 * perfectamente a una consulta y aun así hay que arreglarlo.
 *
 * @returns {{sinLector: Array, sinDatos: Array}}
 */
export function podridos() {
  return {
    sinLector: EJES.filter((e) => e.estado === "sin_lector"),
    sinDatos: EJES.filter((e) => e.estado === "sin_datos"),
  };
}

/**
 * ¿Es este valor del vocabulario del eje?
 *
 * `null` cuando el eje no fija vocabulario todavía — que es distinto de
 * «no es válido». El documento es explícito: un vocabulario a ojo es la forma
 * rápida de acabar con 14 valores donde debían ser 8.
 *
 * @param {string} ejeId
 * @param {string} valor
 * @returns {boolean|null}
 */
export function valorValido(ejeId, valor) {
  const v = EJE_POR_ID.get(ejeId)?.vocabulario;
  return v ? v.includes(valor) : null;
}
