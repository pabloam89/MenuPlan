// ⚠️ DEV-ONLY synthetic receipts for previewing the "Escanear ticket" question
// flow (ReceiptWizard) without a real photo or the AI vision call. Each fixture
// has the exact shape returned by extractReceiptDetail() in receiptParser.js:
//   { store: string|null, date: "YYYY-MM-DD"|null,
//     lines: [{ name, price, qty, unit, kind: "food"|"prefab"|"nonfood" }] }
//
// The set is designed to exercise every step of the wizard: dates inside/outside
// the shopping week, a missing store, cryptic supermarket names (low match
// confidence → "aclara productos"), prefab meals, non-food lines (filtered out),
// and plenty of names that line up with common menu ingredients so the
// "coincidencias" step has things to tach. Only referenced behind
// import.meta.env.DEV, so it never ships in production UI.

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export const RECEIPT_FIXTURES = [
  {
    id: "mercadona-limpio",
    label: "Mercadona · limpio",
    hint: "Fecha en semana · nombres claros",
    detail: {
      store: "Mercadona",
      date: todayISO(),
      lines: [
        { name: "Pechuga de pollo", price: 5.49, qty: 0.6, unit: "kg", kind: "food" },
        { name: "Arroz redondo", price: 1.2, qty: 1, unit: "kg", kind: "food" },
        { name: "Cebolla", price: 0.99, qty: 1, unit: "kg", kind: "food" },
        { name: "Tomate", price: 1.75, qty: 1, unit: "kg", kind: "food" },
        { name: "Leche entera", price: 0.89, qty: 6, unit: "ud", kind: "food" },
        { name: "Bolsa reutilizable", price: 0.15, qty: 1, unit: "ud", kind: "nonfood" },
      ],
    },
  },
  {
    id: "lidl-cripticos",
    label: "Lidl · nombres crípticos",
    hint: "Fecha FUERA de semana · a aclarar",
    detail: {
      store: "Lidl",
      date: daysAgo(20),
      lines: [
        { name: "T.TRIT HAC 400G", price: 0.65, qty: 1, unit: "ud", kind: "food" },
        { name: "PECHUG POLLO FIL", price: 4.2, qty: 1, unit: "ud", kind: "food" },
        { name: "CEB.FIG MALLA 1K", price: 0.99, qty: 1, unit: "ud", kind: "food" },
        { name: "AC.OLIVA V.EXTRA", price: 6.49, qty: 1, unit: "ud", kind: "food" },
        { name: "LASAÑA BOLOÑ 400", price: 2.3, qty: 1, unit: "ud", kind: "prefab" },
        { name: "DETERGENTE 30D", price: 3.99, qty: 1, unit: "ud", kind: "nonfood" },
      ],
    },
  },
  {
    id: "super-desconocido",
    label: "Súper sin identificar",
    hint: "Pregunta la tienda (store null)",
    detail: {
      store: null,
      date: todayISO(),
      lines: [
        { name: "Huevos M 12", price: 1.75, qty: 1, unit: "ud", kind: "food" },
        { name: "Aceite de oliva virgen extra", price: 4.9, qty: 1, unit: "l", kind: "food" },
        { name: "Yogur natural", price: 1.1, qty: 4, unit: "ud", kind: "food" },
        { name: "Pan de molde", price: 1.35, qty: 1, unit: "ud", kind: "food" },
      ],
    },
  },
  {
    id: "carrefour-mixto",
    label: "Carrefour · mixto",
    hint: "Prefab + no-alimentación + claros",
    detail: {
      store: "Carrefour",
      date: daysAgo(2),
      lines: [
        { name: "Lentejas pardinas", price: 1.15, qty: 1, unit: "kg", kind: "food" },
        { name: "Zanahoria", price: 0.79, qty: 1, unit: "kg", kind: "food" },
        { name: "Calabacín", price: 1.29, qty: 1, unit: "kg", kind: "food" },
        { name: "Atún claro en aceite", price: 2.95, qty: 3, unit: "ud", kind: "food" },
        { name: "Pizza 4 quesos", price: 3.5, qty: 1, unit: "ud", kind: "prefab" },
        { name: "Papel de cocina", price: 2.1, qty: 1, unit: "ud", kind: "nonfood" },
      ],
    },
  },
  {
    id: "dia-cesta-grande",
    label: "Dia · cesta grande",
    hint: "Muchos productos y coincidencias",
    detail: {
      store: "Dia",
      date: todayISO(),
      lines: [
        { name: "Pechuga de pollo", price: 4.8, qty: 0.5, unit: "kg", kind: "food" },
        { name: "Arroz", price: 1.05, qty: 1, unit: "kg", kind: "food" },
        { name: "Pasta espaguetis", price: 0.89, qty: 1, unit: "ud", kind: "food" },
        { name: "Tomate frito", price: 0.95, qty: 2, unit: "ud", kind: "food" },
        { name: "Cebolla", price: 0.85, qty: 1, unit: "kg", kind: "food" },
        { name: "Ajo", price: 0.7, qty: 1, unit: "ud", kind: "food" },
        { name: "Pimiento rojo", price: 1.6, qty: 1, unit: "kg", kind: "food" },
        { name: "Leche", price: 0.85, qty: 6, unit: "ud", kind: "food" },
        { name: "Huevos", price: 1.9, qty: 1, unit: "ud", kind: "food" },
        { name: "Servilletas", price: 1.2, qty: 1, unit: "ud", kind: "nonfood" },
      ],
    },
  },
];
