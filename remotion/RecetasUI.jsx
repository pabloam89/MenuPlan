// La pantalla de Recetas, repintada para vídeo.
//
// No importa RecipesScreen.jsx: aquella pide user, hogar, Supabase y un
// CatalogBrowserSheet entero con su estado. Aquí solo hace falta la piel, con
// cada medida, color y peso copiados de src/screens/RecipesScreen.jsx y del
// grid de categorías de CatalogBrowserSheet.jsx.
import { Img, staticFile } from "remotion";
import {
  BookOpen,
  ClipboardList,
  Home,
  Plus,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from "../src/components/icons.jsx";
import { SANS } from "./fonts.js";

export const SCREEN_W = 420;
export const SCREEN_H = 800;
export const HEADER_H = 70;
export const NAV_H = 62;

const GRID_PAD = 18;
const GRID_GAP = 10;
const GRID_TOP = 2;
export const TILE = (SCREEN_W - GRID_PAD * 2 - GRID_GAP * 2) / 3;
const ROW_H = TILE + 6 + 15 + GRID_GAP;

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const HEADER_BAND = "#e9f4ed";

/** Dónde cae una tesela dentro de la pantalla, para poder abrirla desde ahí. */
export function tileRect(index, scrollY) {
  return {
    x: GRID_PAD + (index % 3) * (TILE + GRID_GAP),
    y: HEADER_H + GRID_TOP + Math.floor(index / 3) * ROW_H + scrollY,
    w: TILE,
    h: TILE,
  };
}

const NAV_ITEMS = [
  { id: "dashboard", Icon: Home, label: "Inicio", color: "#e8854a" },
  { id: "recipes", Icon: BookOpen, label: "Recetas", color: "#d45c7a" },
  { id: "menu", Icon: ClipboardList, label: "Menú", highlight: true },
  { id: "shopping", Icon: ShoppingCart, label: "Compra", color: "#5a82d4" },
  { id: "feed", Icon: Users, label: "Gente", color: "#4a6fd4" },
];

function Header({ enter }) {
  return (
    <div
      style={{
        background: HEADER_BAND,
        opacity: enter,
        transform: `translateY(${(1 - enter) * -26}px)`,
      }}
    >
      <div
        style={{
          padding: "20px 18px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              background: "#f2e7fb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BookOpen size={17} color="#9647c9" />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
            Recetas
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "1.5px solid #d5e6da",
              background: "#fff",
              color: GREEN,
            }}
          >
            <SlidersHorizontal size={16} strokeWidth={2.3} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              borderRadius: 12,
              background: GREEN,
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <Plus size={14} strokeWidth={2.8} /> Crear
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ tile, enter, press }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px) scale(${(0.94 + enter * 0.06) * press})`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 14,
          overflow: "hidden",
          background: "#f4f7f5",
        }}
      >
        <Img
          src={staticFile(tile.img)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 22,
            height: 22,
            padding: "0 5px",
            borderRadius: "50%",
            background: "rgba(255,255,255,.92)",
            color: INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10.5,
            fontWeight: 800,
            boxShadow: "0 1px 4px rgba(20,47,29,.16)",
          }}
        >
          {tile.count}
        </span>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1.2,
          color: INK,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {tile.label}
      </span>
    </div>
  );
}

function BottomNav({ enter }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 34}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 4,
          padding: "8px 6px 10px",
          borderRadius: "18px 18px 0 0",
          borderTop: "1px solid #e0eae3",
          background: "#fff",
          boxShadow: "0 -6px 24px rgba(20,47,29,.08)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const sel = item.id === "recipes";
          return (
            <div
              key={item.id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "4px 0",
                borderRadius: 12,
                background: sel ? "#f0f7f2" : "transparent",
                boxShadow: sel ? "inset 0 0 0 1px #d4e6da" : "none",
              }}
            >
              {item.highlight ? (
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: GREEN,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 10px rgba(45,90,61,.35)",
                    marginTop: -2,
                  }}
                >
                  <item.Icon size={19} color="#fff" strokeWidth={2.4} />
                </span>
              ) : (
                <item.Icon
                  size={22}
                  color={sel ? item.color : "#c2d4cb"}
                  strokeWidth={sel ? 2.4 : 1.8}
                />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: sel || item.highlight ? 800 : 600,
                  color: item.highlight ? "#1a3a24" : sel ? item.color : "#9ab0a1",
                  letterSpacing: ".2px",
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RecetasScreen({ tiles, scrollY, headerEnter, navEnter, tileEnter, pressedIndex, press }) {
  return (
    <div
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        background: "#fff",
        position: "relative",
        overflow: "hidden",
        fontFamily: SANS,
      }}
    >
      <Header enter={headerEnter} />

      <div style={{ position: "absolute", top: HEADER_H, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: GRID_GAP,
            padding: `${GRID_TOP}px ${GRID_PAD}px 4px`,
            transform: `translateY(${scrollY}px)`,
          }}
        >
          {tiles.map((tile, i) => (
            <Tile
              key={tile.id}
              tile={tile}
              enter={tileEnter(i)}
              press={i === pressedIndex ? press : 1}
            />
          ))}
        </div>
      </div>

      <BottomNav enter={navEnter} />
    </div>
  );
}
