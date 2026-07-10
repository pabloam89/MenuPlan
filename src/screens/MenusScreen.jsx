import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronRight, Loader2, Pencil, RotateCw, Sparkles, Star, Trash2, X } from "lucide-react";
import { BottomNav, GoogleButton, APP_SHELL_MAX_WIDTH, bottomNavSpacer } from "../components/ui.jsx";
import { sortMenusDesc, orderedWeeks, formatMenuRangeLabel, clampWeekCount, MAX_MENU_WEEKS } from "../lib/menuArchive.js";

const cardStyle = {
  background: "#fff",
  border: "1px solid #e6eee8",
  borderRadius: 18,
  padding: 18,
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

function EmptyState({ text, onAction, actionLabel }) {
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
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            border: "none", borderRadius: 999, padding: "12px 22px",
            background: "linear-gradient(135deg,#2d5a3d,#4cba6e)", color: "#fff",
            fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {actionLabel}
        </button>
      )}
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

function CardActionButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "10px 0", borderRadius: 11, border: "none", cursor: "pointer", fontFamily: "inherit",
        background: danger ? "#fdf1f0" : "#f0f5f1",
        color: danger ? "#c0392b" : "#2d5a3d",
        fontSize: 12, fontWeight: 800,
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function DeleteMenuConfirmSheet({ onCancel, onConfirm }) {
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
            Perderás los platos y la compra generada. El histórico no se ve afectado.
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

function ActiveMenuCard({ menu, onOpen, onRegenerate, onEdit, onDelete }) {
  const weeks = orderedWeeks(menu);
  const rangeLabel = formatMenuRangeLabel(menu);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={cardStyle}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          border: "none", background: "transparent", padding: 0,
          display: "flex", alignItems: "center", gap: 14,
        }}
      >
        <div
          style={{
            width: 46, height: 46, borderRadius: 13, background: "#2d5a3d",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Calendar size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#142f1d" }}>Menú actual</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7a8a7f" }}>{rangeLabel}</span>
            {weeks.length > 1 && <WeeksPill weeks={weeks} />}
          </div>
        </div>
        <ChevronRight size={18} color="#9ab0a1" />
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid #eef2ef" }}>
        <CardActionButton icon={RotateCw} label="Regenerar" onClick={onRegenerate} />
        <CardActionButton icon={Pencil} label="Editar" onClick={onEdit} />
        <CardActionButton icon={Trash2} label="Borrar" danger onClick={() => setConfirmDelete(true)} />
      </div>

      {confirmDelete && (
        <DeleteMenuConfirmSheet
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
    </div>
  );
}

function HistoryMenuRow({ menu, onToggleFavorite, onReuse, onOpen, isOpening }) {
  const weeks = orderedWeeks(menu);
  const rangeLabel = formatMenuRangeLabel(menu);
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
          <div style={{ fontSize: 14, fontWeight: 800, color: "#142f1d" }}>{rangeLabel}</div>
          <div style={{ fontSize: 12, color: "#9ab0a1", marginTop: 1 }}>
            {weeks.length} semana{weeks.length === 1 ? "" : "s"}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label="Marcar como favorito"
        style={{
          border: "none", background: "transparent", cursor: "pointer", padding: 6, flexShrink: 0,
        }}
      >
        <Star size={18} color={menu.isFavorite ? "#f59e0b" : "#d5ddd8"} fill={menu.isFavorite ? "#f59e0b" : "none"} />
      </button>
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

export function MenusScreen({
  data,
  hasAccount,
  onNav,
  onOpenCurrent,
  onReuseMenu,
  onToggleFavorite,
  onSignIn,
  onRegenerateActive,
  onEditActive,
  onDeleteActive,
  onOpenHistory,
}) {
  const [reuseTargetId, setReuseTargetId] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const activeMenu = data.menus?.[data.activeMenuId] ?? null;
  const history = sortMenusDesc(data.menus).filter((m) => m.id !== data.activeMenuId);
  const reuseTarget = reuseTargetId ? data.menus?.[reuseTargetId] : null;

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh", paddingBottom: bottomNavSpacer() }}>
      <div style={{ padding: "20px 20px 0" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#142f1d", margin: "0 0 20px", letterSpacing: "-.7px" }}>
          Menús
        </h2>
      </div>

      <div style={{ padding: "0 20px" }}>
        <SectionLabel>Actual</SectionLabel>
        {activeMenu ? (
          <ActiveMenuCard
            menu={activeMenu}
            onOpen={onOpenCurrent}
            onRegenerate={onRegenerateActive}
            onEdit={onEditActive}
            onDelete={onDeleteActive}
          />
        ) : (
          <EmptyState
            text="Todavía no tienes un menú generado."
            onAction={onOpenCurrent}
            actionLabel="Generar menú"
          />
        )}

        <div style={{ height: 1, background: "#e6eee8", margin: "24px 0 18px" }} />

        <SectionLabel>Histórico</SectionLabel>
        {!hasAccount ? (
          <GuestHistoryPrompt onSignIn={onSignIn} />
        ) : history.length === 0 ? (
          <EmptyState text="Todavía no tienes menús anteriores. En cuanto generes uno nuevo, el actual pasará aquí." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((m) => (
              <HistoryMenuRow
                key={m.id}
                menu={m}
                onToggleFavorite={() => onToggleFavorite(m.id)}
                onReuse={() => setReuseTargetId(m.id)}
                isOpening={openingId === m.id}
                onOpen={async () => {
                  if (openingId) return;
                  setOpeningId(m.id);
                  try {
                    await onOpenHistory(m.id);
                  } finally {
                    setOpeningId(null);
                  }
                }}
              />
            ))}
          </div>
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

      <BottomNav active="menus" onNav={onNav} />
    </div>
  );
}
