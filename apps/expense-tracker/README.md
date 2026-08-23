# MenuPlan — Gastos

Herramienta interna para trackear los gastos de servicios/herramientas del proyecto
(Vercel, Cursor, Midjourney, Claude, etc.): sube facturas (PDF o imagen), Claude las
lee y extrae fecha/importe/servicio/descripción automáticamente, y quedan listadas
en una tabla y galería filtrables con un resumen de gasto por servicio y tendencia
temporal.

Vive en `/apps/expense-tracker` como un proyecto Vite + React + TypeScript
independiente del resto de MenuPlan, pero se construye y sirve como parte del
mismo deploy de Vercel, en `/admin/expenses` (ver `../../vercel.json` y el script
`build:expenses` del `package.json` raíz).

## Desarrollo local

```bash
npm run dev:expenses      # desde la raíz del repo — arranca en http://localhost:5176
# o, dentro de apps/expense-tracker:
npm install && npm run dev
```

El servidor de desarrollo monta `../../api/expense-extract.js` como middleware
(igual que hace `vite.config.js` en la raíz con el resto de endpoints), así que
necesita `ANTHROPIC_API_KEY` (o `VITE_ANTHROPIC_API_KEY`) en el `.env` de la raíz
del repo para poder extraer datos de verdad.

## Datos

Todo se guarda en el navegador (IndexedDB): tanto los archivos originales como los
datos extraídos. No hay backend de persistencia — es intencional, para no tener que
gestionar almacenamiento ni auth de un dataset financiero. Exporta a CSV/JSON desde
la propia app si necesitas sacar los datos de ahí.

## Acceso

`/admin/expenses` no está enlazado desde ningún sitio ni indexado (`noindex`), pero
la URL es adivinable. Como la extracción por IA cuesta dinero (llamadas a la API de
Anthropic), `api/expense-extract.js` admite un código de acceso opcional: si defines
`ADMIN_EXPENSES_TOKEN` en las variables de entorno de Vercel, la app lo pedirá antes
de poder extraer datos de una factura (se guarda en `sessionStorage`, no en el
código). Sin esa variable configurada, la extracción funciona sin código — cómodo
para desarrollo local, pero no lo dejes así en producción si el gasto en API te
preocupa.
