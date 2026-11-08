# El trabajador de Comprar (skill `mercadona`). Se construye desde la raíz del repo. Lleva solo lo que necesita: sin el
# resto del código y sin claves, que le llegan por variable de entorno.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
RUN echo '{"type":"module"}' > package.json && npm install --no-save --ignore-scripts @playwright/test@1.64.1

COPY scripts/mercadona-trabajador.mjs scripts/
COPY scripts/lib/mercadonaTrabajador.mjs scripts/lib/mercadonaPagina.mjs scripts/lib/mercadonaCarro.mjs scripts/lib/
COPY src/lib/mercadonaSello.js src/lib/mercadonaFallos.js src/lib/mercadonaLista.js src/lib/mercadonaAlcance.js src/lib/

USER pwuser
CMD ["node", "scripts/mercadona-trabajador.mjs"]
