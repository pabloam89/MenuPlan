import { blocked, cors } from "./_guard.js";
import { BASE_URL, signReport, supabaseConfig } from "./_moderation.js";

// Aviso de que alguien ha reportado contenido.
//
// La Guideline 1.2 no se conforma con que exista un botón de reportar: pide
// actuar sobre lo reportado en un plazo razonable. Sin que nada avise, los
// reportes se quedaban en su tabla esperando a que alguien entrase a mirar —
// que es justo lo que ReportSheet.jsx admitía en su docstring.
//
// Lo dispara un trigger de Postgres al insertarse la fila (migración 0054).
// El trigger manda SOLO el id: así no hay ningún secreto guardado en la base
// ni en el repo. Todo lo demás se lee aquí con la service-role key.
//
// Sin RESEND_API_KEY no falla: escribe el aviso completo en el log de Vercel.
// Peor que un correo, pero infinitamente mejor que perderlo.
const REASONS = {
  spam: "Spam o publicidad",
  inappropriate: "Contenido inapropiado",
  harassment: "Acoso o insultos",
  other: "Otro motivo",
};

const DESTINATARIO = process.env.MODERATION_EMAIL || "team@menuplanai.com";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // El id de un reporte es un uuid: adivinarlo no es realista, y aun
  // acertando lo único que se consigue es un correo sobre un reporte de
  // verdad. El límite está para que eso no se convierta en un grifo.
  if (await blocked(req, res, { bucket: "report-alert", limit: 60, windowSec: 600 })) return;

  const id = String(req.body?.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "id required" });

  const config = supabaseConfig();
  if (!config) {
    console.error("[report-alert] sin credenciales de Supabase");
    return res.status(500).json({ error: "Servidor mal configurado." });
  }

  let report;
  try {
    const url = `${config.url}/rest/v1/content_reports?id=eq.${encodeURIComponent(id)}&select=id,target_type,target_id,reason,note,created_at,status`;
    const lookup = await fetch(url, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    if (!lookup.ok) {
      console.error("[report-alert] lectura del reporte falló", lookup.status);
      return res.status(502).json({ error: "No se pudo leer el reporte." });
    }
    report = (await lookup.json())?.[0];
  } catch (err) {
    console.error("[report-alert] lectura del reporte lanzó", err?.name, err?.message);
    return res.status(502).json({ error: "No se pudo leer el reporte." });
  }

  if (!report) return res.status(404).json({ error: "Reporte no encontrado." });

  const token = signReport(report.id);
  const enlace = token
    ? `${BASE_URL}/api/moderate-takedown?r=${encodeURIComponent(report.id)}&t=${token}`
    : null;

  const motivo = REASONS[report.reason] ?? report.reason;
  const lineas = [
    `Tipo de contenido: ${report.target_type}`,
    `Id del contenido: ${report.target_id}`,
    `Motivo: ${motivo}`,
    report.note ? `Nota de quien reporta: ${report.note}` : null,
    `Fecha: ${report.created_at}`,
  ].filter(Boolean);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[report-alert] sin RESEND_API_KEY — aviso solo en el log:\n" +
        lineas.join("\n") +
        (enlace ? `\nRetirar: ${enlace}` : "\nRetirar: falta MODERATION_SECRET"),
    );
    return res.status(200).json({ ok: true, delivered: "log", causa: "sin_api_key" });
  }

  const html =
    `<h2>Contenido reportado en HoMenu</h2>` +
    `<ul>${lineas.map((l) => `<li>${escapar(l)}</li>`).join("")}</ul>` +
    (enlace
      ? `<p><a href="${enlace}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#c0392b;color:#fff;font-weight:700;text-decoration:none">Retirar este contenido</a></p>
         <p style="font-size:12px;color:#777">El enlace retira el contenido y marca el reporte como revisado. Si no procede, no hagas nada: el reporte se queda abierto.</p>`
      : `<p style="color:#c0392b">Falta MODERATION_SECRET en el servidor: no se puede generar el enlace de retirada.</p>`);

  try {
    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.MODERATION_FROM || "HoMenu <moderacion@menuplanai.com>",
        to: [DESTINATARIO],
        subject: `HoMenu — contenido reportado (${motivo})`,
        html,
      }),
    });
    if (!envio.ok) {
      // El log es la red de seguridad: si el correo no sale, el aviso no se
      // pierde, solo cambia de sitio.
      console.error(
        "[report-alert] Resend falló",
        envio.status,
        (await envio.text()).slice(0, 300),
        "\n" + lineas.join("\n"),
      );
      // El codigo de Resend viaja en la respuesta a proposito: quien dispara
      // esto es un trigger de Postgres, y pg_net guarda lo que devolvemos en
      // net._http_response. Sin este dato, "delivered: log" tapa dos causas muy
      // distintas —falta la clave, o Resend rechaza— y distinguirlas obligaba a
      // tener acceso a los logs de Vercel. Es un numero de estado, no filtra nada.
      return res.status(200).json({ ok: true, delivered: "log", causa: "resend", upstream: envio.status });
    }
    return res.status(200).json({ ok: true, delivered: "email" });
  } catch (err) {
    console.error("[report-alert] Resend lanzó", err?.name, err?.message, "\n" + lineas.join("\n"));
    return res.status(200).json({ ok: true, delivered: "log", causa: "excepcion" });
  }
}

// El id y la nota los escribe quien reporta: van dentro de un HTML que alguien
// abre en su cliente de correo, así que no entran sin escapar.
function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
