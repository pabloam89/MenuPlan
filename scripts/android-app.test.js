// La app de Android de pruebas (trozo 7 de specs/plan-comprar-mercadona.md).
// Es una app aparte de la de Google Play: la de Play es una TWA con el paquete
// de public/.well-known/assetlinks.json, y esta no puede pisarla.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const gradle = leer("android/app/build.gradle");
const textos = leer("android/app/src/main/res/values/strings.xml");
const manifiesto = leer("android/app/src/main/AndroidManifest.xml");
const paquete = JSON.parse(leer("package.json"));
const enlaces = JSON.parse(leer("public/.well-known/assetlinks.json"));

const idDeLaApp = /applicationId\s+"([^"]+)"/.exec(gradle)?.[1];
const texto = (nombre) => new RegExp(`<string name="${nombre}">([^<]+)</string>`).exec(textos)?.[1];
const mayor = (version) => /(\d+)/.exec(version ?? "")?.[1];

describe("app de Android de pruebas", () => {
  it("tiene su propio paquete, distinto del de la app de Google Play", () => {
    const deGooglePlay = enlaces.map((e) => e.target?.package_name);
    expect(idDeLaApp).toBeTruthy();
    expect(deGooglePlay).not.toContain(idDeLaApp);
  });

  it("los textos de Android dicen el mismo paquete que build.gradle", () => {
    expect(texto("package_name")).toBe(idDeLaApp);
    expect(texto("custom_url_scheme")).toBe(idDeLaApp);
  });

  it("se llama distinto, para no confundirla con la de Google Play en el móvil", () => {
    expect(texto("app_name")).not.toBe("HoMenu");
  });

  it("usa la misma versión mayor de Capacitor que el núcleo", () => {
    const { dependencies } = paquete;
    expect(dependencies["@capacitor/android"]).toBeTruthy();
    expect(mayor(dependencies["@capacitor/android"])).toBe(mayor(dependencies["@capacitor/core"]));
  });

  it("puede salir a internet", () => {
    expect(manifiesto).toContain('android:name="android.permission.INTERNET"');
  });
});
