import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { GoogleButton } from "./ui.jsx";
import { useAuth } from "../lib/useAuth.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { addPantryItems } from "../lib/pantry.js";

const GREEN = "#2d5a3d";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Free-text (or voice) pantry input: "¿Tienes algo en casa que quieras
 * aprovechar?". Typed/dictated text is parsed locally (normalizePantryInput,
 * no LLM) into chips as the user pauses typing, not on every keystroke — the
 * textarea clears after each batch so removing a chip later can't be undone
 * by the same still-lingering text being reparsed.
 *
 * Gated behind auth: user_pantry requires auth.uid() (see migration 0002),
 * and this feature has no anonymous-write path, so a signed-out user sees a
 * sign-in prompt instead of the form.
 */
export function PantryInput({ onSaved }) {
  const { user, signInWithGoogle } = useAuth();
  const [text, setText] = useState("");
  const [chips, setChips] = useState([]);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const debounceRef = useRef(null);
  const recognitionRef = useRef(null);

  const mergeParsedIntoChips = (raw) => {
    const parsed = normalizePantryInput(raw);
    if (parsed.length === 0) return;
    setChips((prev) => {
      const next = [...prev];
      for (const item of parsed) {
        const key = item.ambiguous ? item.raw.toLowerCase() : item.normalized;
        if (next.some((c) => (c.ambiguous ? c.raw.toLowerCase() : c.normalized) === key)) continue;
        next.push(item);
      }
      return next;
    });
    setText("");
  };

  const onTextChange = (value) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) mergeParsedIntoChips(value);
    }, 600);
  };

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  // ── Voice input ──
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
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) mergeParsedIntoChips(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // ── Chip actions ──
  const removeChip = (idx) => setChips((prev) => prev.filter((_, i) => i !== idx));

  const resolveAmbiguous = (idx, candidate) =>
    setChips((prev) =>
      prev.map((c, i) =>
        i === idx
          ? { raw: c.raw, normalized: candidate.normalized, matched: true, ambiguous: false }
          : c,
      ),
    );

  const hasUnresolved = chips.some((c) => c.ambiguous);

  const handleSave = async () => {
    if (!user || chips.length === 0 || hasUnresolved) return;
    setSaving(true);
    setSaveMsg("");
    const items = chips.map((c) => ({ name: c.raw, normalized: c.normalized }));
    await addPantryItems(user.id, items);
    setSaving(false);
    setSaveMsg(`Guardado (${chips.length} ${chips.length === 1 ? "ingrediente" : "ingredientes"})`);
    setChips([]);
    onSaved?.(items);
  };

  if (!user) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          border: "1.5px solid #e0eae3",
          background: "#f7faf8",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#526057", lineHeight: 1.5 }}>
          Inicia sesión para guardar lo que tienes en casa y aprovecharlo en tu menú.
        </p>
        <GoogleButton onClick={signInWithGoogle} />
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 14, color: "#3a4a40", fontWeight: 700 }}>
        ¿Tienes algo en casa que quieras aprovechar?
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Ej: pollo, arroz, tomates..."
          rows={2}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1.5px solid #dde7e0",
            fontSize: 16,
            fontFamily: "inherit",
            resize: "none",
            outline: "none",
          }}
        />
        {speechSupported && (
          <button
            type="button"
            onClick={toggleListening}
            aria-label={listening ? "Detener grabación" : "Dictar por voz"}
            style={{
              width: 42,
              height: 42,
              flexShrink: 0,
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: listening ? "#c0392b" : GREEN,
              color: "#fff",
              animation: listening ? "pantryPulse 1.1s ease-in-out infinite" : "none",
            }}
          >
            {listening ? <Square size={16} /> : <Mic size={18} />}
          </button>
        )}
      </div>
      <style>{`
        @keyframes pantryPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,.35); }
          50% { box-shadow: 0 0 0 8px rgba(192,57,43,0); }
        }
      `}</style>

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
          {chips.map((chip, idx) =>
            chip.ambiguous ? (
              <span
                key={idx}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 6px 5px 11px",
                  borderRadius: 20,
                  background: "#fdf3e0",
                  border: "1.5px solid #e8c98a",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#8a6d1f",
                }}
              >
                {chip.raw}
                <select
                  value=""
                  onChange={(e) => {
                    const candidate = chip.candidates.find((c) => c.normalized === e.target.value);
                    if (candidate) resolveAmbiguous(idx, candidate);
                  }}
                  style={{
                    border: "1px solid #e8c98a",
                    borderRadius: 8,
                    fontSize: 16,
                    color: "#8a6d1f",
                    background: "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="" disabled>
                    ¿Cuál?
                  </option>
                  {chip.candidates.map((c) => (
                    <option key={c.normalized} value={c.normalized}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeChip(idx)}
                  aria-label={`Quitar ${chip.raw}`}
                  style={{ border: "none", background: "transparent", color: "#8a6d1f", cursor: "pointer", padding: 2, display: "flex" }}
                >
                  <X size={12} />
                </button>
              </span>
            ) : (
              <span
                key={idx}
                title={chip.matched ? undefined : "No tenemos recetas con este ingrediente"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 6px 5px 11px",
                  borderRadius: 20,
                  background: chip.matched ? "#eaf3ec" : "#f0f0f0",
                  border: `1.5px solid ${chip.matched ? "#bcdcc7" : "#dcdcdc"}`,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: chip.matched ? GREEN : "#8a8a8a",
                }}
              >
                {chip.raw}
                <button
                  type="button"
                  onClick={() => removeChip(idx)}
                  aria-label={`Quitar ${chip.raw}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                    opacity: 0.7,
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ),
          )}
        </div>
      )}

      {hasUnresolved && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#8a6d1f" }}>
          Elige una opción en los ingredientes en naranja antes de guardar.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={chips.length === 0 || hasUnresolved || saving}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: "none",
            background: chips.length === 0 || hasUnresolved ? "#c8d9ce" : GREEN,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 800,
            cursor: chips.length === 0 || hasUnresolved || saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {saveMsg && <span style={{ fontSize: 12.5, color: GREEN, fontWeight: 700 }}>{saveMsg}</span>}
      </div>
    </div>
  );
}
