/**
 * Los topes semanales por defecto. Viven en su propio módulo (y no en
 * aiPlanner.js, que los reexporta) para que lib/reparto.js pueda importarlos
 * sin crear un ciclo: aiPlanner importa de reparto la holgura de los topes.
 */
export const DEFAULT_FREQS = { carne: 3, pescado: 2, legumbres: 2, pasta_arroz: 2, huevos: 2, verdura: 3 };
