#!/usr/bin/env node
/**
 * Pone la contraseña del usuario de las copias `copia_lectura` (migración del rol,
 * issue #273) y guarda su dirección en la ficha «Supabase copia» de la bóveda
 * «Panel HoMenu» (no en HoMenu: este rol lee los usuarios de auth, y la service
 * account del PC lee HoMenu sin preguntar). Lo lanza Pablo, con `!`, después de
 * aplicar su migración (PERFILES); pide aprobar en 1Password:
 *
 *   node scripts/clave-copia-lectura.mjs        # dice lo que haría
 *   node scripts/clave-copia-lectura.mjs --si   # lo hace
 *
 * Luego la dirección se sube al servidor por tubería (skill hetzner, «Copias de
 * la base: instalar», paso 4). Cómo lo hace y cómo rotarla: scripts/lib/claveRol.mjs.
 */
import { ponerClave } from "./lib/claveRol.mjs";
import { PERFILES, ROL_COPIA } from "./lib/rolLectura.mjs";

process.exitCode = await ponerClave(PERFILES[ROL_COPIA], { si: process.argv.includes("--si") });
