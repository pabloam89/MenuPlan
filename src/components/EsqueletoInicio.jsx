// El mismo esqueleto que trae index.html, con sus clases: sin salto al montar.
export function EsqueletoInicio() {
  return (
    <div className="esq" role="status" aria-label="Cargando">
      <div className="esq-b esq-saludo" />
      <div className="esq-avatares">
        <div className="esq-b esq-avatar" />
        <div className="esq-b esq-avatar" />
        <div className="esq-b esq-avatar" />
      </div>
      <div className="esq-b esq-tarjeta" />
      <div className="esq-b esq-banner" />
      <div className="esq-b esq-linea" />
      <div className="esq-nav" />
    </div>
  );
}
