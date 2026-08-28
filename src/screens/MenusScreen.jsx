import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Heart, History, Loader2, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { BottomNav, EmptyIllustration, GoogleButton, APP_SHELL_MAX_WIDTH, bottomNavSpacer } from "../components/ui.jsx";
import { sortMenusDesc, orderedWeeks, formatMenuRangeLabel, clampWeekCount, MAX_MENU_WEEKS, menuHasContent } from "../lib/menuArchive.js";

const cardStyle = {
  background: "#fff",
  border: "1px solid #e6eee8",
  borderRadius: 18,
  padding: 18,
};

// Same title-band treatment as every other primary tab (Recetas, Compra,
// Menú) — HEADER_BAND + a 36px icon chip + this exact title style, so this
// secondary screen doesn't read as a different kind of screen from its
// siblings even though it's no longer a tab itself (2026-08-25).
const HEADER_BAND = "#e9f4ed";
const titleStyle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#142f1d",
  margin: 0,
  letterSpacing: "-.3px",
};

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#5c9d74",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ text, subtitle, onAction, actionLabel, img, imgPosition, solidBand }) {
  const actionButton = onAction ? (
    <button
      type="button"
      onClick={onAction}
      style={{
        marginTop: 14, border: "none", borderRadius: 999, padding: "12px 22px",
        background: "linear-gradient(135deg,#2d5a3d,#4cba6e)", color: "#fff",
        fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {actionLabel}
    </button>
  ) : null;

  if (img) {
    return (
      <EmptyIllustration
        img={img}
        title={text}
        subtitle={subtitle}
        imgPosition={imgPosition}
        solidBand={solidBand}
      >
        {actionButton}
      </EmptyIllustration>
    );
  }

  return (
    <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
      <div
        style={{
          width: 48, height: 48, borderRadius: 14, background: "#eef5f0",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <Calendar size={22} color="#2d5a3d" />
      </div>
      <p style={{ fontSize: 14, color: "#5c6b60", margin: "0 0 16px", lineHeight: 1.5 }}>{text}</p>
      {actionButton}
    </div>
  );
}

function WeeksPill({ weeks }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
        padding: "3px 9px 3px 7px", borderRadius: 999,
        background: "#eef5f0", color: "#2d5a3d", fontSize: 10.5, fontWeight: 800,
      }}
    >
      <span style={{ display: "flex", gap: 2 }}>
        {weeks.map((w) => (
          <span
            key={w.weekStart ?? w.offset}
            style={{ width: 4, height: 4, borderRadius: 999, background: "#4cba6e" }}
          />
        ))}
      </span>
      {weeks.length} semanas
    </span>
  );
}

function DeleteMenuConfirmSheet({
  onCancel,
  onConfirm,
  subtitle = "Perderás los platos y la compra generada. El histórico no se ve afectado.",
}) {
  const overlay = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300, display: "flex",
        alignItems: "flex-end", justifyContent: "center",
        background: "rgba(10,20,14,.45)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: APP_SHELL_MAX_WIDTH, background: "#fff",
          borderRadius: "24px 24px 0 0", padding: "26px 22px calc(env(safe-area-inset-bottom,0px) + 22px)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 16, marginBottom: 10, background: "#fdf1f0",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Trash2 size={22} color="#c0392b" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0, textAlign: "center" }}>
            ¿Borrar este menú?
          </h3>
          <p style={{ fontSize: 13, color: "#7a8a7f", margin: "4px 0 0", textAlign: "center" }}>
            {subtitle}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              border: "none", borderRadius: 999, background: "#c0392b", color: "#fff",
              fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Borrar menú
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "1.5px solid #e3ebe6", borderRadius: 999, background: "#fff", color: "#5c6b60",
              fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}

function HistoryMenuRow({ menu, onToggleFavorite, onReuse, onOpen, isOpening, onDelete, isActive = false }) {
  const weeks = orderedWeeks(menu);
  const rangeLabel = formatMenuRangeLabel(menu);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div style={{ ...cardStyle, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        onClick={onOpen}
        disabled={isOpening}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12,
          border: "none", background: "transparent", padding: 0, textAlign: "left",
          cursor: isOpening ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 11, background: "#f0f5f1",
            color: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          {isOpening ? <Loader2 size={18} style={{ animation: "mp-spin 1s linear infinite" }} /> : <Calendar size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#142f1d" }}>{rangeLabel}</span>
            {isActive && (
              <span
                style={{
                  fontSize: 10.5, fontWeight: 800, color: "#2d5a3d", background: "#e4f2e9",
                  borderRadius: 999, padding: "2px 8px", flexShrink: 0, letterSpacing: ".2px",
                }}
              >
                Actual
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9ab0a1", marginTop: 1 }}>
            {weeks.length} semana{weeks.length === 1 ? "" : "s"}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite?.()}
        aria-label={menu.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
        aria-pressed={menu.isFavorite}
        disabled={!onToggleFavorite}
        style={{
          border: "none", background: "transparent", cursor: onToggleFavorite ? "pointer" : "default", padding: 6, flexShrink: 0,
          opacity: onToggleFavorite ? 1 : 0.35,
        }}
      >
        <Heart size={18} color={menu.isFavorite ? "#e0405a" : "#d5ddd8"} fill={menu.isFavorite ? "#e0405a" : "none"} />
      </button>
      {!isActive && onReuse && (
        <button
          type="button"
          onClick={onReuse}
          style={{
            border: "1.5px solid #2d5a3d", borderRadius: 999, background: "#fff", color: "#2d5a3d",
            fontWeight: 800, fontSize: 12.5, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}
        >
          <RotateCw size={13} /> Repetir
        </button>
      )}
      {!isActive && onDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Borrar menú del histórico"
          disabled={isOpening}
          style={{
            border: "none", background: "transparent",
            cursor: isOpening ? "default" : "pointer", padding: 6, flexShrink: 0,
            opacity: isOpening ? 0.4 : 1,
          }}
        >
          <Trash2 size={17} color="#c3a2a0" />
        </button>
      )}

      {confirmDelete && onDelete && (
        <DeleteMenuConfirmSheet
          subtitle="Se borrará permanentemente este menú del histórico. Esta acción no se puede deshacer."
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
    </div>
  );
}

function GuestHistoryPrompt({ onSignIn }) {
  return (
    <div style={{ ...cardStyle, textAlign: "center", padding: "28px 20px" }}>
      <p style={{ fontSize: 14, color: "#5c6b60", margin: "0 0 16px", lineHeight: 1.5 }}>
        Crea una cuenta para guardar el histórico de tus menús y poder repetirlos cuando quieras.
      </p>
      <GoogleButton onClick={onSignIn} />
    </div>
  );
}

function ReuseMenuSheet({ menu, onClose, onConfirm }) {
  const weeks = orderedWeeks(menu);
  const [weekCount, setWeekCount] = useState(clampWeekCount(weeks.length || 1));
  const rangeLabel = formatMenuRangeLabel(menu);

  const overlay = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300, display: "flex",
        alignItems: "flex-end", justifyContent: "center",
        background: "rgba(10,20,14,.45)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: APP_SHELL_MAX_WIDTH, background: "#fff",
          borderRadius: "24px 24px 0 0", padding: "20px 22px calc(env(safe-area-inset-bottom,0px) + 22px)",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute", top: 14, right: 14, border: "none", background: "#f0f4f1",
            borderRadius: 999, width: 30, height: 30, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer",
          }}
        >
          <X size={15} color="#5c6b60" />
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 16, marginBottom: 10,
              background: "linear-gradient(135deg,#2d5a3d,#4cba6e)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 20px rgba(45,90,61,.3)",
            }}
          >
            <RotateCw size={22} color="#fff" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0, textAlign: "center" }}>
            Repetir este menú
          </h3>
          <p style={{ fontSize: 13, color: "#7a8a7f", margin: "4px 0 0", textAlign: "center" }}>
            Del {rangeLabel} · reutilizaremos quién come dónde cada día
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f7f9f7", borderRadius: 14, marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#142f1d" }}>Semanas a generar</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setWeekCount((v) => clampWeekCount(v - 1))}
              disabled={weekCount <= 1}
              style={stepperBtnStyle(weekCount <= 1)}
            >
              −
            </button>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", minWidth: 16, textAlign: "center" }}>{weekCount}</span>
            <button
              type="button"
              onClick={() => setWeekCount((v) => clampWeekCount(v + 1))}
              disabled={weekCount >= MAX_MENU_WEEKS}
              style={stepperBtnStyle(weekCount >= MAX_MENU_WEEKS)}
            >
              +
            </button>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: "#9ab0a1", margin: "0 0 10px", textAlign: "center" }}>
          ¿Mismos platos que la última vez, o unos nuevos?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={() => onConfirm({ weekCount, sameRecipes: true })}
            style={{
              border: "1.5px solid #2d5a3d", borderRadius: 999, background: "#fff", color: "#2d5a3d",
              fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Mismos platos
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ weekCount, sameRecipes: false })}
            style={{
              border: "none", borderRadius: 999, background: "linear-gradient(135deg,#2d5a3d,#4cba6e)", color: "#fff",
              fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              boxShadow: "0 8px 20px rgba(45,90,61,.25)",
            }}
          >
            <Sparkles size={15} /> Platos nuevos
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function stepperBtnStyle(disabled) {
  return {
    width: 26, height: 26, borderRadius: 999, border: "1px solid #d5ddd8",
    background: disabled ? "#f0f4f1" : "#fff", color: disabled ? "#c3cdc6" : "#2d5a3d",
    fontSize: 16, fontWeight: 800, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1, padding: 0,
  };
}

// Segmented switch between saved favourites and the full history, each with a
// strong-coloured icon (♥ rojo / 🕑 morado) so the two lists read at a glance.
function MenuTabSwitch({ tab, onChange, favCount, histCount }) {
  const tabs = [
    { id: "favoritos", label: "Favoritos", Icon: Heart, ink: "#e0405a", tint: "#ffe4ea", count: favCount },
    { id: "historicos", label: "Históricos", Icon: History, ink: "#7c3aed", tint: "#f0e9fe", count: histCount },
  ];
  return (
    <div style={{ display: "flex", gap: 8, background: "#eef3f0", borderRadius: 14, padding: 4, marginBottom: 16 }}>
      {tabs.map((t) => {
        const sel = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "9px 0", borderRadius: 11, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: sel ? "#fff" : "transparent",
              color: sel ? "#142f1d" : "#7a8a7f",
              fontSize: 13.5, fontWeight: 800,
              boxShadow: sel ? "0 2px 8px rgba(20,47,29,.1)" : "none",
              transition: "all .15s",
            }}
          >
            <span
              style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: sel ? t.tint : "transparent",
                color: t.ink,
              }}
            >
              <t.Icon size={16} strokeWidth={2.5} fill={t.id === "favoritos" && sel ? t.ink : "none"} />
            </span>
            {t.label}
            {t.count > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 800, color: sel ? t.ink : "#9ab0a1" }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MenusScreen({
  data,
  hasAccount,
  onNav,
  onBack,
  onOpenCurrent,
  onReuseMenu,
  onToggleFavorite,
  onSignIn,
  onOpenHistory,
  onDeleteHistory,
}) {
  const [reuseTargetId, setReuseTargetId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [tab, setTab] = useState("favoritos");

  const contentMenus = sortMenusDesc(data.menus).filter(menuHasContent);
  // Históricos never lists the active menú — para verlo siempre está el tab
  // "Menú" del nav (2026-08-25: esta pantalla dejó de mostrar su propia card
  // "Actual", sería una tercera puerta al mismo sitio). Favoritos sí debe
  // listarlo — si no, favoritear el menú activo con el ♥ lo haría
  // desaparecer de vista, aunque siga siendo el activo.
  const history = contentMenus.filter((m) => m.id !== data.activeMenuId);
  const favorites = contentMenus.filter((m) => m.isFavorite);
  const visibleList = tab === "favoritos" ? favorites : history;
  const reuseTarget = reuseTargetId ? data.menus?.[reuseTargetId] : null;

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh", paddingBottom: bottomNavSpacer() }}>
      {/* Title band — mismo tratamiento que Recetas/Compra/Menú (2026-08-24). */}
      <div style={{ background: HEADER_BAND, padding: "20px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                border: "1px solid #e0eae3", background: "#fff", color: "#2d5a3d",
                borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Atrás
            </button>
          )}
          <span
            style={{
              width: 36, height: 36, borderRadius: 11, background: "#daf0e4",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <History size={18} color="#1f7a52" strokeWidth={2.4} />
          </span>
          <h2 style={titleStyle}>Menús guardados</h2>
        </div>
      </div>

      {/* Solo histórico y favoritos (2026-08-25) — se quitó la card "Menú
          actual" que vivía aquí: para volver a tu menú siempre está el tab
          "Menú" del nav, así que repetirlo en esta pantalla era una puerta
          de más al mismo sitio, no una nueva. */}
      <div style={{ padding: "20px 20px 0" }}>
        {!hasAccount ? (
          <>
            <SectionLabel>Histórico</SectionLabel>
            <GuestHistoryPrompt onSignIn={onSignIn} />
          </>
        ) : (
          <>
            <MenuTabSwitch
              tab={tab}
              onChange={setTab}
              favCount={favorites.length}
              histCount={history.length}
            />
            {visibleList.length === 0 ? (
              <EmptyState
                img={
                  tab === "favoritos"
                    ? "/avatares/cards/empty_menus_favoritos.jpg"
                    : "/avatares/cards/empty_menus_historico.jpg"
                }
                imgPosition="center 22%"
                text={
                  tab === "favoritos"
                    ? "Aún no has guardado menús favoritos"
                    : "Todavía no tienes menús anteriores"
                }
                subtitle={
                  tab === "favoritos"
                    ? "Pulsa el ♥ en tu menú para guardarlo aquí y reutilizarlo cuando quieras."
                    : "En cuanto generes uno nuevo, el actual pasará aquí."
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleList.map((m) => {
                  const isActive = m.id === data.activeMenuId;
                  return (
                    <HistoryMenuRow
                      key={m.id}
                      menu={m}
                      isActive={isActive}
                      onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(m.id) : undefined}
                      onReuse={onReuseMenu ? () => setReuseTargetId(m.id) : undefined}
                      onDelete={onDeleteHistory ? () => onDeleteHistory(m.id) : undefined}
                      isOpening={openingId === m.id}
                      onOpen={async () => {
                        if (isActive) {
                          onOpenCurrent();
                          return;
                        }
                        if (openingId) return;
                        setOpeningId(m.id);
                        try {
                          await onOpenHistory(m.id);
                        } finally {
                          setOpeningId(null);
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {reuseTarget && (
        <ReuseMenuSheet
          menu={reuseTarget}
          onClose={() => setReuseTargetId(null)}
          onConfirm={(opts) => {
            setReuseTargetId(null);
            onReuseMenu(reuseTargetId, opts);
          }}
        />
      )}

      <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>

      {/* No longer a bottom-nav tab (2026-08-25) — reached from the ⋮ menu
          on "Menú actual", so it highlights that tab, same pattern as
          UserStatsScreen/HomeProfileScreen highlighting "dashboard". */}
      <BottomNav active="menu" onNav={onNav} />
    </div>
  );
}
