#!/usr/bin/env node
/**
 * Pone la contraseña del usuario de solo lectura `consulta_lectura` (migración
 * 0092, issue #233) y guarda su dirección en la ficha «Supabase lectura» de
 * HoMenu. Lo lanza Pablo, con `!`, después de aplicar la 0092:
 *
 *   node scripts/clave-consulta-lectura.mjs        # dice lo que haría
 *   node scripts/clave-consulta-lectura.mjs --si   # lo hace
 *
 * Cómo lo hace (la contraseña no pasa por la pantalla, los argumentos ni el log
 * de Postgres) y cómo rotarla: scripts/lib/claveRol.mjs.
 */
import { ponerClave } from "./lib/claveRol.mjs";
import { PERFILES, ROL_LECTURA } from "./lib/rolLectura.mjs";

process.exitCode = await ponerClave(PERFILES[ROL_LECTURA], { si: process.argv.includes("--si") });
