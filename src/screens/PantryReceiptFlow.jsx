import { useRef, useState } from "react";
import { ChevronRight, Loader2, Receipt, Refrigerator, TrendingUp } from "lucide-react";
import { WizardSheet } from "../components/ui.jsx";
import { extractReceiptDetail } from "../lib/receiptParser.js";
import { ingredientDictionary, matchReceiptLine, stripQtyNoise, toDisplayCase } from "../lib/priceHistory.js";
import { normalizeName } from "../lib/ingredientCategories.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { addPantryItems, addLocalPantryItems } from "../lib/pantry.js";
import { useAuth } from "../lib/useAuth.js";
import { appendReceiptSpend } from "./SpendPanel.jsx";
// Reuse the exact capture wizard the shopping screen uses (kept there with all
// its helpers) — this flow only differs in what it does on confirm.
import { ReceiptWizard, DemoReceiptSheet } from "./Shopping.jsx";

const GREEN = "#2d5a3d";
// The wizard's "Semana de compra" note is list-scoped and irrelevant here, so
// a neutral range (empty label) hides it.
const NEUTRAL_WEEK = { startISO: null, endISO: null, label: "" };

/**
 * "Subir ticket" launched from En casa — an in-place overlay (no trip to Tu
 * compra). It first asks the INTENT, because a ticket uploaded from the pantry
 * can mean two different things:
 *   - "pantry": restock — add what was bought to En casa AND log the spend.
 *   - "spend":  just accumulate spend history, without touching the pantry.
 * The wizard is reused with the live shopping list, so a ticket uploaded here
 * still tachs what it proves you bought (same as from Tu compra); every kept
 * line becomes a pantry candidate, but we only write them to En casa when the
 * intent is "pantry".
 */
export function PantryReceiptFlow({ data, setData, shopping = null, setShopping = null, onToast, onClose, onPantryChanged }) {
  const { user } = useAuth();
  const [intent, setIntent] = useState(null); // "pantry" | "spend"
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [wizard, setWizard] = useState(null);
  const fileRef = useRef(null);

  // Same enrichment the shopping screen applies: match each food line to a
  // canonical ingredient (aliases win) so prices accrue correctly.
  const buildReceiptLines = (detail) => {
    const dict = ingredientDictionary();
    const aliases = data?.priceAliases ?? {};
    return detail.lines
      .filter((l) => l.kind !== "nonfood")
      .map((l) => {
        // Same fix as Shopping.jsx's buildReceiptLines: prefab lines never
        // go through matchReceiptLine, and unmatched food lines don't get a
        // dictionary name either, so both used to keep the raw SHOUTY OCR
        // casing verbatim instead of the toDisplayCase cleanup applied
        // everywhere else the wizard shows a product name.
        //
        // We don't second-guess the prefab tag with a dictionary lookup
        // here on purpose — see the long comment in Shopping.jsx's
        // buildReceiptLines: real dishes are named after their main
        // ingredient ("Croquetas de pollo" -> "Pollo"), so that would
        // misresolve most genuine prefab items. The fix for staples
        // mis-tagged as prefab (e.g. "Pan de molde") is in the extraction
        // prompt (receiptParser.js).
        const m =
          l.kind === "prefab"
            ? { ingredientId: null, name: toDisplayCase(stripQtyNoise(l.name)), confidence: 1 }
            : matchReceiptLine(l.name, dict, aliases);
        return {
          raw: l.name,
          name: m.name ?? toDisplayCase(stripQtyNoise(l.name)),
          ingredientId: m.ingredientId,
          price: l.price ?? 0,
          qty: l.qty,
          unit: l.unit,
          kind: l.kind,
          confidence: m.confidence,
          include: true,
        };
      });
  };

  const startCapture = (which) => {
    setIntent(which);
    // Local dev has no camera hardware — pick from synthetic tickets instead,
    // exactly like the shopping screen's openScan().
    if (import.meta.env.DEV) setShowDemo(true);
    else fileRef.current?.click();
  };

  const handlePick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const detail = await extractReceiptDetail(file);
      const lines = buildReceiptLines(detail);
      if (lines.length === 0) {
        onToast?.("No se detectaron alimentos en el ticket");
        return;
      }
      setWizard({ detail, lines });
    } catch {
      onToast?.("No se pudo leer el ticket");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDemo = (fixture) => {
    setShowDemo(false);
    const detail = { ...fixture.detail, lines: fixture.detail.lines.map((l) => ({ ...l })) };
    const lines = buildReceiptLines(detail);
    if (lines.length === 0) {
      onToast?.("No se detectaron alimentos en el ticket");
      return;
    }
    setWizard({ detail, lines });
  };

  // Purely informational feedback for the "Reponer mi despensa" intent: which
  // dishes in the CURRENT week's menú need what was just restocked. Reuses
  // the live shopping list's own ingredient names — no quantity math, just
  // "does this ingredient show up in something you're planning to cook".
  const coveredRecipes = (addedItems) => {
    const rows = shopping?.items ?? [];
    if (!rows.length || !addedItems.length) return [];
    const addedNames = addedItems.map((it) => normalizeName(it.normalized || it.name)).filter(Boolean);
    const recipes = new Set();
    for (const row of rows) {
      const rowName = normalizeName(row.name);
      if (!rowName) continue;
      const hit = addedNames.some((n) => n === rowName || rowName.includes(n) || n.includes(rowName));
      if (!hit) continue;
      for (const s of row.sources ?? []) {
        if (s.recipeName) recipes.add(s.recipeName);
      }
    }
    return [...recipes];
  };

  const confirm = async ({ store, date, lines, tachIds = [], pantryEntries = [] }) => {
    const included = lines.filter((l) => l.include);
    let pantryIds = [];
    let pantried = 0;
    let covered = [];

    // Restock only when the user chose "Reponer mi despensa".
    if (intent === "pantry" && pantryEntries.length) {
      const items = pantryEntries
        .map((entry) => {
          const parsed = normalizePantryInput(entry.name)[0];
          if (!parsed) return null;
          return {
            name: parsed.raw,
            normalized: parsed.ambiguous ? parsed.candidates[0].normalized : parsed.normalized,
            qty: entry.qty,
            unit: entry.unit,
            source: "manual",
          };
        })
        .filter(Boolean);
      if (items.length) {
        if (user) {
          const results = await addPantryItems(user.id, items);
          pantried = results.length;
          // Only brand-new rows get linked to the receipt (so deleting the
          // ticket later undoes just those — not top-ups on pre-existing stock).
          pantryIds = results.filter((r) => r.isNew).map((r) => r.id);
        } else {
          addLocalPantryItems(items);
          pantried = items.length;
        }
        covered = coveredRecipes(items);
        onPantryChanged?.();
      }
    }

    // A ticket proves those items were bought, so tach them off the pending
    // list regardless of which screen uploaded it — otherwise the user has to
    // go to Tu compra and uncheck them by hand.
    if (setShopping && tachIds.length) {
      const tached = new Set(tachIds);
      setShopping((s) => ({
        ...s,
        items: (s?.items ?? []).map((it) => (tached.has(it.id) ? { ...it, have: true } : it)),
      }));
    }

    // Spend is always recorded (both intents).
    if (setData && included.length) {
      appendReceiptSpend(setData, { store, date, lines: included, pantryIds }, data?.priceAliases ?? {});
    }

    setWizard(null);
    const coverageSuffix = covered.length
      ? ` · cubre ${covered.length === 1 ? covered[0] : `${covered.length} platos de tu menú`}`
      : "";
    const tachSuffix = tachIds.length ? ` · ${tachIds.length} tachados de tu compra` : "";
    onToast?.(
      intent === "pantry"
        ? pantried > 0
          ? `${pantried} ${pantried === 1 ? "producto añadido" : "productos añadidos"} a En casa · gasto guardado${tachSuffix}${coverageSuffix}`
          : `Gasto guardado${tachSuffix}`
        : `Gasto guardado · ${included.length} ${included.length === 1 ? "producto" : "productos"}${tachSuffix}`,
    );
    onClose?.();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => handlePick(e.target.files?.[0])}
      />

      {!wizard && !showDemo && (
        <WizardSheet
          icon={Receipt}
          iconColor={GREEN}
          title={busy ? "Leyendo el ticket…" : "Subir ticket"}
          subtitle={busy ? "Puede tardar unos segundos" : "¿Qué quieres hacer?"}
          onClose={onClose}
        >
          {busy ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "30px 0 26px",
              }}
            >
              <Loader2 size={28} className="rotating" color={GREEN} />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <IntentCard
                Icon={Refrigerator}
                color={GREEN}
                title="Reponer mi despensa"
                desc="Suma lo comprado a En casa y guarda el gasto."
                onClick={() => startCapture("pantry")}
              />
              <IntentCard
                Icon={TrendingUp}
                color="#e07b39"
                title="Solo histórico de gasto"
                desc="Registra el gasto para tu analítica, sin tocar la despensa."
                onClick={() => startCapture("spend")}
              />
            </div>
          )}
        </WizardSheet>
      )}

      {showDemo && (
        <DemoReceiptSheet
          onClose={() => {
            setShowDemo(false);
            onClose?.();
          }}
          onPick={handleDemo}
          onUploadReal={() => {
            setShowDemo(false);
            fileRef.current?.click();
          }}
        />
      )}

      {wizard && (
        <ReceiptWizard
          detail={wizard.detail}
          initialLines={wizard.lines}
          weekRange={NEUTRAL_WEEK}
          listItems={shopping?.items ?? []}
          onCancel={() => {
            setWizard(null);
            onClose?.();
          }}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

// White option card inside the tinted WizardSheet: icon bubble + title + desc.
function IntentCard({ Icon, color, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "13px 14px",
        borderRadius: 16,
        border: "1.5px solid #e0eae3",
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        boxShadow: "0 1px 3px rgba(20,47,29,.05)",
      }}
    >
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${color}16`,
          color,
        }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#142f1d" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7d70", marginTop: 2, lineHeight: 1.35 }}>
          {desc}
        </span>
      </span>
      <ChevronRight size={18} color="#b6c4bb" style={{ flexShrink: 0 }} />
    </button>
  );
}
