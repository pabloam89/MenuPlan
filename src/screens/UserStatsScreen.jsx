import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Globe,
  Heart,
  Home,
  Lock,
  NotebookPen,
  Search,
  ThumbsUp,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import {
  Avatar,
  BottomNav,
  bottomNavSpacer,
  GoogleButton,
  SegmentedTabBar,
  SegmentedTabButton,
} from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { menuHasContent } from "../lib/menuArchive.js";
import { favoriteRecipeIds, voteOf } from "../lib/recipeVotes.js";
import { filterOwnCreatedRecipes } from "../lib/userRecipes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MUTED = "#5a7262";
const HEADER_BAND = "#e9f4ed";
const HERO_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const PROFILE_TABS = [
  { id: "resumen", label: "Resumen", Icon: BarChart3 },
  { id: "amigos", label: "Amigos", Icon: UsersRound },
  { id: "actividad", label: "Actividad", Icon: ThumbsUp },
];

const PERFIL_EMPTY_IMG = {
  sinSolicitudes: "/avatares/cards/perfil/perfil_sin_solicitudes.png",
  sinAmigos: "/avatares/cards/perfil/perfil_sin_amigos.png",
  buscar: "/avatares/cards/perfil/perfil_buscar_amigos.png",
  sinValoraciones: "/avatares/cards/perfil/perfil_sin_valoraciones.png",
  feedSemanal: "/avatares/cards/perfil/perfil_feed_semanal.png",
};

const STATS_SECTION_BG = "/avatares/cards/perfil/fondo_stats.png";

function formatMemberSince(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatTile({ icon: Icon, value, label, ink = GREEN, emptyLabel = "Sin" }) {
  const valueColor = ink === GREEN ? "#1e4a32" : ink;
  const isEmpty = value === 0 || value === "0";
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 102,
        aspectRatio: "1 / 1",
        borderRadius: 12,
        background: "rgba(255,255,255,0.68)",
        backdropFilter: "blur(10px) saturate(1.15)",
        WebkitBackdropFilter: "blur(10px) saturate(1.15)",
        border: "1px solid rgba(255,255,255,0.78)",
        boxShadow: "0 3px 14px rgba(20,47,29,0.08)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "7px 7px 8px",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(20,47,29,0.06)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 4px rgba(20,47,29,0.06)",
          flexShrink: 0,
        }}
      >
        <Icon size={17} color={ink} strokeWidth={2.35} />
      </span>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: 0,
        }}
      >
        {isEmpty ? (
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: MUTED,
              lineHeight: 1,
            }}
          >
            {emptyLabel}
          </span>
        ) : (
          <span
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: valueColor,
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            {value}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: INK,
          lineHeight: 1.15,
          letterSpacing: ".01em",
          textAlign: "center",
          paddingInline: 2,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatsSection({ children }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 14,
        border: "1.5px solid rgba(255,255,255,0.55)",
        boxShadow: "0 8px 24px rgba(20,47,29,0.06)",
        minHeight: 248,
      }}
    >
      <img
        src={STATS_SECTION_BG}
        alt=""
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 85% 70% at 50% 45%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 65%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "26px 22px 28px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            justifyItems: "center",
            alignItems: "center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Bloque plano: título pequeño + una sola card (sin franja + card anidada). */
function FlatBlock({ title, icon: Icon, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            margin: "0 2px 8px",
          }}
        >
          {Icon && <Icon size={15} color={GREEN} strokeWidth={2.3} />}
          <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function ProfileEmptyState({ img, title, subtitle, centerTitle = false }) {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        border: "1.5px solid #e3ebe6",
        background: "#fff",
      }}
    >
      <img
        src={img}
        alt=""
        loading="lazy"
        style={{
          width: "100%",
          aspectRatio: "16 / 10",
          objectFit: "cover",
          objectPosition: "center",
          display: "block",
        }}
      />
      <div style={{ padding: "12px 14px 14px", textAlign: centerTitle ? "center" : "left" }}>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.35 }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ margin: "5px 0 0", fontSize: 12.5, fontWeight: 600, color: MUTED, lineHeight: 1.45 }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, color = INK, last = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: last ? "none" : "1px solid #f0f4f1",
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function VisibilityChip({ icon: Icon, label, count, bg, color }) {
  const empty = count === 0;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: bg,
        borderRadius: 12,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        textAlign: "center",
      }}
    >
      <Icon size={15} color={color} strokeWidth={2.2} />
      <span style={{ fontSize: empty ? 13 : 18, fontWeight: 800, color: empty ? MUTED : color, lineHeight: 1 }}>
        {empty ? "Sin" : count}
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, color, lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

function ResumenTab({ stats, onOpenBiblioteca }) {
  return (
    <>
      <StatsSection>
        <StatTile icon={CalendarDays} value={stats.savedMenus} label="Menús guardados" />
        <StatTile icon={Home} value={stats.householdCount} label="Hogares" ink="#4a6fd0" />
        <StatTile icon={NotebookPen} value={stats.ownRecipes.length} label="Recetas creadas" />
        <StatTile icon={Heart} value={stats.favoriteCount} label="Favoritas personales" ink="#e0405a" />
      </StatsSection>

      {stats.ownRecipes.length > 0 && (
        <FlatBlock title="Visibilidad de recetas" icon={NotebookPen}>
          <div style={{ display: "flex", gap: 8, marginBottom: onOpenBiblioteca ? 10 : 0 }}>
            {/* Dos cajas, no tres (0046): una receta esta publicada o no, y a
                quien llega lo decide tu cuenta. "Amigos" era una audiencia
                propia que ya no existe — las viejas cuentan como publicadas,
                que es lo que la base hace con ellas. */}
            <VisibilityChip icon={Globe} label="Publicadas" count={stats.visibility.public} bg="#e6f3ea" color={GREEN} />
            <VisibilityChip icon={Lock} label="Solo para mí" count={stats.visibility.private} bg="#f5edfc" color="#5a2d7a" />
          </div>
          {onOpenBiblioteca && (
            <button
              type="button"
              onClick={onOpenBiblioteca}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1.5px solid #d5e6da",
                background: "#fff",
                color: GREEN,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <BookOpen size={15} strokeWidth={2.3} />
              Ver en biblioteca
            </button>
          )}
        </FlatBlock>
      )}
    </>
  );
}

function AmigosTab() {
  return (
    <>
      <FlatBlock title="Solicitudes" icon={UserPlus}>
        <ProfileEmptyState
          img={PERFIL_EMPTY_IMG.sinSolicitudes}
          title="Sin solicitudes pendientes"
          centerTitle
        />
      </FlatBlock>

      <FlatBlock title="Tus amigos" icon={UsersRound}>
        <ProfileEmptyState
          img={PERFIL_EMPTY_IMG.sinAmigos}
          title="0 amigos por ahora"
          centerTitle
        />
      </FlatBlock>

      <FlatBlock title="Buscar" icon={Search}>
        <ProfileEmptyState
          img={PERFIL_EMPTY_IMG.buscar}
          title="Encuentra cocineros"
          centerTitle
        />
      </FlatBlock>
    </>
  );
}

function ActividadTab({ stats }) {
  const hasVotes = stats.votesUp > 0 || stats.votesDown > 0;

  return (
    <>
      <FlatBlock title="Valoraciones" icon={ThumbsUp}>
        {hasVotes ? (
          <div
            style={{
              borderRadius: 16,
              border: "1.5px solid #e3ebe6",
              background: "#fff",
              padding: "4px 14px 6px",
            }}
          >
            <BreakdownRow label="Me gusta dados" value={stats.votesUp} color={GREEN} />
            <BreakdownRow label="No me gusta dados" value={stats.votesDown} color="#b42318" last />
          </div>
        ) : (
          <ProfileEmptyState
            img={PERFIL_EMPTY_IMG.sinValoraciones}
            title="Aún no has valorado recetas"
            subtitle="Los 👍/👎 de catálogo y recetas de otros contarán aquí."
          />
        )}
      </FlatBlock>

      <FlatBlock title="Social" icon={Users}>
        <ProfileEmptyState
          img={PERFIL_EMPTY_IMG.feedSemanal}
          title="Resumen semanal"
          subtitle="Verás platos que copiaste de amigos, recetas populares entre tu gente y «lo cociné esta semana»."
        />
      </FlatBlock>
    </>
  );
}

/**
 * Perfil de cuenta Google: stats personales (menús, hogares, recetas, favoritas).
 * Distinto del perfil del hogar (comensales) y de la biblioteca de recetas.
 */
export function UserStatsScreen({
  user = null,
  households = [],
  menus = {},
  userRecipes = [],
  recipeVotes = {},
  onNav,
  onBack,
  onOpenBiblioteca,
  onSignIn,
}) {
  const [tab, setTab] = useState("resumen");
  const g = googleInfo(user);

  const stats = useMemo(() => {
    const ownRecipes = filterOwnCreatedRecipes(userRecipes, user);
    const favoriteIds = favoriteRecipeIds(recipeVotes);
    let votesUp = 0;
    let votesDown = 0;
    for (const entry of Object.values(recipeVotes ?? {})) {
      const v = voteOf(entry);
      if (v === "up") votesUp += 1;
      if (v === "down") votesDown += 1;
    }
    const visibility = { public: 0, private: 0 };
    for (const r of ownRecipes) {
      // Todo lo que no sea 'private' esta publicado, incluido el 'friends'
      // legacy: es exactamente el criterio de la RLS (visibility <> 'private').
      if ((r.visibility ?? "private") === "private") visibility.private += 1;
      else visibility.public += 1;
    }
    const savedMenus = Object.values(menus ?? {}).filter(menuHasContent).length;

    return {
      ownRecipes,
      favoriteCount: favoriteIds.size,
      votesUp,
      votesDown,
      visibility,
      householdCount: households.length,
      savedMenus,
      memberSince: formatMemberSince(g.createdAt),
    };
  }, [user, userRecipes, recipeVotes, households, menus, g.createdAt]);

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ background: HEADER_BAND }}>
        <div
          style={{
            padding: "20px 18px 14px",
            maxWidth: 420,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  border: "1px solid #d5e6da",
                  background: "#fff",
                  color: GREEN,
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
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "#e6f3ea",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <UsersRound size={17} color={GREEN} />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Mi perfil
            </h1>
          </div>
          {onOpenBiblioteca && user && (
            <button
              type="button"
              onClick={onOpenBiblioteca}
              aria-label="Biblioteca"
              title="Tu biblioteca"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "1.5px solid #d5e6da",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                color: GREEN,
                flexShrink: 0,
              }}
            >
              <BookOpen size={16} strokeWidth={2.3} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: `12px 16px calc(${bottomNavSpacer()} + 16px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {!user ? (
          <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 14 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.45, color: INK }}>
              Inicia sesión para ver tus estadísticas y preparar tu perfil social.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        ) : (
          <>
            <div
              style={{
                position: "relative",
                background: HERO_GRADIENT,
                borderRadius: 22,
                padding: "22px 18px 18px",
                marginBottom: 14,
                overflow: "hidden",
                boxShadow: "0 16px 32px -14px rgba(20,47,29,.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: "linear-gradient(180deg, rgba(255,255,255,.06) 0%, transparent 40%)",
                }}
              />
              <div style={{ padding: 3, borderRadius: "50%", background: "rgba(255,255,255,.28)", position: "relative" }}>
                <Avatar name={g.name} photo={g.photo} size={78} color="#1f4a30" />
              </div>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#fff",
                  letterSpacing: "-.35px",
                  textShadow: "0 1px 5px rgba(0,0,0,.35)",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.name}
              </p>
              {g.email && (
                <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.82)" }}>
                  {g.email}
                </p>
              )}
              {stats.memberSince && (
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.9)",
                    background: "rgba(255,255,255,.16)",
                    backdropFilter: "blur(4px)",
                    padding: "5px 12px",
                    borderRadius: 999,
                  }}
                >
                  En HoMenu desde {stats.memberSince}
                </p>
              )}
            </div>

            <SegmentedTabBar style={{ marginBottom: 14 }}>
              {PROFILE_TABS.map((t) => (
                <SegmentedTabButton
                  key={t.id}
                  selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  label={t.label}
                  Icon={t.Icon}
                  accent={GREEN}
                  fontSize={10.5}
                />
              ))}
            </SegmentedTabBar>

            {tab === "resumen" && <ResumenTab stats={stats} onOpenBiblioteca={onOpenBiblioteca} />}
            {tab === "amigos" && <AmigosTab />}
            {tab === "actividad" && <ActividadTab stats={stats} />}
          </>
        )}
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
