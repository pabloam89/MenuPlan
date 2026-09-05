import { Config } from '@remotion/cli/config';

// El bundle real de la app usa top-level await en src/data/recipeCatalog.js
// (carga el catálogo desde Supabase, con fallback local si falla). El target
// esbuild por defecto de Remotion (chrome85) no soporta esa sintaxis; lo
// subimos solo para el bundle de vídeo, sin tocar el build de Vite de la app.
Config.overrideWebpackConfig((config) => ({
  ...config,
  module: {
    ...config.module,
    rules: config.module.rules.map((rule) => {
      const isJsRule = rule.test && /jsx|tsx/.test(String(rule.test));
      if (!isJsRule || !Array.isArray(rule.use)) return rule;
      return {
        ...rule,
        use: rule.use.map((u) =>
          u && u.loader && u.loader.includes('esbuild-loader')
            ? { ...u, options: { ...u.options, target: 'es2022' } }
            : u,
        ),
      };
    }),
  },
}));
