/**
 * Genera el "client secret" de Sign in with Apple.
 *
 *   node scripts/apple-client-secret.mjs ruta/AuthKey_XXXXXXXXXX.p8
 *
 * Apple no usa un secreto fijo: usa un JWT ES256 firmado con la clave .p8 que
 * descargas del portal. Supabase pide ese JWT en el campo "Secret Key" del
 * proveedor Apple, y api/delete-account.js fabrica el suyo en cada llamada
 * para revocar el token al borrar una cuenta.
 *
 * CADUCA. Apple no admite más de 6 meses (aquí se piden justo 6), así que hay
 * que volver a ejecutar esto y repegar el resultado en Supabase antes de que
 * expire. El día que caduque, los logins con Apple dejan de funcionar.
 *
 * La clave no sale de tu máquina: se lee del fichero, se firma en local y solo
 * se imprime el JWT.
 *
 * Variables (o se piden por argumento):
 *   APPLE_TEAM_ID      — 64QZ74Y5M2
 *   APPLE_KEY_ID       — el Key ID de la .p8
 *   APPLE_SERVICES_ID  — el Services ID, NO el bundle id
 */
import { readFileSync } from "fs";
import crypto from "node:crypto";

const SEIS_MESES = 60 * 60 * 24 * 180;

const p8Path = process.argv[2];
const teamId = process.env.APPLE_TEAM_ID || process.argv[3];
const keyId = process.env.APPLE_KEY_ID || process.argv[4];
const servicesId = process.env.APPLE_SERVICES_ID || process.argv[5];

if (!p8Path || !teamId || !keyId || !servicesId) {
  console.error(
    "Uso: node scripts/apple-client-secret.mjs <ruta.p8> [teamId] [keyId] [servicesId]\n" +
      "     (o define APPLE_TEAM_ID, APPLE_KEY_ID y APPLE_SERVICES_ID)",
  );
  process.exit(1);
}

const base64url = (input) => Buffer.from(input).toString("base64url");
const now = Math.floor(Date.now() / 1000);

const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
const payload = base64url(
  JSON.stringify({
    iss: teamId,
    iat: now,
    exp: now + SEIS_MESES,
    aud: "https://appleid.apple.com",
    sub: servicesId,
  }),
);

// `dsaEncoding: "ieee-p1363"` da la firma cruda r||s que espera JOSE. Sin eso,
// crypto devuelve DER y Apple responde invalid_client sin más explicación.
const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
  key: crypto.createPrivateKey(readFileSync(p8Path, "utf8")),
  dsaEncoding: "ieee-p1363",
});

console.log(`${header}.${payload}.${signature.toString("base64url")}`);
console.error(`\nCaduca el ${new Date((now + SEIS_MESES) * 1000).toISOString().slice(0, 10)}.`);
