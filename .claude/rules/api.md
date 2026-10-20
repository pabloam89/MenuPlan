---
paths:
  - "api/*.js"
---

# Endpoints de `api/`

- **Un endpoint nuevo lo revisa, antes del PR, alguien que no lo escribió**,
  mirando la seguridad: autenticación, RLS o service role, límites y coste.
- Modelos: Anthropic para texto, Gemini para imágenes.
- Los secretos llegan por variable de entorno; nunca escritos en el código ni
  en un log. Dónde vive cada uno, en `ops/INVENTARIO.md`.
- Las funciones van en `fra1`, al lado de Supabase (`vercel.json`).
