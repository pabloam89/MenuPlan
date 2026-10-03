/**
 * Lo que se puede pedir de un plato, en un solo sitio: lo leen el enrutador
 * (la vía rápida) y las herramientas de Lola. Si cada uno tiene su copia, la
 * que se queda atrás contesta rápido y mal: «más carbos para el jueves» entraba
 * por la vía rápida sin el eje y salían tres platos cualquiera.
 *
 * Sin dependencias a propósito: el enrutador no debe cargar el motor.
 */

// Las claves de EJES_NUMERICOS (api/_bot/menu.js); un test comprueba que coinciden.
export const IDS_EJES = ["proteina", "carbohidratos", "grasa", "densidadNutricional", "carga"];

export const ESQUEMA_RASGOS = {
  type: "object",
  description: "Opcional: lo que piden del plato, tal cual lo dicen. «Reconfortante», «de cuchara», «que no pique», «barato», «fresquito»… Solo los que digan.",
  properties: {
    connotacion: { type: "string", enum: ["reconfortante", "fresco", "casero", "festivo"] },
    textura: { type: "string", enum: ["cuchara", "tenedor", "mano"], description: "cuchara = sopas, cremas, guisos; mano = para picar o bocadillo." },
    picante: { type: "string", enum: ["sin", "con"], description: "sin = que no pique; con = que pique." },
    sabor: { type: "string", enum: ["suave", "intenso", "especiado", "dulce", "acido", "ahumado"] },
    coste: { type: "string", enum: ["economico", "medio", "caro"], description: "economico = barato (menos de 1 € por ración)." },
    calorias: { type: "string", enum: ["ligero", "medio", "contundente"], description: "Para «algo contundente»; para «ligero» usa estilo." },
  },
  additionalProperties: false,
};

export const ESQUEMA_EJE = {
  type: "object",
  description: "Opcional: «más» o «menos» de un número del plato, comparado con el que ya está en ese hueco. «Más carbos» → carbohidratos; «que llene» → carga (lo que sacia); «menos grasa» → grasa; «más proteína» → proteina. densidadNutricional = kcal por 100 g, para «algo que pese menos»; «ligero» sigue siendo estilo. Solo si lo piden.",
  properties: {
    cual: { type: "string", enum: IDS_EJES },
    direccion: { type: "string", enum: ["mas", "menos"] },
  },
  required: ["cual", "direccion"],
  additionalProperties: false,
};
