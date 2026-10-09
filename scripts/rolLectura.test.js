import { describe, it, expect } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import sasl from "pg/lib/crypto/sasl";
import { OP_LECTURA, ROL_LECTURA, VAR_ADMIN, VAR_LECTURA, claveNueva, conexionDeConsulta, estadoFicha, fichaLectura, motivoUsuarioIncorrecto, urlLectura, verificadorScram } from "./lib/rolLectura.mjs";

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

  it("la ficha de 1Password lleva la dirección en el campo que lee OP_LECTURA", () => {
    const ficha = JSON.parse(fichaLectura("clave", "postgresql://u:clave@h/db"));
    const [, boveda, titulo, campo] = /^op:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(OP_LECTURA);
    expect(boveda).toBe("HoMenu-sesiones");
    expect(ficha.title).toBe(titulo);
    expect(ficha.fields.find((f) => f.label === campo)).toMatchObject({ type: "CONCEALED", value: "postgresql://u:clave@h/db" });
  });

  it("plan B: sin la conexión de lectura, la de administrador con aviso", () => {
    const env = (v) => (k) => v[k];
    expect(conexionDeConsulta(env({ [VAR_LECTURA]: "L", [VAR_ADMIN]: "A" }))).toEqual({ url: "L", aviso: null, rol: ROL_LECTURA });
    const sin = conexionDeConsulta(env({ [VAR_ADMIN]: "A" }));
    expect(sin.url).toBe("A");
    expect(sin.aviso).toMatch(/administrador/);
  });

  it("con la dirección de lectura, solo vale entrar como consulta_lectura (juez de seguridad)", () => {
    // SUPABASE_DB_URL_LECTURA=op://HoMenu/Supabase/SUPABASE_DB_URL entraría como postgres.
    const { rol } = conexionDeConsulta((k) => (k === VAR_LECTURA ? "L" : "A"));
    expect(motivoUsuarioIncorrecto(rol, "postgres")).toMatch(/como «postgres»/);
    expect(motivoUsuarioIncorrecto(rol, ROL_LECTURA)).toBe(null);
    // Plan B: no se espera ningún rol (ya avisa de que entra como administrador).
    const sin = conexionDeConsulta((k) => (k === VAR_ADMIN ? "A" : undefined));
    expect(motivoUsuarioIncorrecto(sin.rol, "postgres")).toBe(null);
  });

  it("op item get: solo un «no existe» claro deja crear la ficha", () => {
    expect(estadoFicha({ status: 0, stderr: "" })).toBe("existe");
    expect(estadoFicha({ status: 1, stderr: '[ERROR] 2026/10/09 06:59:14 "Supabase lectura" isn\'t an item in the "HoMenu" vault. Specify the item with its UUID, name, or domain.' })).toBe("no-existe");
    for (const r of [
      { status: 1, stderr: '[ERROR] "NoExisteBoveda" isn\'t a vault in this account.' },
      { status: 1, stderr: "[ERROR] You are not currently signed in." },
      { status: 1, stderr: "" },
      { status: null, error: Object.assign(new Error("spawn op ENOENT"), { code: "ENOENT" }) },
    ]) expect(estadoFicha(r), JSON.stringify(r)).toBe("error");
  });

  it("configurada pero ilegible: falla, no cae al administrador (juez de seguridad)", () => {
    // SUPABASE_DB_URL_LECTURA=op://HoMenu/Supabase/no-existe npm run consulta
    const leidas = [];
    const leer = (k) => {
      leidas.push(k);
      if (k === VAR_LECTURA) throw new Error("No pude leer de 1Password");
      return "A";
    };
    expect(() => conexionDeConsulta(leer)).toThrow(/no la puedo leer/);
    expect(leidas).not.toContain(VAR_ADMIN);
  });
});
