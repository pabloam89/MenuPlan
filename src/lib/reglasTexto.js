/**
 * Las reglas dichas en cristiano, en un módulo sin dependencias: lo usa la
 * ficha de la casa del bot (api/_bot/ficha.js), que no puede cargar el motor
 * entero en cada mensaje. Antes vivía en reglas.js, que arrastra el catálogo.
 */
const ETIQUETA_EFECTO = {
  excluir: "sin",
  presente: "come",
  sesgo: "ajusta",
};

/**
 * La regla en cristiano, para el recibo de la UI. Se compone de los datos, no
 * de un texto guardado: así renombrar a alguien renombra su regla sola.
 */
export function describirRegla(regla, data) {
  if (!regla) return "";
  const quien = (() => {
    const s = regla.sujeto;
    // «En casa sin carne», pero «Toda la casa come fuera».
    if (s.tipo === "casa") return regla.efecto.tipo === "presente" ? "Toda la casa" : "En casa";
    if (s.tipo === "invitado") return s.n > 1 ? `${s.n} invitados` : (s.nombre ?? "Un invitado");
    if (s.tipo === "grupo") {
      return (data?.groups ?? []).find((g) => g.id === s.ref)?.label ?? "Un menú";
    }
    const m = (data?.members ?? []).find((x) => x.id === s.ref);
    return m?.name || "Alguien";
  })();

  const que = (() => {
    if (regla.efecto.tipo === "excluir") {
      // «grupo:carne» → «carne», «tecnica:sarten» → «fritos» (lib/excluirHueco.js;
      // copiado aquí a propósito, que este módulo no carga nada).
      const v = String(regla.efecto.valor);
      const legible = v.startsWith("grupo:") ? v.slice(6).replace("_", " ")
        : v.startsWith("tecnica:") ? ({ sarten: "fritos", olla: "guisos" }[v.slice(8)] ?? v.slice(8))
          : v;
      return `${ETIQUETA_EFECTO.excluir} ${legible}`;
    }
    if (regla.efecto.tipo === "presente") {
      // «2 invitados comen», no «come».
      const verbo = regla.sujeto.tipo === "invitado" && regla.sujeto.n > 1 ? "comen" : ETIQUETA_EFECTO.presente;
      return `${verbo} ${regla.efecto.valor === "casa" ? "en casa" : regla.efecto.valor}`;
    }
    const { campo, valor, peso } = regla.efecto.valor;
    return `${peso >= 0 ? "más" : "menos"} ${valor} (${campo})`;
  })();

  const donde = (() => {
    const partes = [];
    if (regla.ambito?.dias) partes.push(`los ${regla.ambito.dias.join(", ")}`);
    if (regla.ambito?.comidas) partes.push(`en ${regla.ambito.comidas.join(" y ").toLowerCase()}`);
    if (regla.ambito?.semanas) partes.push(regla.ambito.semanas.length === 1 ? "solo esa semana" : "solo esas semanas");
    return partes.join(" ");
  })();

  // Un solo día («hoy cenamos fuera»): «solo el 2026-10-03», no «hasta el».
  const { desde, hasta } = regla.vigencia ?? {};
  const cuando = hasta ? (desde === hasta ? `solo el ${hasta}` : `hasta el ${hasta}`) : "";
  const salvo = regla.salvedad?.dias ? `salvo los ${regla.salvedad.dias.join(", ")}` : "";

  return [quien, que, donde, salvo, cuando].filter(Boolean).join(" ");
}
