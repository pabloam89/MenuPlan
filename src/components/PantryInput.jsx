import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronDown, Loader2, Mic, Pencil, Plus, Square, Trash2 } from "lucide-react";
import { useAuth } from "../lib/useAuth.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { addPantryItems, addLocalPantryItems } from "../lib/pantry.js";
import { extractPantryPhoto } from "../lib/receiptParser.js";
import { toCanonicalStockQty } from "../lib/kitchenUnits.js";
import { IngredientPicker } from "../screens/RecipePlanner.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const CARD_BG = "#eaf3ec";
const FIELD_BG = "#fff";

const PANTRY_UNITS = ["ud", "g", "kg", "ml", "l"];

// Soft mint card + white fields so inputs don't dissolve into the card.
const editInputBase = {
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1.5px solid #cfe0d6",
  fontFamily: "inherit",
  color: INK,
  outline: "none",
  background: FIELD_BG,
};

// Custom "¿Cuál?" menu — native <select> can't do rounded corners / green
// dividers on the option list, so we portal a MenuPlan-styled picker.
function CualDropdown({ candidates, onSelect, onClose, anchorRef }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(240, Math.max(180, window.innerWidth - 24));
      const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const openUp = spaceBelow < 220 && r.top > spaceBelow;
      setPos({
        left,
        width,
        top: openUp ? null : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : null,
        maxHeight: Math.max(160, (openUp ? r.top : spaceBelow) - 16),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top ?? undefined,
        bottom: pos.bottom ?? undefined,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        background: "#fff",
        borderRadius: 14,
        border: "1.5px solid #d7e6dc",
        boxShadow: "0 16px 40px -12px rgba(20,47,29,.28)",
        zIndex: 400,
        padding: 4,
      }}
    >
      {candidates.map((c, i) => (
        <div key={c.normalized}>
          {i > 0 && <div style={{ height: 1, margin: "2px 8px", background: "#cfe0d6" }} />}
          <button
            type="button"
            role="option"
            onClick={() => onSelect(c)}
            style={{
              width: "100%",
              display: "block",
              padding: "10px 12px",
              border: "none",
              borderRadius: 10,
              background: "transparent",
              color: INK,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              textAlign: "left",
              cursor: "pointer",
              lineHeight: 1.3,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#eaf3ec";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {c.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function CualPicker({ candidates, onSelect, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title="¿Cuál?"
        style={{
          ...editInputBase,
          flexShrink: 0,
          // Match qty(42) + gap(6) + unit(56) so the ingredient textbox keeps
          // the exact same width whether or not the row is ambiguous.
          width: 104,
          height: 34,
          padding: "0 6px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          fontSize: 11.5,
          fontWeight: 800,
          color: INK,
          borderColor: open ? GREEN : "#cfe0d6",
          background: FIELD_BG,
          cursor: "pointer",
        }}
      >
        ¿Cuál?
        <ChevronDown size={12} color={GREEN} strokeWidth={2.6} />
      </button>
      {open && (
        <CualDropdown
          candidates={candidates}
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          onSelect={(c) => {
            onSelect(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PantryEditList({
  chips,
  onUpdateQty,
  onUpdateUnit,
  onUpdateName,
  onResolve,
  onRemove,
  onConfirmRow,
  confirming = false,
  focusQtyIndex = null,
}) {
  const qtyRefs = useRef([]);

  useEffect(() => {
    if (focusQtyIndex == null || focusQtyIndex < 0) return;
    const el = qtyRefs.current[focusQtyIndex];
    if (!el) return;
    el.focus();
    el.select?.();
  }, [focusQtyIndex, chips.length]);

  if (chips.length === 0) return null;
  const nameSize = 13;
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {chips.map((chip, idx) => {
        const rowDisabled = Boolean(chip.ambiguous) || confirming;
        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
                background: CARD_BG,
                border: "1px solid #d7e6dc",
                borderRadius: 14,
              }}
            >
              <input
                value={chip.raw}
                onChange={(e) => onUpdateName(idx, e.target.value)}
                aria-label="Nombre del ingrediente"
                style={{
                  ...editInputBase,
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 8px",
                  fontSize: nameSize,
                  fontWeight: 700,
                  color: INK,
                }}
              />
              {chip.ambiguous ? (
                <CualPicker
                  candidates={chip.candidates}
                  ariaLabel={`Elegir coincidencia para ${chip.raw}`}
                  onSelect={(candidate) => onResolve(idx, candidate)}
                />
              ) : (
                <>
                  <input
                    ref={(el) => {
                      qtyRefs.current[idx] = el;
                    }}
                    value={chip.entryQty}
                    onChange={(e) => onUpdateQty(idx, e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`Cantidad de ${chip.raw}`}
                    style={{
                      ...editInputBase,
                      width: 42,
                      flexShrink: 0,
                      padding: "7px 2px",
                      fontSize: nameSize,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  />
                  <select
                    value={chip.entryUnit}
                    onChange={(e) => onUpdateUnit(idx, e.target.value)}
                    aria-label={`Unidad de ${chip.raw}`}
                    style={{
                      ...editInputBase,
                      width: 56,
                      flexShrink: 0,
                      padding: "7px 2px",
                      fontSize: nameSize,
                      fontWeight: 700,
                    }}
                  >
                    {PANTRY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u === "l" ? "L" : u}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => onRemove(idx)}
                aria-label={`Quitar ${chip.raw}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: "none",
                  flexShrink: 0,
                  background: "#fdf1ef",
                  color: "#c0392b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onConfirmRow(idx)}
              disabled={rowDisabled}
              aria-label={`Añadir ${chip.raw} en casa`}
              title="Añadir"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: "none",
                flexShrink: 0,
                background: rowDisabled ? "#c8d9ce" : GREEN,
                color: "#fff",
                cursor: rowDisabled ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={20} strokeWidth={2.6} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// A photo-detected canonical amount (g/ml) reads better scaled up for
// editing — "1000 g de arroz" is really "1 kg" to a person filling the field.
function toDisplayUnit(qty, unit) {
  if (unit === "g" && qty >= 1000) return { qty: qty / 1000, unit: "kg" };
  if (unit === "ml" && qty >= 1000) return { qty: qty / 1000, unit: "l" };
  return { qty, unit };
}

// Three ways in, each landing in the same chip list below for quantity/unit
// review — only how a chip gets there changes with the mode.
const MODES = [
  { id: "text", label: "Escrito", Icon: Pencil },
  { id: "voice", label: "Voz", Icon: Mic },
  { id: "photo", label: "Foto", Icon: Camera },
];

function ModeToggle({ mode, onSelect, voiceDisabled }) {
  return (
    <div style={modeToggleStyle}>
      {MODES.map(({ id, label, Icon }) => {
        const selected = mode === id;
        const disabled = id === "voice" && voiceDisabled;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(id)}
            aria-pressed={selected}
            title={disabled ? "Dictado no disponible en este navegador" : label}
            style={{
              ...modeToggleBtnStyle,
              ...(selected ? modeToggleBtnOnStyle : {}),
              ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : {}),
            }}
          >
            <Icon size={13} strokeWidth={2.4} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pantry input with three ways in — texto, voz (dictado) y foto (OCR de
 * nevera/despensa) — chosen via a segmented control, all funnelling into the
 * same editable-chip review list before saving. Each chip carries a quantity
 * + unit (despensa tracks real stock, not just presence — see
 * 0006_pantry_quantity.sql), so cooking a recipe can later subtract from it.
 *
 * Works signed out too: user_pantry requires auth.uid() (see migration
 * 0002), so a signed-out save goes to the localStorage mirror in
 * lib/pantry.js instead (mergeLocalPantryIntoCloud folds it into the account
 * on first login).
 */
export function PantryInput({ onSaved }) {
  const { user } = useAuth();
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [chips, setChips] = useState([]);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [pickQuery, setPickQuery] = useState("");
  const [pickAisle, setPickAisle] = useState(null);
  const [focusQtyIndex, setFocusQtyIndex] = useState(null);
  const debounceRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  const addChips = (parsedList, source, qtyUnitByRaw) => {
    setChips((prev) => {
      const next = [...prev];
      for (const item of parsedList) {
        const key = item.ambiguous ? item.raw.toLowerCase() : item.normalized;
        if (next.some((c) => (c.ambiguous ? c.raw.toLowerCase() : c.normalized) === key)) continue;
        const guess = qtyUnitByRaw?.get(item.raw) ?? { qty: 1, unit: "ud" };
        next.push({ ...item, entryQty: guess.qty, entryUnit: guess.unit, source });
      }
      return next;
    });
  };

  const mergeParsedIntoChips = (raw, source = "manual") => {
    const parsed = normalizePantryInput(raw);
    if (parsed.length === 0) return;
    addChips(parsed, source);
    setText("");
  };

  const onTextChange = (value) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) mergeParsedIntoChips(value, "manual");
    }, 600);
  };

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  // ── Voice input: a textbox that fills in live as you speak ──
  const speechSupported = Boolean(getSpeechRecognitionCtor());

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "es-ES";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) combined += event.results[i][0].transcript;
      onTextChange(combined);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setText("");
    setListening(true);
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);
  // Leaving "Voz" mid-dictation shouldn't leave the mic hot in the background.
  useEffect(() => {
    if (mode !== "voice" && listening) recognitionRef.current?.stop();
  }, [mode, listening]);

  // ── Photo input (OCR) — multi-select so several fridge shots can go in one go ──
  const handlePhotoFiles = async (files) => {
    if (!files?.length) return;
    setPhotoLoading(true);
    setPhotoError("");
    let addedAny = false;
    try {
      for (const file of files) {
        const found = await extractPantryPhoto(file);
        if (found.length === 0) continue;
        const qtyUnitByRaw = new Map();
        const parsedAll = [];
        for (const item of found) {
          const [parsed] = normalizePantryInput(item.name);
          if (!parsed) continue;
          qtyUnitByRaw.set(parsed.raw, toDisplayUnit(item.qty, item.unit));
          parsedAll.push(parsed);
        }
        if (parsedAll.length > 0) {
          addChips(parsedAll, "photo", qtyUnitByRaw);
          addedAny = true;
        }
      }
      if (!addedAny) setPhotoError("No reconocimos ningún alimento en las fotos.");
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "";
      setPhotoError(msg || "No se pudo leer la foto. Inténtalo de nuevo.");
    } finally {
      setPhotoLoading(false);
    }
  };

  const onPhotoInputChange = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) handlePhotoFiles(files);
  };

  // Selecting "Foto" IS the trigger — no extra tap on a camera button.
  // Called straight from the segment's own click handler (not an effect) so
  // it still counts as a direct user gesture and reliably opens the picker.
  const selectMode = (id) => {
    setMode(id);
    if (id === "photo") fileInputRef.current?.click();
  };

  // ── Chip actions ──
  const removeChip = (idx) => {
    setChips((prev) => prev.filter((_, i) => i !== idx));
    setFocusQtyIndex(null);
  };

  const updateChipQty = (idx, qty) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, entryQty: qty } : c)));

  const updateChipUnit = (idx, unit) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, entryUnit: unit } : c)));

  // Live rename (esp. after OCR). Re-match after a short pause so typing
  // "pasta" can open ¿Cuál? without fighting every keystroke.
  const nameDebounceRef = useRef(null);
  const updateChipName = (idx, name) => {
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, raw: name } : c)));
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const [parsed] = normalizePantryInput(trimmed);
      if (!parsed) return;
      setChips((prev) =>
        prev.map((c, i) => {
          if (i !== idx) return c;
          return {
            ...parsed,
            raw: name,
            entryQty: c.entryQty,
            entryUnit: c.entryUnit,
            source: c.source,
          };
        }),
      );
    }, 450);
  };

  const resolveAmbiguous = (idx, candidate) =>
    setChips((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              raw: candidate.label,
              normalized: candidate.normalized,
              matched: true,
              ambiguous: false,
              entryQty: c.entryQty,
              entryUnit: c.entryUnit,
              source: c.source,
            }
          : c,
      ),
    );

  // ── "Escrito" mode: RecipePlanner's own search/browse-by-category picker.
  // Toggling a catalog name just adds/removes it from the SAME chip list
  // voice/photo feed, so quantity editing and Guardar stay identical no
  // matter which mode added an item.
  const addedNames = new Set(chips.map((c) => c.raw.toLowerCase()));

  const appendChipAndFocusQty = (parsed) => {
    if (!parsed) return;
    const key = parsed.ambiguous ? parsed.raw.toLowerCase() : parsed.normalized;
    const existing = chips.findIndex((c) => (c.ambiguous ? c.raw.toLowerCase() : c.normalized) === key);
    if (existing >= 0) {
      setFocusQtyIndex(existing);
      setPickQuery("");
      return;
    }
    setChips((prev) => [...prev, { ...parsed, entryQty: 1, entryUnit: "ud", source: "manual" }]);
    setFocusQtyIndex(chips.length);
    setPickQuery("");
  };

  const toggleIngredient = (name) => {
    const key = name.toLowerCase();
    const idx = chips.findIndex((c) => c.raw.toLowerCase() === key);
    if (idx >= 0) {
      removeChip(idx);
      return;
    }
    const [parsed] = normalizePantryInput(name);
    appendChipAndFocusQty(parsed);
  };

  const addCustomIngredient = (name) => {
    const trimmed = name.trim();
    if (!trimmed || addedNames.has(trimmed.toLowerCase())) return;
    const [parsed] = normalizePantryInput(trimmed);
    appendChipAndFocusQty(parsed);
  };

  // Per-row "+": commit only that chip to the pantry.
  const handleSaveRow = async (idx) => {
    const chip = chips[idx];
    if (!chip || chip.ambiguous || saving) return;
    setSaving(true);
    const { qty, unit } = toCanonicalStockQty(chip.entryQty, chip.entryUnit);
    const items = [{ name: chip.raw, normalized: chip.normalized, qty, unit, source: chip.source ?? "manual" }];
    const saved = user ? await addPantryItems(user.id, items) : addLocalPantryItems(items);
    setSaving(false);
    setChips((prev) => prev.filter((_, i) => i !== idx));
    setFocusQtyIndex(null);
    onSaved?.(saved);
  };

  // Enter / custom add: put the typed name on the pending list and jump
  // focus to its quantity. Each row's "+" commits that item to pantry.
  const handlePlus = () => {
    const trimmed = pickQuery.trim();
    if (trimmed && !addedNames.has(trimmed.toLowerCase())) {
      const [parsed] = normalizePantryInput(trimmed);
      appendChipAndFocusQty(parsed);
    }
  };

  return (
    <div>
      <ModeToggle mode={mode} onSelect={selectMode} voiceDisabled={!speechSupported} />

      {mode === "text" && (
        <IngredientPicker
          query={pickQuery}
          onQueryChange={setPickQuery}
          aisle={pickAisle}
          onAisleChange={setPickAisle}
          addedNames={addedNames}
          onToggle={toggleIngredient}
          onAddCustom={addCustomIngredient}
          compact
          onPlus={handlePlus}
          plusDisabled={!pickQuery.trim()}
        />
      )}

      {mode === "voice" && (
        <div style={{ position: "relative" }}>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Aquí aparecerá lo que dictes…"
            rows={3}
            style={{ ...textareaStyle, width: "100%", boxSizing: "border-box", paddingRight: 52 }}
          />
          <button
            type="button"
            onClick={toggleListening}
            disabled={!speechSupported}
            aria-label={listening ? "Detener grabación" : "Dictar por voz"}
            title="Dictar por voz"
            style={{
              ...voiceBtnStyle,
              position: "absolute",
              right: 8,
              bottom: 8,
              background: listening ? "#c0392b" : GREEN,
              animation: listening ? "pantryPulse 1.1s ease-in-out infinite" : "none",
            }}
          >
            {listening ? <Square size={16} /> : <Mic size={18} />}
          </button>
        </div>
      )}

      {mode === "photo" && (
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photoLoading}
            style={{ ...photoCardStyle, cursor: photoLoading ? "wait" : "pointer" }}
          >
            {photoLoading ? <Loader2 size={22} className="mp-spin" color={GREEN} /> : <Camera size={22} color={GREEN} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>
              {photoLoading ? "Leyendo las fotos…" : "Toca para elegir una o varias fotos"}
            </span>
          </button>
          {photoError && <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#c0392b" }}>{photoError}</p>}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPhotoInputChange}
        style={{ display: "none" }}
      />

      <style>{`
        @keyframes pantryPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,.35); }
          50% { box-shadow: 0 0 0 8px rgba(192,57,43,0); }
        }
        @keyframes mpSpin { to { transform: rotate(360deg); } }
        .mp-spin { animation: mpSpin 0.8s linear infinite; }
      `}</style>

      {chips.length > 0 && (
        <PantryEditList
          chips={chips}
          onUpdateQty={updateChipQty}
          onUpdateUnit={updateChipUnit}
          onUpdateName={updateChipName}
          onResolve={resolveAmbiguous}
          onRemove={removeChip}
          onConfirmRow={handleSaveRow}
          confirming={saving}
          focusQtyIndex={focusQtyIndex}
        />
      )}
    </div>
  );
}

const modeToggleStyle = {
  display: "flex",
  gap: 2,
  padding: 2,
  borderRadius: 11,
  background: "#eef4ef",
  border: "1px solid #dce8e0",
  marginBottom: 12,
};

const modeToggleBtnStyle = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "7px 0",
  borderRadius: 9,
  border: "none",
  background: "transparent",
  color: "#5a7066",
  fontSize: 11.5,
  fontWeight: 800,
  fontFamily: "inherit",
  cursor: "pointer",
};

const modeToggleBtnOnStyle = { background: GREEN, color: "#fff" };

const textareaStyle = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1.5px solid #d7e6dc",
  background: "#fff",
  fontSize: 12.5,
  fontWeight: 800,
  fontFamily: "inherit",
  resize: "none",
  outline: "none",
};

const voiceBtnStyle = {
  width: 42,
  height: 42,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  flexShrink: 0,
};

const photoCardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "22px 14px",
  borderRadius: 14,
  border: "1.5px dashed #bcdcc7",
  background: "#fff",
  fontFamily: "inherit",
};
