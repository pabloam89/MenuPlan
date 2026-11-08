# SSH al servidor: «communication with agent failed» (11 oct 2026)

**2026-10-11 · `ssh` al servidor falla con «sign_and_send_pubkey: signing failed … communication
with agent failed» y «Permission denied (publickey)»; `ssh-add -l` sí lista la llave.**
Causa (visto en el log de 1Password: `ssh authorization prompt timed out` a la hora de
cada intento): la ventana de aprobar la conexión salió y nadie la contestó a tiempo
(Pablo no estaba delante, de madrugada); el cliente `ssh` no distingue eso de un
agente roto. No era el agente, ni la memoria del PC, ni la llave. Sin ventana
contestada, reintentar no sirve. Arreglo: antes de lanzar un `ssh` a Hetzner, avisar
a Pablo («voy a conectar: aprueba en 1Password») y lanzarlo cuando esté; si falla así,
mirar el log (fila de arriba), decir que falta su aprobación y esperar, sin
reintentar en bucle. Con 1Password bloqueado (se desbloquea con la huella o el PIN
de Windows) pasa lo mismo. No comprobado: si «recordar la aprobación hasta que se
cierre 1Password» (Ajustes → Desarrollador → Agente SSH) evita las ventanas; rebaja
la protección de la llave, es decisión de Pablo.

Cronología medida: dos intentos de la sesión a las 08:53 y 08:54 (Madrid) y otro a las 09:00 acabaron en `ssh authorization prompt timed out`; Pablo desbloqueó 1Password a las 09:21 y la `ssh` siguiente entró a la primera. `ssh-add -l` listaba la llave durante todo el rato: lista las llaves sin pedir aprobación; es la firma la que la pide.
