import { useMemo, useState } from "react";
import { Calendar, Check, Clock3, Target, Utensils } from "lucide-react";
import {
  BottomNav,
  SegmentedControl,
  bottomNavSpacer,
} from "../components/ui.jsx";
import { groupsFromModel } from "../lib/groups.js";
import { getMenuInsights } from "../lib/menuInsights.js";
import { formatWeekRangeLabel, getWeekDates } from "../lib/weekCalendar.js";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };

export function AnalyticsScreen({ data, menuPlan, onNav }) {
  const [tab, setTab] = useState("resumen");
  const weekLabel = formatWeekRangeLabel(getWeekDates());
  const groups = data.groups?.length ? data.groups : groupsFromModel(data.members, data.menuModel);

  const insights = useMemo(
    () => getMenuInsights(menuPlan, groups, data),
    [menuPlan, groups, data]
  );

  const hasMenu = insights.mealsAtHome > 0;

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100vh" }}>
      <div style={{ padding: "20px 16px 0" }}>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: "#142f1d",
            margin: "0 0 4px",
            letterSpacing: "-.7px",
          }}
        >
          Tu semana
        </h2>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8a7f", marginBottom: 16 }}>
          {weekLabel}
        </div>

        {hasMenu && (
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { id: "resumen", label: "Resumen" },
              { id: "cocina", label: "Cocina" },
              { id: "objetivos", label: "Objetivos" },
            ]}
            style={{ marginBottom: 16 }}
          />
        )}
      </div>

      <div
        style={{
          padding: "0 16px",
          paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
        }}
      >
        {!hasMenu ? (
          <EmptyAnalytics onNav={onNav} />
        ) : (
          <>
            {tab === "resumen" && <ResumenTab insights={insights} />}
            {tab === "cocina" && <CocinaTab insights={insights} />}
            {tab === "objetivos" && <ObjetivosTab insights={insights} />}
          </>
        )}
      </div>

      <BottomNav active="analytics" onNav={onNav} />
    </div>
  );
}

function EmptyAnalytics({ onNav }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#7a8a7f", margin: "0 0 16px" }}>
        Sin menú
      </p>
      <button type="button" onClick={() => onNav("menu")} style={primaryBtnStyle}>
        Ir al menú
      </button>
    </div>
  );
}

function ResumenTab({ insights }) {
  const stats = [
    { icon: Utensils, value: insights.mealsAtHome, label: "comidas" },
    { icon: Clock3, value: insights.cookTimeLabel, label: "cocina" },
    {
      icon: Target,
      value: `${insights.freqMet}/${insights.freqTotal}`,
      label: "objetivos",
    },
  ];

  return (
    <div>
      {stats.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 4px",
            borderBottom: "1px solid #e8f0ea",
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#e8f0ea",
              color: "#2d5a3d",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={18} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#142f1d", lineHeight: 1 }}>
              {value}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#8d978f",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CocinaTab({ insights }) {
  const max = insights.maxCookMinutes || 1;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 6,
          height: 140,
          padding: "8px 0 16px",
          borderBottom: "1px solid #e8f0ea",
        }}
      >
        {insights.cookByDay.map(({ day, minutes }) => {
          const weekend = day === "Sáb" || day === "Dom";
          const h = minutes > 0 ? Math.max(12, (minutes / max) * 100) : 4;
          return (
            <div
              key={day}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 32,
                  height: `${h}%`,
                  minHeight: 4,
                  borderRadius: 6,
                  background: weekend ? "#4cba6e" : "#2d5a3d",
                  opacity: minutes > 0 ? 1 : 0.2,
                  transition: "height .3s ease",
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8a7f" }}>
                {DAY_LETTERS[day]}
              </span>
            </div>
          );
        })}
      </div>

      {insights.weekdayAvg > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 4px",
            fontSize: 14,
            fontWeight: 700,
            color: "#142f1d",
          }}
        >
          <Calendar size={16} color="#2d5a3d" />
          {insights.weekdayAvg} min media laborables
        </div>
      )}
    </div>
  );
}

function ObjetivosTab({ insights }) {
  if (insights.freqRows.length === 0) {
    return (
      <p style={{ padding: "24px 4px", fontSize: 14, fontWeight: 600, color: "#7a8a7f" }}>
        Sin objetivos definidos
      </p>
    );
  }

  return (
    <div>
      {insights.freqRows.map((row) => {
        const pct = row.target > 0 ? Math.min(100, (row.count / row.target) * 100) : 0;
        return (
          <div
            key={row.key}
            style={{
              padding: "14px 4px",
              borderBottom: "1px solid #e8f0ea",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, color: "#142f1d" }}>{row.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#2d5a3d" }}>
                  {row.count}/{row.target}
                </span>
                {row.met && <Check size={16} color="#2d5a3d" strokeWidth={3} />}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "#e0eae3",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: row.met ? "#2d5a3d" : "#4cba6e",
                  borderRadius: 999,
                  transition: "width .25s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const primaryBtnStyle = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
