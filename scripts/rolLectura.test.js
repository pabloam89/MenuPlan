import { describe, it, expect } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import sasl from "pg/lib/crypto/sasl";
import { ROL_LECTURA, VAR_ADMIN, VAR_LECTURA, claveNueva, conexionDeConsulta, urlLectura, verificadorScram } from "./lib/rolLectura.mjs";

/**
 * Hace de servidor Postgres con el verificador y deja que el cliente SCRAM de
 * `pg` (otra implementación, la que usa consulta.mjs) se autentique contra él.
 */
async function entra(verificador, clave) {
  const m = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(verificador);
  if (!m) return false;
  const [, iter, sal, stored, serverKey] = m;
  const sesion = sasl.startSession(["SCRAM-SHA-256"]);
  const nonce = sesion.clientNonce + randomBytes(18).toString("base64");
  const primero = `r=${nonce},s=${sal},i=${iter}`;
  await sasl.continueSession(sesion, clave, primero);
  const sinPrueba = sesion.response.replace(/,p=[^,]+$/, "");
  const prueba = Buffer.from(/,p=([^,]+)$/.exec(sesion.response)[1], "base64");
  const auth = `n=*,r=${sesion.clientNonce},${primero},${sinPrueba}`;
  const firmaCliente = createHmac("sha256", Buffer.from(stored, "base64")).update(auth).digest();
  const clienteKey = Buffer.from(prueba.map((b, i) => b ^ firmaCliente[i]));
  if (createHash("sha256").update(clienteKey).digest("base64") !== stored) return false;
  const firmaServidor = createHmac("sha256", Buffer.from(serverKey, "base64")).update(auth).digest("base64");
  sasl.finalizeSession(sesion, `v=${firmaServidor}`); // lanza si el cliente no reconoce al servidor
  return true;
}

describe("usuario de solo lectura (0092, issue #233)", () => {
  it("el verificador SCRAM deja entrar con su contraseña y no con otra", async () => {
    const clave = claveNueva();
    const v = verificadorScram(clave);
    expect(v).not.toContain(clave);
    expect(await entra(v, clave)).toBe(true);
    expect(await entra(v, claveNueva())).toBe(false);
  });

  it("la contraseña nueva es larga y no necesita escaparse en una URL", () => {
    const clave = claveNueva();
    expect(clave.length).toBeGreaterThanOrEqual(40);
    expect(encodeURIComponent(clave)).toBe(clave);
  });

  it("la dirección de lectura cambia el usuario y la contraseña, y nada más", () => {
    const pooler = new URL(urlLectura("postgresql://postgres.abcdefghij:viejo@aws-1-x.pooler.supabase.com:5432/postgres", "nueva"));
    expect(decodeURIComponent(pooler.username)).toBe(`${ROL_LECTURA}.abcdefghij`);
    expect(pooler.password).toBe("nueva");
    expect(pooler.host).toBe("aws-1-x.pooler.supabase.com:5432");
    expect(pooler.pathname).toBe("/postgres");
    const directa = new URL(urlLectura("postgresql://postgres:viejo@db.abcdefghij.supabase.co:5432/postgres", "nueva"));
    expect(directa.username).toBe(ROL_LECTURA);
  });

  it("plan B: sin la conexión de lectura, la de administrador con aviso", () => {
    const env = (v) => (k) => v[k];
    expect(conexionDeConsulta(env({ [VAR_LECTURA]: "L", [VAR_ADMIN]: "A" }))).toEqual({ url: "L", aviso: null });
    const sin = conexionDeConsulta(env({ [VAR_ADMIN]: "A" }));
    expect(sin.url).toBe("A");
    expect(sin.aviso).toMatch(/administrador/);
    // La dirección op:// está en .env.local pero 1Password aún no tiene el campo.
    const rota = conexionDeConsulta((k) => {
      if (k === VAR_LECTURA) throw new Error("No pude leer de 1Password");
      return "A";
    });
    expect(rota.url).toBe("A");
    expect(rota.aviso).toMatch(/no pude leer/);
  });
});
