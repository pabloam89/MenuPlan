/**
 * Regla local: usar una variable ANTES de declararla, cuando eso se ejecuta
 * de verdad.
 *
 * En un día se nos colaron cuatro fallos de esta familia hasta producción
 * (`members`, `viewingMine`…). Todos con la misma forma y el mismo desenlace:
 * la pantalla entera revienta con "Cannot access X before initialization", y
 * el build no dice nada porque el código es sintácticamente correcto.
 *
 * ── Por qué no vale la regla de serie ────────────────────────────────────
 * `no-use-before-define` marca TAMBIÉN los casos inofensivos, que en esta
 * app son la mayoría: las constantes de estilo viven al final del fichero y
 * se usan dentro de componentes escritos más arriba. Eso es seguro — el
 * componente se ejecuta mucho después de que el módulo termine de evaluarse.
 * Con ese ruido, la regla se acaba desactivando y no protege de nada.
 *
 * ── Qué marca esta ───────────────────────────────────────────────────────
 * Solo cuando entre la referencia y la declaración NO hay una función de por
 * medio, es decir cuando la lectura ocurre en el mismo turno de ejecución:
 *
 *   const dep = [viewingMine];          ← revienta: se evalúa YA
 *   useEffect(() => {...}, [viewingMine]);  ← revienta: el array, no el callback
 *   const [viewingMine] = useState(false);
 *
 * Y deja pasar lo que sí es seguro:
 *
 *   function Card() { return <div style={row} />; }   ← ok: corre después
 *   const row = { ... };
 *
 * El caso que más engaña es el array de dependencias de un hook: parece
 * "dentro" del efecto, pero se evalúa en el render, antes que el callback.
 */

export const noTdzInBody = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prohíbe leer una variable antes de su declaración cuando la lectura ocurre en el mismo turno (sin función de por medio)",
    },
    schema: [],
    messages: {
      tdz:
        "'{{name}}' se usa aquí pero se declara más abajo (línea {{line}}). Esto se evalúa antes de que exista: reventará en tiempo de ejecución con \"Cannot access '{{name}}' before initialization\".",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * Metodos que llaman a su callback EN EL ACTO, no mas tarde.
     *
     * Es el mismo engaño que el array de dependencias de un hook, con otra
     * cara: `lista.reduce((a, x) => f(x), 0)` parece que mete una funcion de
     * por medio, y la mete, pero esa funcion se ejecuta antes de que termine
     * la linea. Asi que la variable que lea tiene que existir YA.
     *
     * Sin esto la regla dejaba pasar exactamente eso y la pantalla de tandas
     * murio en produccion con "Cannot access before initialization".
     */
    const EN_EL_ACTO = new Set([
      "map", "filter", "reduce", "reduceRight", "forEach", "find", "findIndex",
      "findLast", "findLastIndex", "some", "every", "flatMap", "sort", "at",
    ]);

    /** ¿Esta funcion se ejecuta en el acto, en vez de guardarse para luego? */
    function corregidaEnElActo(bloque) {
      const padre = bloque?.parent;
      if (padre?.type !== "CallExpression") return false;
      // Una funcion invocada al vuelo: (() => {...})()
      if (padre.callee === bloque) return true;
      // O pasada como argumento a un metodo que la llama ya.
      if (!padre.arguments?.includes(bloque)) return false;
      const callee = padre.callee;
      if (callee?.type !== "MemberExpression" || callee.computed) return false;
      return EN_EL_ACTO.has(callee.property?.name);
    }

    /**
     * ¿Hay una frontera de función entre `from` y el ámbito de la variable?
     *
     * Una que PROTEJA, se entiende: la que se guarda para ejecutarse despues.
     * Las que corren en el acto no protegen de nada y se atraviesan.
     */
    function functionBoundaryBetween(from, target) {
      for (let s = from; s && s !== target; s = s.upper) {
        if (s.type === "class-field-initializer") return true;
        if (s.type === "function" && !corregidaEnElActo(s.block)) return true;
      }
      return false;
    }

    function checkScope(scope) {
      for (const variable of scope.variables) {
        const def = variable.defs[0];
        // Solo const/let: `var` se eleva y las funciones también.
        if (!def || def.type !== "Variable") continue;
        const kind = def.parent?.kind;
        if (kind !== "const" && kind !== "let") continue;

        const declStart = def.name.range[0];
        for (const ref of variable.references) {
          if (ref.identifier.range[0] >= declStart) continue;
          if (functionBoundaryBetween(ref.from, scope)) continue;
          context.report({
            node: ref.identifier,
            messageId: "tdz",
            data: {
              name: variable.name,
              line: String(sourceCode.getLocFromIndex(declStart).line),
            },
          });
        }
      }
      scope.childScopes.forEach(checkScope);
    }

    return {
      Program(node) {
        checkScope(sourceCode.getScope(node));
      },
    };
  },
};
