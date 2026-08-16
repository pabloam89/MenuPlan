import { useMemo, useState } from "react";
import { CalendarDays, Check, Coffee, Download, FileText, Moon, School, Sun, UtensilsCrossed, X } from "lucide-react";
import {
  defaultPdfExportOptions,
  estimatePdfSheets,
  householdHasColeSchedule,
  householdHasPostre,
  pdfExportGroupOptions,
  pdfExportMealOptions,
} from "../lib/menuExport.js";
import { membersOfGroup } from "../lib/groups.js";
import { slotKey } from "../lib/planner.js";
import { householdHasSchoolMenu, SCHOOL_DAYS } from "../lib/schoolMenu.js";
import { GroupAvatarStack, groupAvatarFaces, SegmentedControl, ToggleSwitch } from "./ui.jsx";

const POSTRE_ILLUSTRATION = "/avatares/cards/yogur_fruta.jpg";

const MEAL_META = {
  Desayuno: { Icon: Coffee, tone: "#c98a3a", bg: "#fbf3e8" },
  Comida: { Icon: Sun, tone: "#d4a017", bg: "#fdf6e3" },
  Cena: { Icon: Moon, tone: "#3a5a72", bg: "#eef3f7" },
};

function coleKidsFirstNames(data) {
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  return members
    .filter((m) => SCHOOL_DAYS.some(
      (day) => schedule[slotKey(m.id, day, "Comida")] === "cole",
    ))
    .map((m) => (m.name ?? "").trim().split(/\s+/)[0] || m.name)
    .filter(Boolean);
}

/**
 * Pre-download sheet: weekday vs weekend, meal picker, postre, group filter and
 * optional school menu. Also shows how many sheets the export will take.
 */
export function MenuPdfExportModal({ data, weekCount = 1, onConfirm, onClose }) {
  const defaults = useMemo(() => defaultPdfExportOptions(data), [data]);
  const mealOptions = useMemo(() => pdfExportMealOptions(data), [data]);
  const groupOptions = useMemo(() => pdfExportGroupOptions(data), [data]);
  const showSchool = useMemo(
    () => householdHasSchoolMenu(data?.schoolMenus) && householdHasColeSchedule(data),
    [data],
  );
  const showPostre = useMemo(() => householdHasPostre(data), [data]);
  const showGroups = groupOptions.length > 1;
  const coleNames = useMemo(() => coleKidsFirstNames(data), [data]);

  const [dayScope, setDayScope] = useState(defaults.dayScope);
  const [meals, setMeals] = useState(() => new Set(defaults.meals));
  const [includePostre, setIncludePostre] = useState(defaults.includePostre);
  const [includeSchoolMenu, setIncludeSchoolMenu] = useState(defaults.includeSchoolMenu);
  const [excludedGroups, setExcludedGroups] = useState(() => new Set());

  const toggleMeal = (meal) => {
    setMeals((prev) => {
      const next = new Set(prev);
      if (next.has(meal)) {
        if (next.size <= 1) return prev;
        next.delete(meal);
      } else {
        next.add(meal);
      }
      return next;
    });
  };

  const toggleGroup = (groupId) => {
    setExcludedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        // Keep at least one group visible.
        if (groupOptions.length - next.size <= 1) return prev;
        next.add(groupId);
      }
      return next;
    });
  };

  const exportOptions = {
    dayScope,
    meals: mealOptions.filter((m) => meals.has(m)),
    includePostre: showPostre && includePostre,
    includeSchoolMenu: showSchool && includeSchoolMenu,
    excludedGroups: [...excludedGroups],
  };

  const visibleGroupCount = Math.max(1, groupOptions.length - excludedGroups.size);
  const sheetCount = estimatePdfSheets(weekCount, visibleGroupCount, exportOptions);

  const handleConfirm = () => onConfirm(exportOptions);

  const schoolHint = coleNames.length === 1
    ? `Lo que come ${coleNames[0]} en el comedor`
    : coleNames.length > 1
      ? `Lo que comen ${coleNames.slice(0, -1).join(", ")} y ${coleNames.at(-1)} en el comedor`
      : "Platos del comedor escolar";

  return (
    <div
      onClick={onClose}
      className="mp-overlay-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 320,
        background: "rgba(0,0,0,.48)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 0 max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mp-sheet-up"
        style={{
          background: "#fff",
          borderRadius: "22px 22px 18px 18px",
          padding: "18px 18px 16px",
          width: "100%",
          maxWidth: 420,
          boxSizing: "border-box",
          boxShadow: "0 -8px 40px rgba(0,0,0,.18), 0 24px 60px rgba(0,0,0,.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              flexShrink: 0,
              background: "linear-gradient(145deg, #fdf0e0, #f5d9a8)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 0 1px rgba(217,119,6,.15)",
            }}
          >
            <Download size={21} color="#d97706" strokeWidth={2.4} />
          </span>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <h3 style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 900,
              color: "#142f1d",
              letterSpacing: "-.02em",
            }}
            >
              Descargar PDF
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#7a9485", lineHeight: 1.35 }}>
              Elige qué quieres pegar en la nevera
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "none",
              background: "#f3f6f4",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={17} color="#5a7262" strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              color: "#5a7262",
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
            >
              <CalendarDays size={13} strokeWidth={2.5} />
              ¿Qué días?
            </div>
            <SegmentedControl
              value={dayScope}
              onChange={setDayScope}
              activeDark
              options={[
                { id: "weekday", label: "Entre semana" },
                { id: "weekend", label: "Fin de semana" },
              ]}
            />
          </section>

          <section>
            <div style={{
              marginBottom: 8,
              color: "#5a7262",
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
            >
              ¿Qué comidas?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {mealOptions.map((meal) => {
                const meta = MEAL_META[meal];
                const Icon = meta?.Icon ?? Sun;
                const selected = meals.has(meal);
                return (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => toggleMeal(meal)}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 6px 9px",
                      borderRadius: 14,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: selected ? meta.bg : "#f7f9f8",
                      border: `1.5px solid ${selected ? meta.tone : "#e8ede9"}`,
                      boxShadow: selected ? `0 2px 8px ${meta.tone}22` : "none",
                      transition: "all .15s ease",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 11,
                        background: selected ? "#fff" : "#edf2ee",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: selected
                          ? `inset 0 0 0 1.5px ${meta.tone}33`
                          : "none",
                      }}
                    >
                      <Icon size={18} color={selected ? meta.tone : "#7a8a7f"} strokeWidth={2.3} />
                    </span>
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: selected ? "#142f1d" : "#7a8a7f",
                    }}
                    >
                      {meal}
                    </span>
                    {selected && (
                      <span style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: meta.tone,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      >
                        <Check size={10} color="#fff" strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {showPostre && (meals.has("Comida") || meals.has("Cena")) && (
            <section
              style={{
                padding: "9px 12px",
                borderRadius: 14,
                background: "#faf0f6",
                border: "1.5px solid #eccfe0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: "#fff",
                    overflow: "hidden",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "inset 0 0 0 1.5px #8a4a6a22",
                  }}
                >
                  <img
                    src={POSTRE_ILLUSTRATION}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ToggleSwitch
                    checked={includePostre}
                    onChange={setIncludePostre}
                    label="Incluir postre"
                  />
                </div>
              </div>
            </section>
          )}

          {showGroups && (
            <section>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
                color: "#5a7262",
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: ".04em",
                textTransform: "uppercase",
              }}
              >
                <UtensilsCrossed size={13} strokeWidth={2.5} />
                ¿De quién?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {groupOptions.map((g) => {
                  const active = !excludedGroups.has(g.id);
                  const tone = g.color || "#2d5a3d";
                  const groupObj = (data?.groups ?? []).find((x) => x.id === g.id);
                  const faces = groupObj
                    ? groupAvatarFaces(membersOfGroup(groupObj, data?.members ?? []), data?.members ?? [])
                    : [];
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "6px 12px 6px 7px",
                        borderRadius: 999,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: active ? "#fff" : "#f3f6f4",
                        border: `1.5px solid ${active ? tone : "#e2e8e4"}`,
                        boxShadow: active ? `0 1px 6px ${tone}22` : "none",
                        opacity: active ? 1 : 0.55,
                        transition: "all .15s ease",
                      }}
                    >
                      {faces.length > 0 ? (
                        <GroupAvatarStack faces={faces} size={26} active={active} max={3} />
                      ) : (
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            flexShrink: 0,
                            background: tone,
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 900,
                          }}
                        >
                          {g.label.slice(0, 1)}
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 800, color: active ? "#142f1d" : "#7a8a7f" }}>
                        {g.label}
                      </span>
                      {active
                        ? <Check size={14} color={tone} strokeWidth={3} />
                        : <X size={14} color="#9aa8a0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {showSchool && meals.has("Comida") && (
            <section
              style={{
                padding: "11px 12px",
                borderRadius: 14,
                background: "#f0f6ff",
                border: "1.5px solid #c8daf5",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    flexShrink: 0,
                    background: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "inset 0 0 0 1.5px #1d6fd833",
                  }}
                >
                  <School size={18} color="#1d6fd8" strokeWidth={2.3} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ToggleSwitch
                    checked={includeSchoolMenu}
                    onChange={setIncludeSchoolMenu}
                    label="Menú del cole"
                  />
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#5a7a9e", lineHeight: 1.3 }}>
                    {schoolHint}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 14,
            padding: "8px 12px",
            borderRadius: 12,
            background: "#f3f6f4",
            color: "#5a7262",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <FileText size={14} strokeWidth={2.4} color="#7a8a7f" />
          {sheetCount === 1
            ? "Cabe en 1 folio A4"
            : `Se imprimirá en ${sheetCount} folios A4`}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            marginTop: 10,
            padding: "13px 16px",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 900,
            color: "#fff",
            background: "linear-gradient(145deg, #2d5a3d, #3f7a52)",
            boxShadow: "0 4px 14px rgba(45,90,61,.28)",
          }}
        >
          <Download size={17} strokeWidth={2.5} />
          Generar PDF
        </button>
      </div>
    </div>
  );
}
