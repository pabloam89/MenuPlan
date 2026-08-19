import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  LogOut,
  Share2,
  Plus,
  BookOpen,
  Heart,
  NotebookPen,
} from "lucide-react";
import {
  BottomNav,
  bottomNavSpacer,
  EmptyIllustration,
  GoogleButton,
  SegmentedTabBar,
  SegmentedTabButton,
} from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";
import { filterOwnCreatedRecipes } from "../lib/userRecipes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const IMG_OWNER = "/avatares/hogares/hogar_propietario.jpg";
const IMG_VIEWER = "/avatares/hogares/hogar_visitante.jpg";
const IMG_BIB_MINE = "/avatares/cards/recetas_solo_mias.png";
const IMG_BIB_FAV = "/avatares/cards/empty_favoritas.jpg";

function setupBadge(status) {
  if (status === "active") return null;
  if (status === "invite_ready") return "Listo para invitar";
  return "Sin configurar";
}

function buildSlots(households) {
  const owner =
    households.find((h) => h.role === "owner" && h.isOwn) ??
    households.find((h) => h.role === "owner");
  const viewers = households.filter((h) => h.role === "viewer");
  return [
    { kind: "owner", household: owner ?? null, label: "Tu hogar", roleLabel: "Propietario" },
    { kind: "viewer", household: viewers[0] ?? null, label: "Hogar visitante 1", roleLabel: "Visitante" },
    { kind: "viewer", household: viewers[1] ?? null, label: "Hogar visitante 2", roleLabel: "Visitante" },
  ];
}

function SlotCard({
  slot,
  active,
  onSwitch,
  onLeave,
  onAdvanceSetup,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {
  const h = slot.household;
  const empty = !h;
  const img = slot.kind === "owner" ? IMG_OWNER : IMG_VIEWER;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
        overflow: "hidden",
        boxShadow: active ? "0 14px 28px -16px rgba(45,90,61,.45)" : "0 8px 20px -14px rgba(20,47,29,.12)",
        opacity: empty ? 0.72 : 1,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#eef4f0", overflow: "hidden" }}>
        <img
          src={img}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            display: "block",
            filter: empty ? "grayscale(.85) brightness(1.05)" : "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: empty
              ? "linear-gradient(180deg, rgba(244,248,245,.15) 0%, rgba(244,248,245,.75) 100%)"
              : "linear-gradient(180deg, rgba(10,26,16,0) 40%, rgba(10,26,16,.55) 100%)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 800,
            background: slot.kind === "owner" ? GREEN : "rgba(255,255,255,.92)",
            color: slot.kind === "owner" ? "#fff" : GREEN,
          }}
        >
          {slot.roleLabel}
        </span>
        {active && h && (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 800,
              background: "#fff",
              color: GREEN,
            }}
          >
            Activo
          </span>
        )}
      </div>

      <div style={{ padding: "14px 14px 12px" }}>
        {h && renamingId === h.id ? (
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => commitRename(h.id)}
            onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
            autoFocus
            style={{
              width: "100%",
              fontSize: 16,
              fontWeight: 800,
              border: "1.5px solid #c8ddd0",
              borderRadius: 10,
              padding: "8px 10px",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => h?.role === "owner" && startRename(h)}
            style={{
              margin: 0,
              padding: 0,
              border: "none",
              background: "transparent",
              font: "inherit",
              fontSize: 17,
              fontWeight: 900,
              color: empty ? "#9ab0a1" : INK,
              cursor: h?.role === "owner" ? "pointer" : "default",
              textAlign: "left",
              letterSpacing: "-.3px",
            }}
          >
            {h?.name ?? slot.label}
          </button>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, minHeight: 22 }}>
          {h && setupBadge(h.setupStatus) && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fff7e6", color: "#9a6b00" }}>
              {setupBadge(h.setupStatus)}
            </span>
          )}
          {empty && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#f0f4f1", color: "#7a9485" }}>
              {slot.kind === "owner" ? "Se crea al iniciar sesión" : "Únete con un enlace"}
            </span>
          )}
        </div>

        {h && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {!active && (
              <button
                type="button"
                onClick={() => onSwitch?.(h.id)}
                style={{
                  flex: 1,
                  minWidth: 120,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: GREEN,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Usar este hogar
              </button>
            )}
            {h.role === "viewer" && (
              <button
                type="button"
                onClick={() => onLeave?.(h.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1.5px solid #f0d4d4",
                  background: "#fff",
                  color: "#b42318",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <LogOut size={15} />
                Abandonar
              </button>
            )}
            {h.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
              <button
                type="button"
                onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
                style={{
                  flex: 1,
                  minWidth: 120,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: GREEN,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Configurar hogar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function HouseholdsScreen({
  user,
  households = [],
  activeHousehold,
  activeHouseholdId,
  readOnly,
  canShareInvite,
  inviteUrl,
  onNav,
  onBack,
  onSwitchHousehold,
  onLeaveHousehold,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
  userRecipes = [],
  recipeVotes = {},
  scopeGroups = [],
  onSetFavoriteScope,
  onOpenRecipe,
  onOpenRecipePlanner,
  onBrowseGarnishCombo,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [bibOpen, setBibOpen] = useState(false);
  const [bibTab, setBibTab] = useState("mine");

  const g = googleInfo(user);
  const slots = useMemo(() => buildSlots(households), [households]);
  const favoriteIds = useMemo(() => new Set(favoriteRecipeIds(recipeVotes)), [recipeVotes]);
  const ownRecipes = useMemo(
    () => filterOwnCreatedRecipes(userRecipes, user),
    [userRecipes, user],
  );

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", inviteUrl);
    }
  };

  const startRename = (h) => {
    setRenamingId(h.id);
    setRenameDraft(h.name);
  };

  const commitRename = async (id) => {
    const targetId = id ?? renamingId;
    if (!targetId || !renameDraft.trim()) {
      setRenamingId(null);
      return;
    }
    await onRenameHousehold?.(targetId, renameDraft.trim());
    setRenamingId(null);
  };

  const BIB_TABS = [
    { id: "mine", label: "Mis recetas", count: ownRecipes.length, Icon: NotebookPen },
    { id: "favorites", label: "Favoritas", count: favoriteIds.size, Icon: Heart },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: INK }}>
      <div
        style={{
          flex: 1,
          padding: `0 18px calc(${bottomNavSpacer()} + 18px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "relative",
            background: MENU_GRADIENT,
            borderRadius: "0 0 26px 26px",
            padding: "22px 18px 24px",
            margin: "0 -18px 18px",
            overflow: "hidden",
            boxShadow: "0 18px 34px -16px rgba(20,47,29,.55)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  border: "1px solid rgba(255,255,255,.35)",
                  background: "rgba(255,255,255,.16)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "7px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                Atrás
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-.4px" }}>
                Hogares
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.88)", lineHeight: 1.35 }}>
                {user ? "Tu hogar, invitados y biblioteca personal" : "Inicia sesión para sincronizar"}
              </p>
            </div>
            {user && (
              <img
                src={IMG_OWNER}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,.45)",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        </div>

        {!user && (
          <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>
              Inicia sesión para sincronizar hogares entre dispositivos.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        )}

        {user && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              {slots.map((slot) => (
                <SlotCard
                  key={slot.kind + (slot.household?.id ?? slot.label)}
                  slot={slot}
                  active={slot.household?.id === activeHouseholdId}
                  onSwitch={onSwitchHousehold}
                  onLeave={onLeaveHousehold}
                  onAdvanceSetup={onAdvanceSetup}
                  renamingId={renamingId}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  startRename={startRename}
                  commitRename={commitRename}
                />
              ))}
            </div>

            {canShareInvite && inviteUrl && (
              <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Share2 size={18} color={GREEN} />
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Compartir hogar</p>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#5a7262", lineHeight: 1.45 }}>
                  Envía este enlace por WhatsApp. Quien lo abra entrará en solo lectura.
                </p>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: GREEN,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? "Enlace copiado" : "Copiar enlace de invitación"}
                </button>
              </div>
            )}

            {readOnly && activeHousehold && (
              <div style={{ background: "#fffdf5", border: "1.5px solid #f5e6b8", borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#7a5d00" }}>
                  Estás en <strong>{activeHousehold.name}</strong> como visitante (solo lectura).
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setBibOpen((v) => !v)}
              style={{
                width: "100%",
                marginBottom: bibOpen ? 0 : 8,
                padding: 0,
                border: "1.5px solid #cfe3d8",
                borderRadius: bibOpen ? "16px 16px 0 0" : 16,
                background: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                overflow: "hidden",
                boxShadow: "0 8px 22px -14px rgba(20,47,29,.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "stretch", minHeight: 88 }}>
                <div style={{ width: "38%", position: "relative", overflow: "hidden", background: "#e6f3ea" }}>
                  <img src={IMG_BIB_MINE} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1, padding: "14px 12px 14px 14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={16} color={GREEN} />
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: INK }}>Tu biblioteca</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#7a9485", lineHeight: 1.35 }}>
                    {ownRecipes.length} recetas creadas · {favoriteIds.size} favoritas
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingRight: 14 }}>
                  {bibOpen ? <ChevronUp size={18} color="#9ab0a1" /> : <ChevronDown size={18} color="#9ab0a1" />}
                </div>
              </div>
            </button>

            {bibOpen && (
              <div
                style={{
                  background: "#fff",
                  border: "1.5px solid #cfe3d8",
                  borderTop: "1px solid #eef2ef",
                  borderRadius: "0 0 16px 16px",
                  padding: "14px 0 8px",
                  marginBottom: 16,
                  boxShadow: "0 8px 22px -14px rgba(20,47,29,.15)",
                }}
              >
                <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <SegmentedTabBar>
                      {BIB_TABS.map((t) => (
                        <SegmentedTabButton
                          key={t.id}
                          selected={bibTab === t.id}
                          onClick={() => setBibTab(t.id)}
                          label={t.label}
                          count={t.count}
                          Icon={t.Icon}
                          accent={GREEN}
                        />
                      ))}
                    </SegmentedTabBar>
                  </div>
                  {onOpenRecipePlanner && (
                    <button
                      type="button"
                      onClick={onOpenRecipePlanner}
                      style={{
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "8px 11px",
                        borderRadius: 11,
                        border: "none",
                        background: GREEN,
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <Plus size={14} strokeWidth={2.8} />
                      Crear
                    </button>
                  )}
                </div>

                {bibTab === "favorites" && (
                  <CatalogBrowserSheet
                    inline
                    inlinePadding={14}
                    reference
                    recipeVotes={recipeVotes}
                    scopeGroups={scopeGroups}
                    onSetFavoriteScope={onSetFavoriteScope}
                    onOpenRecipe={onOpenRecipe}
                    favoriteIds={favoriteIds}
                    emptyImg={IMG_BIB_FAV}
                    emptyLabel="Aún no tienes favoritas"
                    emptySubtitle="Pulsa el corazón en cualquier receta del catálogo para guardarla aquí."
                  />
                )}

                {bibTab === "mine" && (
                  ownRecipes.length === 0 ? (
                    <div style={{ padding: "8px 14px 12px" }}>
                      <EmptyIllustration
                        img="/avatares/cards/empty_recetas_propias.jpg"
                        title="Aún no tienes recetas propias"
                        subtitle="Crea tu primera receta y la IA rellenará macros, pasos y foto."
                        maxWidth={220}
                        imgAspect="1 / 1"
                        imgPosition="center"
                      >
                        {onOpenRecipePlanner && (
                          <button
                            type="button"
                            onClick={onOpenRecipePlanner}
                            style={{
                              marginTop: 14,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "11px 18px",
                              borderRadius: 13,
                              border: "none",
                              background: GREEN,
                              color: "#fff",
                              fontSize: 14,
                              fontWeight: 800,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            <Plus size={15} strokeWidth={2.8} /> Crear receta
                          </button>
                        )}
                      </EmptyIllustration>
                    </div>
                  ) : (
                    <CatalogBrowserSheet
                      inline
                      inlinePadding={14}
                      reference
                      recipeVotes={recipeVotes}
                      scopeGroups={scopeGroups}
                      onSetFavoriteScope={onSetFavoriteScope}
                      onOpenRecipe={onOpenRecipe}
                      onBrowseGarnishCombo={onBrowseGarnishCombo}
                      sourceRecipes={ownRecipes}
                      ownRecipesView
                      emptyLabel="Ninguna de tus recetas coincide con esos filtros."
                    />
                  )
                )}
              </div>
            )}

            {g?.name && (
              <p style={{ margin: "8px 0 0", textAlign: "center", fontSize: 12, color: "#9ab0a1", fontWeight: 600 }}>
                {g.name}
              </p>
            )}
          </>
        )}
      </div>
      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
