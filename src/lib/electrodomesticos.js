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
export const KITCHEN_TOOL_IDS = ["Airfryer", "Horno", "Microondas", "Olla rápida", "Thermomix", "Vaporera"];
