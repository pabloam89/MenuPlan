import { useState, useEffect, useMemo, useCallback, useRef } from "react";

function familyLabel(raw) {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchApprovals() {
  const r = await fetch("/api/approvals");
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { combo_id: { state, reason? } }
}

async function pushApproval(id, state, reason) {
  await fetch("/api/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, state: state ?? null, reason: reason ?? null }),
  });
}

async function pushBatch(updates) {
  await fetch("/api/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch: updates }),
  });
}

// ── RejectModal ───────────────────────────────────────────────────────────────

function RejectModal({ dish, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKey = (e) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onConfirm(reason.trim());
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal__title">¿Por qué rechazas esta imagen?</p>
        <p className="modal__dish">{dish.name}</p>
        <textarea
          ref={textareaRef}
          className="modal__textarea"
          placeholder="Ej: el plato aparece con cuchara encima, falta el ingrediente principal…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
        />
        <p className="modal__hint">Opcional · Ctrl+Enter para confirmar</p>
        <div className="modal__actions">
          <button className="modal__btn modal__btn--cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="modal__btn modal__btn--confirm"
            onClick={() => onConfirm(reason.trim())}
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DishCard ─────────────────────────────────────────────────────────────────

function DishCard({ dish, approval, onApprove, onReject }) {
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const state = approval?.state;

  return (
    <>
      <article className={`card ${state ? `card--${state}` : ""}`}>
        <div className="card__img-wrap">
          <img
            src={dish.imageUrl}
            alt={dish.name}
            className={`card__img ${loaded ? "card__img--loaded" : ""}`}
            onLoad={() => setLoaded(true)}
            loading="lazy"
          />
          {!loaded && <div className="card__skeleton" />}
          <button
            className="card__zoom"
            aria-label="Ver en grande"
            onClick={() => setZoomed(true)}
          >
            ⤢
          </button>
          <div className="card__state-badge">
            {state === "approved" && <span className="badge badge--ok">✓</span>}
            {state === "rejected" && <span className="badge badge--no">✗</span>}
          </div>
        </div>

        <div className="card__body">
          <p className="card__name">{dish.name}</p>
          <p className="card__id">{dish.combo_id}</p>
          {state === "rejected" && approval?.reason && (
            <p className="card__reason" title={approval.reason}>
              💬 {approval.reason}
            </p>
          )}
          <div className="card__actions">
            <button
              className={`btn btn--approve ${state === "approved" ? "btn--active" : ""}`}
              onClick={onApprove}
            >
              Aprobar
            </button>
            <button
              className={`btn btn--reject ${state === "rejected" ? "btn--active" : ""}`}
              onClick={onReject}
            >
              {state === "rejected" ? "Rechazada ✗" : "Rechazar"}
            </button>
          </div>
        </div>
      </article>

      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(false)}>
          <div className="lightbox__inner">
            <img src={dish.imageUrl} alt={dish.name} className="lightbox__img" />
            <p className="lightbox__name">{dish.name}</p>
            <button className="lightbox__close" onClick={() => setZoomed(false)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [approvals, setApprovals] = useState({}); // { combo_id: { state, reason? } }
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [activeFamily, setActiveFamily] = useState("all");
  const [filter, setFilter] = useState("all");
  const [exported, setExported] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // dish being rejected

  useEffect(() => {
    fetch(`/catalog.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setCatalog(d); setCatalogLoading(false); })
      .catch(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    fetchApprovals()
      .then((d) => { setApprovals(d); setApprovalsLoading(false); })
      .catch(() => setApprovalsLoading(false));
  }, []);

  const setApproval = useCallback((id, state, reason) => {
    setApprovals((prev) => {
      const next = { ...prev };
      if (!state) {
        delete next[id];
      } else {
        next[id] = { state, ...(reason ? { reason } : {}) };
      }
      pushApproval(id, state || null, reason || null).catch(() => setSyncError(true));
      return next;
    });
  }, []);

  // Clicking approve: if already approved → clear; else approve
  const handleApprove = useCallback((dish) => {
    if (approvals[dish.combo_id]?.state === "approved") {
      setApproval(dish.combo_id, null);
    } else {
      setApproval(dish.combo_id, "approved");
    }
  }, [approvals, setApproval]);

  // Clicking reject: if already rejected → clear; else open modal
  const handleReject = useCallback((dish) => {
    if (approvals[dish.combo_id]?.state === "rejected") {
      setApproval(dish.combo_id, null);
    } else {
      setRejectTarget(dish);
    }
  }, [approvals, setApproval]);

  const confirmReject = (reason) => {
    setApproval(rejectTarget.combo_id, "rejected", reason || null);
    setRejectTarget(null);
  };

  const families = useMemo(
    () => [...new Set(catalog.map((c) => c.family))].sort(),
    [catalog]
  );

  const visible = useMemo(() => {
    return catalog.filter((c) => {
      const matchFamily = activeFamily === "all" || c.family === activeFamily;
      const matchFilter =
        filter === "all" ||
        (filter === "pending" && !approvals[c.combo_id]) ||
        approvals[c.combo_id]?.state === filter;
      return matchFamily && matchFilter;
    });
  }, [catalog, activeFamily, filter, approvals]);

  const stats = useMemo(() => {
    const approved = Object.values(approvals).filter((v) => v?.state === "approved").length;
    const rejected = Object.values(approvals).filter((v) => v?.state === "rejected").length;
    return { approved, rejected, pending: catalog.length - approved - rejected };
  }, [approvals, catalog]);

  const exportRejected = () => {
    const byId = Object.fromEntries(catalog.map((c) => [c.combo_id, c]));
    const rejected = Object.entries(approvals)
      .filter(([, v]) => v?.state === "rejected")
      .map(([id, v]) => ({
        combo_id: id,
        name: byId[id]?.name ?? id,
        reason: v.reason ?? "",
      }));

    if (!rejected.length) return alert("No hay imágenes rechazadas todavía.");

    const blob = new Blob([JSON.stringify(rejected, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rechazadas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const approveAll = () => {
    const updates = visible
      .filter((d) => approvals[d.combo_id]?.state !== "approved")
      .map((d) => ({ id: d.combo_id, state: "approved" }));
    if (!updates.length) return;
    setApprovals((prev) => {
      const next = { ...prev };
      updates.forEach(({ id }) => { next[id] = { state: "approved" }; });
      return next;
    });
    pushBatch(updates).catch(() => setSyncError(true));
  };

  if (catalogLoading || approvalsLoading) {
    return (
      <div className="splash">
        <div className="splash__dot" />
        <p>Cargando catálogo…</p>
      </div>
    );
  }

  return (
    <div className="layout">
      {rejectTarget && (
        <RejectModal
          dish={rejectTarget}
          onConfirm={confirmReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      <header className="header">
        <div className="header__left">
          <span className="header__brand">MenuPlan</span>
          <h1 className="header__title">Revisión de imágenes</h1>
        </div>
        <div className="header__right">
          {syncError && (
            <span className="sync-error" title="Algunos cambios no se guardaron">
              ⚠ Error de sync
            </span>
          )}
          <div className="stats">
            <span className="stat stat--ok">{stats.approved}<em>aprobadas</em></span>
            <span className="stat stat--no">{stats.rejected}<em>rechazadas</em></span>
            <span className="stat stat--pending">{stats.pending}<em>pendientes</em></span>
          </div>
          <button className="action-btn" onClick={exportRejected}>
            {exported ? "¡Descargado!" : "Exportar rechazadas"}
          </button>
        </div>
      </header>

      <nav className="filters">
        <div className="filters__families">
          <button
            className={`pill ${activeFamily === "all" ? "pill--active" : ""}`}
            onClick={() => setActiveFamily("all")}
          >
            Todo <span className="pill__count">{catalog.length}</span>
          </button>
          {families.map((fam) => (
            <button
              key={fam}
              className={`pill ${activeFamily === fam ? "pill--active" : ""}`}
              onClick={() => setActiveFamily(fam)}
            >
              {familyLabel(fam)}{" "}
              <span className="pill__count">
                {catalog.filter((c) => c.family === fam).length}
              </span>
            </button>
          ))}
        </div>
        <div className="filters__state">
          {["all", "pending", "approved", "rejected"].map((s) => (
            <button
              key={s}
              className={`state-pill ${filter === s ? "state-pill--active" : ""}`}
              onClick={() => setFilter(s)}
            >
              {{ all: "Todas", pending: "Pendientes", approved: "Aprobadas", rejected: "Rechazadas" }[s]}
            </button>
          ))}
          <button className="action-btn action-btn--sm" onClick={approveAll}>
            Aprobar visibles
          </button>
        </div>
      </nav>

      <main className="grid">
        {visible.length === 0 && (
          <p className="empty">No hay imágenes que coincidan con el filtro.</p>
        )}
        {visible.map((dish) => (
          <DishCard
            key={dish.combo_id}
            dish={dish}
            approval={approvals[dish.combo_id]}
            onApprove={() => handleApprove(dish)}
            onReject={() => handleReject(dish)}
          />
        ))}
      </main>

      <footer className="footer">
        <p>{catalog.length} platos · {families.length} familias · MenuPlan © 2026</p>
      </footer>
    </div>
  );
}
