#!/usr/bin/env python3
"""Decodifica un secreto de GitHub Actions guardado en base64 a un archivo.

Uso: decodificar-secreto.py VARIABLE DESTINO TIPO
     TIPO es lo que se espera encontrar: p12 | perfil | p8

Existe por dos motivos:

1. Los logs de Actions solo los puede descargar quien administra el repo, así
   que cuando algo falla aquí hay que explicarlo como anotación (::error::),
   que es pública. Y un secreto mal pegado es, con diferencia, el fallo más
   probable: el portapapeles del Mac solo guarda una cosa, y es fácil pegar el
   contenido de otro comando, un trozo, o el secreto que no era.
2. `base64 --decode` no se comporta igual en todas las versiones de macOS;
   Python sí, así que la decodificación deja de depender de la imagen del
   runner.

Nunca imprime el contenido del secreto: solo su tamaño y qué tipo de archivo
parece, que basta para saber qué hay que volver a pegar.
"""
import base64
import os
import re
import sys

NOMBRES = {
    "p12": "el certificado (.p12)",
    "perfil": "el perfil de aprovisionamiento (.mobileprovision)",
    "p8": "la clave de App Store Connect (.p8)",
    "desconocido": "un archivo de tipo desconocido",
}


def tipo_de(datos: bytes) -> str:
    # El perfil es DER firmado (empieza por 0x30, como el .p12) pero lleva
    # dentro un plist en claro: eso es lo que lo distingue.
    if b"<plist" in datos:
        return "perfil"
    if datos.startswith(b"-----BEGIN"):
        return "p8"
    if datos[:1] == b"\x30":
        return "p12"
    return "desconocido"


def main() -> None:
    variable, destino, esperado = sys.argv[1], sys.argv[2], sys.argv[3]

    def fallo(msg: str) -> None:
        print(f"::error title=Secreto {variable}::{msg}")
        sys.exit(1)

    # Los espacios y saltos de línea nunca son válidos en base64, y es fácil
    # arrastrarlos al pegar: se quitan antes de mirar nada.
    valor = re.sub(r"\s+", "", os.environ.get(variable, ""))
    if not valor:
        fallo("está vacío o no existe. Revisa que el nombre del secreto en GitHub sea exactamente el esperado.")

    raros = sum(1 for c in valor if not re.fullmatch(r"[A-Za-z0-9+/=]", c))
    if raros:
        fallo(
            f"tiene {len(valor)} caracteres y {raros} de ellos no son de base64, así que no es la salida de "
            "'base64 -i ... | pbcopy'. Probablemente se pegó otra cosa: un comando, un nombre de archivo o un mensaje de error."
        )

    try:
        datos = base64.b64decode(valor, validate=True)
    except Exception as err:  # noqa: BLE001 - el mensaje es justo lo que interesa mostrar
        fallo(f"parece base64 ({len(valor)} caracteres) pero está incompleto o cortado ({err}). ¿Se copió solo una parte?")

    tipo = tipo_de(datos)
    if tipo != esperado:
        fallo(
            f"se decodifica bien ({len(datos)} bytes), pero contiene {NOMBRES[tipo]}, no {NOMBRES[esperado]}. "
            "¿Están dos secretos intercambiados?"
        )

    with open(destino, "wb") as f:
        f.write(datos)
    print(f"::notice title=Secreto {variable}::correcto, contiene {NOMBRES[esperado]} ({len(datos)} bytes).")


if __name__ == "__main__":
    main()
