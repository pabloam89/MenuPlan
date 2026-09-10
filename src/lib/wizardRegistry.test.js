import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CONTROLES, TEMAS, PREGUNTAS, PREGUNTAS_POR_ID, registroOrdenado,
  estadoDelCampo, estadoDePregunta, dependenciasCumplidas, anulada,
  preguntasVisibles, siguientePregunta, cuantasQuedan, coberturaDeTema,
  temasVisibles, valorDePregunta, controlesVisibles,
} from "./wizardRegistry.js";
import { libretaVacia, poner, delegar } from "./notepad.js";
import { CAMPOS_POR_ID } from "./notepadFields.js";
import { rutaDeReparto } from "./reparto.js";

/** Una casa recién llegada: no ha contestado nada. */
const VACIA = {};

/** Los cimientos ya puestos. */
const CIMIENTOS = {
  schoolChoice: "no_aplica",
  members: [{ id: "m1", name: "Pablo" }],
  allergiesReviewed: true,
  allergies: [],
  meals: ["Comida", "Cena"],
};

describe("la tabla es coherente consigo misma", () => {
  it("todo control existe", () => {
    for (const p of PREGUNTAS) expect(CONTROLES).toContain(p.control);
  });

  it("todo tema existe", () => {
    const ids = TEMAS.map((t) => t.id);
    for (const p of PREGUNTAS) expect(ids).toContain(p.tema);
  });

  it("toda dependencia apunta a una fila real", () => {
    for (const p of PREGUNTAS) {
      for (const id of [...(p.requiere ?? []), ...(p.anula ?? [])]) {
        expect(PREGUNTAS_POR_ID[id], `${p.id} apunta a "${id}", que no existe`).toBeDefined();
      }
      if (p.refina) expect(PREGUNTAS_POR_ID[p.refina]).toBeDefined();
    }
  });

  it("ninguna fila se requiere a sí misma", () => {
    for (const p of PREGUNTAS) expect(p.requiere ?? []).not.toContain(p.id);
  });

  it("los ids son únicos y los órdenes no chocan", () => {
    expect(new Set(PREGUNTAS.map((p) => p.id)).size).toBe(PREGUNTAS.length);
    expect(new Set(PREGUNTAS.map((p) => p.orden)).size).toBe(PREGUNTAS.length);
  });

  it("una fila de la libreta apunta a un campo que el parser conoce", () => {
    for (const p of PREGUNTAS.filter((x) => x.fuente === "libreta")) {
      expect(CAMPOS_POR_ID[p.campo], `${p.id} usa el campo "${p.campo}"`).toBeDefined();
    }
  });
});

describe("la fila de controles sale del registro, no de un componente", () => {
  it("solo salen mandos del menú, nunca perfil", () => {
    // Quiénes coméis, las alergias y el cole se contestan una vez y viven en
    // su pantalla; el reparto o el tiempo se tocan cada semana mirando lo que
    // salió. Mezclarlos convertiría la fila en un menú de ajustes.
    const ids = controlesVisibles(libretaVacia(), CIMIENTOS).map((p) => p.id);
    expect(ids).toEqual(["reparto", "cocina", "estructura", "tiempo", "esfuerzo", "trastos"]);
    for (const fuera of ["members", "alergias", "cole", "comidas"]) {
      expect(ids).not.toContain(fuera);
    }
    // `tecnica` tampoco: la fila la escribe el bot y la guarda la libreta,
    // pero nadie la lee al generar, así que como mando no cambiaba nada.
    expect(ids).not.toContain("tecnica");
  });

  it("cada control trae lo que la fila necesita para pintarse", () => {
    for (const p of controlesVisibles(libretaVacia(), CIMIENTOS)) {
      expect(p.corto, `${p.id} sin etiqueta corta`).toBeTruthy();
      expect(p.corto.length, `${p.id}: la etiqueta del botón se lee de un vistazo`).toBeLessThanOrEqual(10);
      // O un recorte de Midjourney que represente el eje, o un icono con su
      // color. Sin ninguno de los dos, la pill sale con un hueco delante.
      expect(p.arte ?? p.icono, `${p.id} no tiene ni ilustración ni icono`).toBeTruthy();
      if (!p.arte) expect(p.color, `${p.id} usa icono pero sin color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("las ilustraciones existen en public/", () => {
    for (const p of controlesVisibles(libretaVacia(), CIMIENTOS).filter((x) => x.arte)) {
      expect(existsSync(join("public", p.arte)), `${p.id}: no existe ${p.arte}`).toBe(true);
    }
  });

  it("todas las baldosas de la fila usan el mismo tipo de ilustración", () => {
    // Una baldosa con fondo entre seis con el dibujo flotando sobre blanco se
    // lee como que significa algo distinto, y no significa nada. Pasó con
    // Trastos, que era la única card a sangre de los siete mandos. La fila es
    // toda de recortes o toda de cards; hoy, de recortes.
    const conArte = controlesVisibles(libretaVacia(), CIMIENTOS).filter((p) => p.arte);
    expect(conArte.length).toBeGreaterThan(1);
    for (const p of conArte) {
      expect(p.arte, `${p.id}: la baldosa tiene que ser un recorte`).toMatch(/^\/categories\/cut\//);
      expect(p.arteLleno, `${p.id}: un recorte no va a sangre`).toBeFalsy();
    }
  });

  it("`arteLleno` coincide con el tipo de ilustración que es", () => {
    // Las dos familias de imagen del repo se pintan distinto y confundirlas se
    // ve: los recortes de /categories/cut tienen transparencia y flotan dentro
    // de la baldosa; las cards de /avatares/cards traen su propio fondo y van a
    // sangre. Una card encogida y centrada sobre blanco parece una foto suelta
    // — que es justo el fallo que hubo que arreglar.
    const todas = [
      ...controlesVisibles(libretaVacia(), CIMIENTOS).map((p) => [p.id, p.arte, p.arteLleno]),
      ...PREGUNTAS.filter((p) => p.arteOpciones).flatMap((p) =>
        Object.values(p.arteOpciones).map((a) => [`${p.id}:opciones`, a, p.arteOpcionesLlenas]),
      ),
    ].filter(([, arte]) => arte);

    for (const [id, arte, lleno] of todas) {
      const esRecorte = arte.startsWith("/categories/cut/");
      expect(Boolean(lleno), `${id}: ${arte} ${esRecorte ? "es recorte y no va a sangre" : "es card y va a sangre"}`)
        .toBe(!esRecorte);
      expect(existsSync(join("public", arte)), `${id}: no existe ${arte}`).toBe(true);
    }
  });

  it("ningún control repite ilustración, icono ni etiqueta con otro", () => {
    // Siete pills con el mismo glifo son siete botones que hay que leer. Y dos
    // llamadas "Cocina" —de dónde es el plato, y los aparatos que hay en casa—
    // ya pasó una vez.
    const controles = controlesVisibles(libretaVacia(), CIMIENTOS);
    const marcas = controles.map((p) => p.arte ?? p.icono);
    expect(new Set(marcas).size).toBe(controles.length);
    expect(new Set(controles.map((p) => p.corto)).size).toBe(controles.length);
  });

  it("una fila de `data` sabe leerse Y escribirse", () => {
    // Sin `escribe`, la hoja abriría y el botón de guardar no tendría dónde ir.
    // Se escribe un valor del DOMINIO de cada fila, no uno inventado: varias
    // caen a un default razonable ante un id desconocido —`tiempo` devuelve
    // "normal"— y comprobar el round-trip con basura mediría ese fallback en
    // vez de la fila.
    for (const p of controlesVisibles(libretaVacia(), CIMIENTOS).filter((x) => x.fuente === "data")) {
      expect(typeof p.lee, `${p.id}`).toBe("function");
      expect(typeof p.escribe, `${p.id}`).toBe("function");
      expect(p.opciones, `${p.id} sin dominio que ofrecer`).toBeTruthy();

      const primera = p.opciones[0];
      // "multi" lleva un dominio de strings; el resto, de {valor, etiqueta}.
      const valor = p.control === "multi" ? [primera] : primera.valor ?? primera;

      const nuevo = p.escribe({ hola: 1 }, valor);
      expect(nuevo.hola, `${p.id} no debe pisar el resto de data`).toBe(1);
      expect(p.lee(nuevo), `${p.id} no lee lo que acaba de escribir`).toEqual(valor);
    }
  });

  it("un control cuyas dependencias faltan no se pinta", () => {
    // `reparto` y `tiempo` requieren saber qué comidas se planifican; sin eso,
    // abrirían una hoja que no puede hacer nada.
    const ids = controlesVisibles(libretaVacia(), {}).map((p) => p.id);
    expect(ids).not.toContain("reparto");
    expect(ids).not.toContain("tiempo");
    expect(ids).toContain("cocina");
  });

  it("los electrodomésticos ofrecen el vocabulario que el motor cruza", () => {
    // KITCHEN_TOOLS de Menu.jsx, que es lo que filterRecipes compara contra
    // `requiredAppliance`. Inventar uno nuevo lo dejaría sin consumidor.
    expect(PREGUNTAS_POR_ID.trastos.opciones).toEqual(
      ["Airfryer", "Horno", "Microondas", "Thermomix", "Olla rápida", "Vaporera"],
    );
  });

  it("la estructura ofrece los valores que el planner entiende de VERDAD", () => {
    // El motor compara `mealStructure === "1_plato"` (aiPlanner.js). Ofrecer
    // "unico" aquí —que es el override de UN día, no el de la casa— dejaba el
    // control pintándose bien y sin efecto ninguno sobre el menú.
    const valores = PREGUNTAS_POR_ID.estructura.opciones.map((o) => o.valor);
    expect(valores).toEqual(["primero_segundo", "1_plato"]);
    expect(valores).not.toContain("unico");
  });

  it("el tiempo ofrece los cuatro niveles que ya usa la app", () => {
    expect(PREGUNTAS_POR_ID.tiempo.opciones.map((o) => o.valor))
      .toEqual(["con_prisa", "normal", "con_tiempo", "depende"]);
  });
});

describe("el wizard puede preguntar por alergias; el parser sigue sin poder tocarlas", () => {
  // La razón de que este registro sea una tabla APARTE de notepadFields: allí
  // hay un test que impide que ninguna fila apunte a alergias, porque un
  // alérgeno que entra como preferencia es el fallo peligroso de todo esto.
  it("la pregunta de alergias existe aquí", () => {
    expect(PREGUNTAS_POR_ID.alergias).toBeDefined();
  });

  it("y está marcada como no escribible por el parser", () => {
    expect(PREGUNTAS_POR_ID.alergias.parser).toBe(false);
  });

  it("ninguna fila que el parser pueda escribir roza las alergias", () => {
    for (const p of PREGUNTAS.filter((x) => x.parser)) {
      expect(p.id).not.toMatch(/alerg/i);
      expect(p.fuente).toBe("libreta");
      expect(JSON.stringify({ ...p, lee: undefined })).not.toMatch(/allerg/i);
    }
  });
});

describe("el cole va delante, y por eso no depende de nadie", () => {
  it("es la primera fila del registro", () => {
    expect(registroOrdenado()[0].id).toBe("cole");
  });

  it("no requiere miembros: preguntada como casa, no necesita saber quiénes sois", () => {
    expect(PREGUNTAS_POR_ID.cole.requiere).toEqual([]);
    expect(PREGUNTAS_POR_ID.cole.activa).toBe(null);
  });

  it("en una casa vacía, la primera pregunta es el cole y no las alergias", () => {
    expect(siguientePregunta(libretaVacia(), VACIA).id).toBe("cole");
  });

  it("«no aplica» es una respuesta, no un hueco", () => {
    const n = libretaVacia();
    expect(estadoDelCampo(PREGUNTAS_POR_ID.cole, n, { schoolChoice: "no_aplica" })).toBe("fijado");
    expect(siguientePregunta(n, { schoolChoice: "no_aplica" }).id).toBe("members");
  });
});

describe("requiere: sin lo otro la pregunta no tiene sentido", () => {
  it("las alergias esperan a saber quiénes sois", () => {
    const n = libretaVacia();
    expect(dependenciasCumplidas(PREGUNTAS_POR_ID.alergias, n, VACIA)).toBe(false);
    expect(dependenciasCumplidas(PREGUNTAS_POR_ID.alergias, n, { members: [{ id: "m1" }] })).toBe(true);
  });

  it("el reparto espera a saber cuántos huecos hay", () => {
    const n = libretaVacia();
    expect(dependenciasCumplidas(PREGUNTAS_POR_ID.reparto, n, { members: [{ id: "m1" }] })).toBe(false);
    expect(dependenciasCumplidas(PREGUNTAS_POR_ID.reparto, n, CIMIENTOS)).toBe(true);
  });

  it("una pregunta bloqueada no sale en las visibles", () => {
    expect(preguntasVisibles(libretaVacia(), VACIA).map((p) => p.id)).not.toContain("reparto");
  });

  it("delegar cuenta como contestar: «lo que tú veas» no es un hueco", () => {
    const n = delegar(libretaVacia(), "reparto.carne");
    // `cocina` refina a `reparto`, que no bloquea; lo que se comprueba es que
    // un campo delegado deja de contar como vacío para quien lo requiera.
    expect(estadoDelCampo(PREGUNTAS_POR_ID.reparto, n, CIMIENTOS)).toBe("delegado");
    expect(estadoDePregunta(PREGUNTAS_POR_ID.reparto, n, CIMIENTOS)).toBe("aclarado");
  });
});

describe("activa: aparece sola cuando un dato la hace relevante", () => {
  const soloConNinos = {
    ...PREGUNTAS_POR_ID.trastos,
    id: "menu_cole",
    activa: (data) => (data?.members ?? []).some((m) => m.age && m.age < 18),
  };

  it("no sale si el dato no la activa", () => {
    expect(dependenciasCumplidas(soloConNinos, libretaVacia(), CIMIENTOS)).toBe(false);
  });

  it("sale sola en cuanto el dato aparece", () => {
    const conNino = { ...CIMIENTOS, members: [{ id: "m1" }, { id: "m2", age: 8 }] };
    expect(dependenciasCumplidas(soloConNinos, libretaVacia(), conNino)).toBe(true);
  });
});

describe("anula: contestar una deja otra sin sentido", () => {
  // «Concentro el esfuerzo el domingo» se come «¿cuánto tiempo entre semana?».
  const registro = PREGUNTAS.map((p) =>
    p.id === "esfuerzo" ? { ...p, anula: ["tiempo"] } : p,
  );
  // `esfuerzo` lee de `data.cookLevel`, no de la libreta: contestarla es poner
  // ese campo, no escribir un eje.
  const CON_ESFUERZO = { ...CIMIENTOS, cookLevel: "normal" };

  it("mientras nadie la conteste, la otra sigue viva", () => {
    expect(anulada(PREGUNTAS_POR_ID.tiempo, libretaVacia(), CIMIENTOS, registro)).toBe(false);
  });

  it("contestada, la anulada desaparece del recorrido", () => {
    expect(anulada(PREGUNTAS_POR_ID.tiempo, libretaVacia(), CON_ESFUERZO, registro)).toBe(true);
    expect(preguntasVisibles(libretaVacia(), CON_ESFUERZO, registro).map((p) => p.id)).not.toContain("tiempo");
  });

  it("y deja de contar en lo que queda", () => {
    const antes = cuantasQuedan(libretaVacia(), CIMIENTOS, { registro });
    const despues = cuantasQuedan(libretaVacia(), CON_ESFUERZO, { registro });
    // Se contesta una (esfuerzo) y se mata otra (tiempo): bajan dos de golpe.
    expect(antes - despues).toBe(2);
  });
});

describe("refina ordena, pero no bloquea", () => {
  it("la fina se puede contestar antes que la gruesa", () => {
    expect(PREGUNTAS_POR_ID.cocina.refina).toBe("reparto");
    // `cocina` no requiere nada, así que sale desde el minuto cero aunque el
    // reparto siga vacío: refinar antes que decidir lo grueso es raro, pero no
    // es una contradicción y bloquearlo sería inventarse una regla.
    expect(dependenciasCumplidas(PREGUNTAS_POR_ID.cocina, libretaVacia(), VACIA)).toBe(true);
  });

  it("pero va detrás en el orden", () => {
    const orden = registroOrdenado().map((p) => p.id);
    expect(orden.indexOf("cocina")).toBeGreaterThan(orden.indexOf("reparto"));
  });
});

describe("los tres estados de una tarjeta", () => {
  it("lo que nadie mencionó está por tocar", () => {
    expect(estadoDePregunta(PREGUNTAS_POR_ID.cocina, libretaVacia(), VACIA)).toBe("por-tocar");
  });

  it("lo contestado está aclarado", () => {
    const n = poner(libretaVacia(), "cocina.italiana", true, { origen: "pregunta" });
    expect(estadoDePregunta(PREGUNTAS_POR_ID.cocina, n, VACIA)).toBe("aclarado");
  });

  it("lo inferido del texto también, CON la suposición a la vista", () => {
    // La regla que evita que esto vuelva a ser un formulario: una suposición
    // visible cuesta cero si no la miras; una aclaración pendiente cuesta
    // siempre, aunque te dé igual.
    const n = poner(libretaVacia(), "cocina.italiana", true, {
      origen: "texto", frase: "nos tira mucho lo italiano", fecha: "2026-09-09",
    });
    expect(estadoDePregunta(PREGUNTAS_POR_ID.cocina, n, VACIA)).toBe("aclarado");
  });

  it("salvo las alergias, donde suponer sería ponerle un criterio en la boca", () => {
    const data = { members: [{ id: "m1" }], allergiesReviewed: true, allergies: ["gluten"] };
    // Marcada `suposicion: false`: en cuanto se infiere, pide confirmación.
    expect(PREGUNTAS_POR_ID.alergias.suposicion).toBe(false);
    expect(estadoDePregunta(PREGUNTAS_POR_ID.alergias, libretaVacia(), data)).toBe("aclarado");
  });

  it("una duda del parser levanta la voz aunque haya valor", () => {
    const n = poner(libretaVacia(), "cocina.italiana", true, { origen: "texto" });
    expect(estadoDePregunta(PREGUNTAS_POR_ID.cocina, n, VACIA, ["cocina"])).toBe("aclaracion");
  });

  it("y una aclaración se atiende antes que un hueco", () => {
    const n = poner(libretaVacia(), "cocina.italiana", true, { origen: "texto" });
    expect(siguientePregunta(n, CIMIENTOS, { dudas: ["cocina"] }).id).toBe("cocina");
  });
});

describe("el wizard se acorta mientras hablas", () => {
  it("una casa vacía tiene todo por tocar", () => {
    const total = preguntasVisibles(libretaVacia(), VACIA).length;
    expect(cuantasQuedan(libretaVacia(), VACIA)).toBe(total);
  });

  it("cada respuesta baja el contador", () => {
    const antes = cuantasQuedan(libretaVacia(), VACIA);
    const despues = cuantasQuedan(libretaVacia(), { schoolChoice: "no_aplica" });
    expect(despues).toBeLessThan(antes);
  });

  it("contestar los cimientos abre preguntas que antes no existían", () => {
    // El total NO es fijo: por eso la barra dice "quedan 4 cosas" y no
    // "paso 3 de 15", que además de amenazar, mentiría.
    expect(preguntasVisibles(libretaVacia(), CIMIENTOS).length)
      .toBeGreaterThan(preguntasVisibles(libretaVacia(), VACIA).length);
  });

  it("con todo contestado no queda ninguna y no hay siguiente", () => {
    let n = libretaVacia();
    for (const p of PREGUNTAS.filter((x) => x.fuente === "libreta")) {
      // El primer valor del dominio real del eje, no uno inventado: si mañana
      // alguien cambia el dominio de `tecnica`, este test tiene que seguir
      // escribiendo algo que la libreta acepte.
      const valor = CAMPOS_POR_ID[p.campo].dominio[0];
      const ruta = p.campo === "reparto" ? rutaDeReparto(valor) : `${p.campo}.${valor}`;
      n = poner(n, ruta, 1, { origen: "pregunta" });
    }
    const todo = {
      ...CIMIENTOS,
      mealStructure: "primero_segundo",
      cookLevel: "normal",
      cookTime: 30,
      appliances: ["Horno"],
      budget: 100,
      pantryMode: "prefer",
    };
    expect(cuantasQuedan(n, todo)).toBe(0);
    expect(siguientePregunta(n, todo)).toBe(null);
  });
});

describe("las tarjetas enseñan cobertura, no un sí o no", () => {
  it("una tarjeta a medias lo dice: «1 de N»", () => {
    const n = poner(libretaVacia(), "cocina.italiana", true, { origen: "pregunta" });
    const cob = coberturaDeTema("gustos", n, CIMIENTOS);
    expect(cob.hechas).toBe(1);
    expect(cob.de).toBeGreaterThan(1);
  });

  it("una aclaración pendiente se cuenta aparte, no como «casi hecha»", () => {
    const n = poner(libretaVacia(), "cocina.italiana", true, { origen: "texto" });
    const cob = coberturaDeTema("gustos", n, CIMIENTOS, { dudas: ["cocina"] });
    expect(cob.aclaraciones).toBe(1);
    expect(cob.hechas).toBe(0);
  });

  it("solo salen las tarjetas que tienen sentido para esta casa", () => {
    // Sin cimientos, `gustos` está entera bloqueada salvo lo que no requiere
    // nada, así que la tarjeta aparece pero con menos preguntas dentro.
    const pocas = temasVisibles(libretaVacia(), VACIA).find((t) => t.id === "gustos");
    const todas = temasVisibles(libretaVacia(), CIMIENTOS).find((t) => t.id === "gustos");
    expect(todas.de).toBeGreaterThan(pocas.de);
  });

  it("el bloque de cimientos va con candado", () => {
    expect(TEMAS.find((t) => t.id === "cimientos").fijo).toBe(true);
  });
});

describe("bordes", () => {
  it("una pregunta que no existe no revienta nada", () => {
    expect(estadoDePregunta(null, libretaVacia(), VACIA)).toBe("por-tocar");
    expect(estadoDelCampo(undefined, libretaVacia(), VACIA)).toBe("vacio");
    expect(dependenciasCumplidas(null, libretaVacia(), VACIA)).toBe(false);
    expect(valorDePregunta(null, libretaVacia(), VACIA)).toBe(null);
  });

  it("data sin nada no lanza al leer", () => {
    for (const p of PREGUNTAS.filter((x) => x.fuente === "data")) {
      expect(() => estadoDelCampo(p, libretaVacia(), undefined)).not.toThrow();
      expect(estadoDelCampo(p, libretaVacia(), undefined)).toBe("vacio");
    }
  });

  it("una lista vacía cuenta como vacío, no como contestado", () => {
    expect(estadoDelCampo(PREGUNTAS_POR_ID.members, libretaVacia(), { members: [] })).toBe("vacio");
  });

  it("pero «ninguna alergia» revisada sí cuenta como contestado", () => {
    const data = { members: [{ id: "m1" }], allergiesReviewed: true, allergies: [] };
    expect(estadoDelCampo(PREGUNTAS_POR_ID.alergias, libretaVacia(), data)).toBe("fijado");
    expect(valorDePregunta(PREGUNTAS_POR_ID.alergias, libretaVacia(), data)).toEqual([]);
  });
});

describe("las ilustraciones por opción cubren su dominio entero", () => {
  // Media rejilla con dibujo y media con huecos grises se lee como rota, así
  // que un `arteOpciones` a medias es peor que ninguno.
  it("cada arteOpciones cubre TODOS los valores de su eje, y existen", () => {
    for (const p of PREGUNTAS.filter((x) => x.arteOpciones)) {
      // El dominio vive en tres sitios según el control: la tabla de campos si
      // es de la libreta, `opciones` como strings si es "multi", y como
      // {valor, etiqueta} si es "cards-ab".
      const bruto = p.fuente === "libreta" ? CAMPOS_POR_ID[p.campo].dominio : p.opciones;
      const dominio = bruto.map((o) => (typeof o === "string" ? o : o.valor));
      expect(Object.keys(p.arteOpciones).sort(), `${p.id}`).toEqual([...dominio].sort());
      for (const ruta of Object.values(p.arteOpciones)) {
        expect(existsSync(join("public", ruta)), `${p.id}: no existe ${ruta}`).toBe(true);
      }
    }
  });

  it("dos opciones del mismo eje no comparten dibujo", () => {
    for (const p of PREGUNTAS.filter((x) => x.arteOpciones)) {
      const rutas = Object.values(p.arteOpciones);
      expect(new Set(rutas).size, `${p.id} repite ilustración`).toBe(rutas.length);
    }
  });
});

describe("Niños: la primera fila que se activa sola", () => {
  const CON_NINOS = {
    ...CIMIENTOS,
    members: [{ id: "m1", name: "Pablo" }, { id: "m2", name: "Lucía", role: "hija", age: 8 }],
  };

  it("sin niños en casa, la pregunta ni se ofrece", () => {
    // No se pinta gris ni se explica: simplemente no está.
    expect(controlesVisibles(libretaVacia(), CIMIENTOS).map((p) => p.id)).not.toContain("ninos");
  });

  it("con niños, aparece sola", () => {
    expect(controlesVisibles(libretaVacia(), CON_NINOS).map((p) => p.id)).toContain("ninos");
  });

  it("sus tres ejes son los que consume kidsSlotAction", () => {
    expect(PREGUNTAS_POR_ID.ninos.subejes.map((e) => e.campo))
      .toEqual(["weekdayLunch", "dinner", "weekend"]);
  });

  it("escribe la política a TODOS los niños, no solo al primero", () => {
    // El planner resuelve UNA política de hogar; guardarlo solo en el primero
    // dejaría a los hermanos con lo que hubiera antes y el menú saldría de otra
    // cosa distinta de la que se ve en pantalla.
    const nuevo = PREGUNTAS_POR_ID.ninos.escribe(
      { ...CON_NINOS, members: [...CON_NINOS.members, { id: "m3", role: "hijo", age: 10 }] },
      { dinner: "different" },
    );
    const porMiembro = nuevo.kidDinnerConfig.byMember;
    expect(Object.keys(porMiembro).sort()).toEqual(["m2", "m3"]);
    expect(porMiembro.m2.dinner).toBe("different");
    expect(porMiembro.m3.dinner).toBe("different");
  });

  it("y respeta lo que ya hubiera de cada uno", () => {
    const nuevo = PREGUNTAS_POR_ID.ninos.escribe(
      { ...CON_NINOS, kidDinnerConfig: { byMember: { m2: { weekend: "own" } } } },
      { dinner: "different" },
    );
    expect(nuevo.kidDinnerConfig.byMember.m2.weekend).toBe("own");
    expect(nuevo.kidDinnerConfig.byMember.m2.dinner).toBe("different");
  });

  it("lo escrito se vuelve a leer", () => {
    const nuevo = PREGUNTAS_POR_ID.ninos.escribe(CON_NINOS, { dinner: "different" });
    expect(PREGUNTAS_POR_ID.ninos.lee(nuevo).dinner).toBe("different");
  });

  it("en una casa sin niños no revienta al leer", () => {
    expect(PREGUNTAS_POR_ID.ninos.lee(CIMIENTOS)).toBe(null);
    expect(PREGUNTAS_POR_ID.ninos.lee(undefined)).toBe(null);
  });
});

describe("los subejes también llevan su ilustración", () => {
  it("todas las opciones de Niños tienen dibujo, y existe", () => {
    // Media rejilla con dibujo y media con hueco gris se lee como rota.
    for (const eje of PREGUNTAS_POR_ID.ninos.subejes) {
      for (const o of eje.opciones) {
        expect(o.arte, `ninos.${eje.campo}.${o.valor} sin ilustración`).toBeTruthy();
        expect(existsSync(join("public", o.arte)), `no existe ${o.arte}`).toBe(true);
      }
    }
  });

  it("no se repite un dibujo dentro del mismo subeje", () => {
    for (const eje of PREGUNTAS_POR_ID.ninos.subejes) {
      const rutas = eje.opciones.map((o) => o.arte);
      expect(new Set(rutas).size, `ninos.${eje.campo} repite`).toBe(rutas.length);
    }
  });
});
