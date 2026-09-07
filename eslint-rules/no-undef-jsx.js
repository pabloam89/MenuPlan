/**
 * Regla local: usar un componente JSX que no está definido ni importado.
 *
 * `no-undef` NO cubre esto. Para ESLint, `<BlockIcon />` es un JSXIdentifier,
 * no una referencia normal, así que la regla de serie lo ignora — de eso se
 * encarga `react/jsx-no-undef`, y aquí no está eslint-plugin-react.
 *
 * El agujero es caro: es EXACTAMENTE la familia que nos ha tumbado
 * producción varias veces (`FeedScreen`, `loadPublicRecipe`,
 * `ensureSocialProfile`, `BlockIcon`), siempre igual — código que se mueve de
 * sitio, o un import que se poda de más, y el build compila porque JSX
 * transpila a una llamada a función perfectamente válida. Revienta al pintar.
 *
 * El caso que más engaña es el alias: `Ban as BlockIcon` es UN solo binding
 * llamado `BlockIcon`. Una limpieza de imports que trocee por comas y busque
 * "Ban as BlockIcon" en el cuerpo no lo encuentra nunca, lo da por muerto y
 * lo borra. Nadie se entera hasta que alguien abre esa pantalla.
 *
 * Se ignoran los nombres en minúscula (`<div>`, `<span>`): son etiquetas de
 * HTML, no identificadores.
 */
export const noUndefJsx = {
  meta: {
    type: "problem",
    docs: { description: "Prohíbe usar un componente JSX que no está en el ámbito" },
    schema: [],
    messages: {
      undef:
        "'{{name}}' se usa como componente JSX pero no está definido ni importado. El build NO lo ve (JSX compila a una llamada válida): reventará al pintar esta pantalla.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** El nombre raíz de <A.B.C /> es `A`; el de <A /> es `A`. */
    function rootName(node) {
      let n = node;
      while (n.type === "JSXMemberExpression") n = n.object;
      return n.type === "JSXIdentifier" ? n.name : null;
    }

    function resolves(name, scope) {
      for (let s = scope; s; s = s.upper) {
        if (s.variables.some((v) => v.name === name)) return true;
        if (s.through.some((r) => r.identifier.name === name && r.resolved)) return true;
      }
      return false;
    }

    return {
      JSXOpeningElement(node) {
        const name = rootName(node.name);
        // Etiquetas HTML y fragmentos: no son identificadores.
        if (!name || !/^[A-Z_$]/.test(name)) return;
        const scope = sourceCode.getScope(node);
        if (resolves(name, scope)) return;
        context.report({ node: node.name, messageId: "undef", data: { name } });
      },
    };
  },
};
