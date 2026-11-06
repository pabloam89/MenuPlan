/**
 * Los seis aparatos que una casa puede declarar, por su nombre guardado.
 *
 * Es la fuente única del vocabulario: `data.kitchenTools`, el
 * `required_appliances` de las recetas propias (CHECK de 0086) y el enum de
 * `preparar_receta` en el bot salen de aquí. Vive en un módulo sin nada más
 * para que el bot lo importe sin arrastrar iconos ni JSX (applianceMethods.js
 * le pone las ilustraciones encima).
 *
 * En español y con mayúscula, porque así están guardados ya en producción.
 */
import { enOrden } from "./enOrden.js";

export const KITCHEN_TOOL_IDS = ["Airfryer", "Horno", "Microondas", "Olla rápida", "Thermomix", "Vaporera"];

/**
 * Los mismos, en el orden en que se enseñan (los cuatro más comunes primero):
 * el mando de trastos del panel (wizardRegistry.js) y el esquema de
 * ajustar_cocina de Lola (agente.js) lo leen de aquí, no lo copian (#967, C8).
 */
export const APARATOS_EN_ORDEN = Object.freeze(enOrden(KITCHEN_TOOL_IDS, ["Airfryer", "Horno", "Microondas", "Thermomix"]));

/**
 * Aparatos que una receta puede exigir y una casa no puede declarar. Es una
 * decisión, no un descuido: los gofres no se proponen a quien no tiene gofrera
 * (src/data/aparatos.test.js cuenta la historia de las 62 que se cayeron).
 */
export const APARATOS_SIN_DECLARAR = ["gofrera"];

/**
 * Lo que puede ir en `requiredAppliance` de una receta: los declarables, en
 * minúscula como se guardan en el catálogo, más los que no se declaran.
 * filterRecipes los cruza sin distinguir mayúsculas.
 */
export const APARATOS_DE_RECETA = [...KITCHEN_TOOL_IDS.map((a) => a.toLowerCase()), ...APARATOS_SIN_DECLARAR];
