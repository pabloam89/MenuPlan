# Si Claude no está

Para una persona (Pablo o Álvaro) que tiene que entrar a los servicios de
MenuPlan, o frenar a los agentes, sin ninguna sesión de Claude de por medio.
Solo nombres de ficha y enlaces: **ningún valor de clave** (repo público). Qué
servicio es de quién y dónde está cada clave: `ops/INVENTARIO.md`. Lo que solo se
ve en un panel y no se ha comprobado desde el repo va marcado «sin comprobar».

## Si algo va mal, en este orden

1. **Parar a los agentes.** Cierra las sesiones de Claude abiertas (cada una
   es una carpeta `C:\dev\MenuPlan-<tarea>`). Las sesiones de la nube y los
   crons siguen solos: los pasos 3 y 4 los cortan.
2. **Cortar la identidad de las sesiones en GitHub.** La App `homenu-sesiones`
   da tokens de 1 hora. En GitHub → Settings → Developer settings → GitHub Apps →
   `homenu-sesiones`: borrar las claves privadas y, para cortar ya los tokens
   vivos, suspender la instalación. Orden completo, en
   `.claude/skills/github/referencias/app-sesiones.md` (apartado «Seguridad»).
   Cuál de los dos botones corta un token vivo al instante: sin comprobar.
3. **Cortar un workflow.** Repo → Actions → el workflow → «Disable workflow»
   (o `gh workflow disable <fichero.yml>`). Los que tocan secretos o escriben en
   el repo son `mercadona-sync`, `dependabot-auto`, `vigia-lola` y `agente-fallos`
   (lista y qué hace cada uno, en la skill `github`). Para cancelar un run en
   curso: la pestaña Actions o `gh run cancel <id>`.
4. **Cortar la lectura de las claves de las sesiones.** En 1Password.com →
   Developer → Service accounts, anular «MenuPlan sesiones». Si se sospecha de una
   clave concreta, rotarla (skill `alta-de-secreto`) y revocar la vieja en su
   servicio después de comprobar la nueva.
5. **Mirar qué hizo el bot**: `gh pr list --state all --limit 20`, las últimas
   ramas y los runs de Actions. `main` solo admite PR con el check `tests` en
   verde y `staging` también (sin force push ni borrado).
6. **Producción rota**: Vercel → proyecto `homenu` → Deployments → «Instant
   Rollback» al último bueno.
7. **Apuntarlo**: un issue de decisión (sin detalles que ayuden a atacar) y una
   fila en `ops/DECISIONES.md`.

## Cómo se entra a cada sitio

| Servicio | Cómo entra una persona | Qué hay que tener |
|---|---|---|
| **GitHub** (`pabloam89/MenuPlan`) | github.com con su cuenta personal (Pablo: `pabloam89`; Álvaro: `algbarc`). Escribir en el repo lo pueden hacer los dos; los ajustes (ramas, rulesets, Apps, secretos) solo el dueño | Sesión de la web o `gh auth login`. Las sesiones de Claude no usan la cuenta de Pablo, usan la App |
| **Vercel** (equipo «menuplan», proyecto `homenu`) | vercel.com con la cuenta de Pablo o de Álvaro (los dos son Owners) | Inicio de sesión de Vercel. La CLI no tiene sesión abierta: `npx vercel login` y `logout` al acabar. Skill `vercel` |
| **Supabase** (`mdzwbrworucnummibxrq`) | No hay cuenta propia: cuelga del equipo de Vercel. Vercel → Storage → «MenuPlan» → Open in Supabase | Poder entrar a Vercel como Owner. Skill `supabase` |
| **Hetzner Cloud** (proyecto `HoMenu`, servidor `HoMenu-Panel`) | console.hetzner.cloud con la cuenta de Pablo; si no hay red, la consola web del propio servidor entra sin red | Ficha `Hetzner` en la bóveda `Private` de Pablo (con 2FA y códigos de recuperación). Solo Pablo. Skill `hetzner` |
| **Tailscale** | login.tailscale.com con Google (cuenta de Pablo) | Solo Pablo; Álvaro no está invitado. Skill `tailscale` |
| **1Password** | my.1password.eu, cuenta de Pablo (plan Familias). Álvaro tiene acceso a la bóveda `HoMenu` (sin comprobar hoy) | La contraseña maestra y la Secret Key de Pablo, fuera del repo. Bóvedas y qué lee cada cuenta de servicio: `ops/INVENTARIO.md` y skill `1password` |

## Qué no hay que hacer sin Claude

- Pegar una clave en un comando, un issue o un chat: se pasa por tubería desde
  1Password (skill `alta-de-secreto`).
- Subir directo a `main` o a `staging`: no se puede; todo va por PR.
- Aplicar una migración a mano contra la base: es la de producción (skill
  `supabase`, regla `migraciones`).

Sin comprobar: que Álvaro pueda hacer solo cada paso de arriba (sobre todo los de
1Password y GitHub Apps, que dependen de su rol), y que haya una copia de la
contraseña maestra y de la Secret Key de 1Password fuera de la cuenta, en papel
o con una persona de confianza. Eso lo ve solo Pablo.
