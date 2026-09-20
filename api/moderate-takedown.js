import { TARGETS, supabaseConfig, verifyReportToken } from "./_moderation.js";

// Retirar contenido reportado, desde el enlace del correo de aviso.
//
// Se abre desde el móvil, sin sesión y sin panel: eso es lo que hace que
// responder a un reporte cueste dos toques en vez de abrir Supabase. Lo que lo
// protege es la firma del enlace (ver api/_moderation.js), no una cookie.
//
// GET y no POST a propósito, porque lo que lo invoca es un clic en un correo.
// El precio es que cualquier precargador de enlaces que visite la URL ejecuta
// la retirada; se asume, porque el enlace solo existe dentro del buzón de quien
// modera y la acción es reversible: un comentario borrado es el único caso
// irreversible, y el resto solo pasa a privado.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const reportId = String(req.query?.r ?? "").trim();
  const token = String(req.query?.t ?? "").trim();
  if (!reportId || !verifyReportToken(reportId, token)) {
    return pagina(res, 403, "Enlace no válido", "Este enlace no es válido o ha sido manipulado.");
  }

  const config = supabaseConfig();
  if (!config) {
    console.error("[takedown] sin credenciales de Supabase");
    return pagina(res, 500, "Error del servidor", "No se pudo conectar con la base de datos.");
  }

  const cabeceras = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };

  let report;
  try {
    const lookup = await fetch(
      `${config.url}/rest/v1/content_reports?id=eq.${encodeURIComponent(reportId)}&select=id,target_type,target_id,status`,
      { headers: cabeceras },
    );
    report = lookup.ok ? (await lookup.json())?.[0] : null;
  } catch (err) {
    console.error("[takedown] lectura del reporte lanzó", err?.name, err?.message);
  }
  if (!report) return pagina(res, 404, "Reporte no encontrado", "Puede que ya se haya resuelto.");

  const destino = TARGETS[report.target_type];
  if (!destino) {
    console.error("[takedown] tipo de contenido desconocido:", report.target_type);
    return pagina(res, 400, "Tipo desconocido", `No se sabe dónde vive un "${report.target_type}".`);
  }

  const filtro = `${destino.column}=eq.${encodeURIComponent(report.target_id)}`;
  try {
    const accion = await fetch(`${config.url}/rest/v1/${destino.table}?${filtro}`, {
      method: destino.action === "delete" ? "DELETE" : "PATCH",
      headers: cabeceras,
      body: destino.action === "delete" ? undefined : JSON.stringify({ visibility: "private" }),
    });
    if (!accion.ok) {
      console.error("[takedown] la retirada falló", accion.status, (await accion.text()).slice(0, 300));
      return pagina(res, 502, "No se pudo retirar", "El contenido sigue publicado. Mira los logs.");
    }
  } catch (err) {
    console.error("[takedown] la retirada lanzó", err?.name, err?.message);
    return pagina(res, 502, "No se pudo retirar", "El contenido sigue publicado. Mira los logs.");
  }

  // Marcar el reporte va DESPUÉS de retirar: si lo marcase antes y la retirada
  // fallara, el reporte quedaría cerrado con el contenido todavía publicado.
  try {
    await fetch(`${config.url}/rest/v1/content_reports?id=eq.${encodeURIComponent(reportId)}`, {
      method: "PATCH",
      headers: cabeceras,
      body: JSON.stringify({ status: "reviewed" }),
    });
  } catch (err) {
    console.error("[takedown] no se pudo marcar el reporte como revisado", err?.name, err?.message);
  }

  const verbo = destino.action === "delete" ? "borrado" : "pasado a privado";
  return pagina(res, 200, "Contenido retirado", `El contenido se ha ${verbo} y el reporte queda como revisado.`);
}

function pagina(res, status, titulo, detalle) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(status).send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo} — HoMenu</title></head>
<body style="margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fbfbf8;color:#223026">
<main style="max-width:460px;margin:0 auto;text-align:center">
<h1 style="font-size:20px;margin:0 0 8px">${titulo}</h1>
<p style="font-size:15px;line-height:1.6;color:#5a6b5f;margin:0">${detalle}</p>
</main></body></html>`);
}
