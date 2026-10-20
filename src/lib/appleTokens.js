import { supabase } from "./supabase.js";

/**
 * Guarda el refresh token que Apple devuelve al iniciar sesión.
 *
 * Apple obliga a revocar ese token cuando el usuario borra su cuenta (la misma
 * regla que exige el borrado en sí, 5.1.1(v)), y para revocarlo hay que
 * tenerlo. Supabase NO lo persiste: lo entrega en la sesión en el momento del
 * login y ahí se acaba, así que si no lo copiamos aquí, se pierde.
 *
 * Dos detalles que no son opcionales:
 *
 *   - Apple solo manda refresh token en la PRIMERA autorización. En los
 *     inicios de sesión siguientes llega vacío, y sobrescribir con vacío nos
 *     dejaría sin nada que revocar el día del borrado. Por eso no se guarda
 *     cuando no viene.
 *   - La tabla no se toca desde el cliente (sin políticas ni permisos: es una
 *     credencial). Se guarda con la función `guardar_apple_refresh_token`
 *     (0099), que escribe solo la fila de quien llama (`auth.uid()`). No se usa
 *     `upsert`: caer en la rama de update exige una política de select, que
 *     esta tabla no tiene a propósito. Quien la lee es `api/delete-account.js`
 *     con la service-role key.
 *
 * Fallar aquí no puede romper el login: se avisa por consola y se sigue. Eso
 * incluye que la migración aún no esté aplicada (la función no existiría).
 */
export async function rememberAppleRefreshToken(session) {
  const provider = session?.user?.app_metadata?.provider;
  const refreshToken = session?.provider_refresh_token;
  if (!supabase || provider !== "apple" || !refreshToken) return;

  const { error } = await supabase.rpc("guardar_apple_refresh_token", { p_token: refreshToken });
  if (error) console.warn("[auth] no se pudo guardar el token de Apple", error.message);
}
