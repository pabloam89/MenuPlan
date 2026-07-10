import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { getWeekDatesFromStartISO, calendarDayNumber } from "../lib/weekCalendar.js";
import { getMeals, isLunchMeal } from "../lib/planner.js";
import { membersOfGroup } from "../lib/groups.js";
import { eatersForSlot } from "../lib/slotEaters.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { orderedWeeks, formatISODateShort } from "../lib/menuArchive.js";
import { bottomNavSpacer } from "../components/ui.jsx";
import { DishCard, dishesFromSlot, DishDetail } from "./Menu.jsx";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };

/** Read-only viewer for a history entry: no editing, no swap, no shopping list. */
export function MenuHistoryView({ menu, data, onBack }) {
  const [activeDish, setActiveDish] = useState(null);
  const weeks = orderedWeeks(menu);
  const members = data.members ?? [];
  const groups = data.groups ?? [];
  const multiGroup = groups.length > 1;
  const meals = getMeals(data);

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh", paddingBottom: bottomNavSpacer() }}>
      <div
        style={{
          position: "sticky", top: 0, zIndex: 5, background: "#f7f9f7",
          padding: "16px 16px 8px", display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          style={{
            border: "none", background: "#fff", borderRadius: 999, width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            boxShadow: "0 2px 8px rgba(20,40,25,.08)", flexShrink: 0,
          }}
        >
          <ChevronLeft size={19} color="#2d5a3d" />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#142f1d" }}>Menú del histórico</div>
          <div style={{ fontSize: 12, color: "#7a8a7f", fontWeight: 700 }}>Solo lectura</div>
        </div>
      </div>

      <div style={{ padding: "8px 16px 24px" }}>
        {weeks.map((week) => {
          const { dates, activeDays } = getWeekDatesFromStartISO(week.startISO, week.startDayIdx ?? 0);
          return (
            <div key={week.weekStart} style={{ marginBottom: 22 }}>
              {weeks.length > 1 && (
                <div
                  style={{
                    fontSize: 11.5, fontWeight: 800, color: "#5c9d74", textTransform: "uppercase",
                    letterSpacing: .8, margin: "10px 0",
                  }}
                >
                  Semana del {formatISODateShort(week.startISO)} al {formatISODateShort(week.endISO)}
                </div>
              )}
              {activeDays.map((day) => {
                const dayHasContent = meals.some((meal) =>
                  groups.some((g) => week.plan?.[g.id]?.[`${day}-${meal}`]),
                );
                if (!dayHasContent) return null;
                return (
                  <div key={day} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 8px" }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "#9ab0a1", textTransform: "uppercase" }}>
                        {DAY_LETTERS[day]}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "#142f1d" }}>
                        {calendarDayNumber(day, dates)}
                      </span>
                    </div>
                    {meals.map((meal) => {
                      const isLunch = isLunchMeal(meal);
                      // Drop dishes whose recipe no longer exists in the catalog before
                      // computing idx/showDivider below — DishCard silently renders null
                      // for those, and counting them would leave a dangling divider under
                      // the last dish that's actually visible.
                      const cards = groups.flatMap((g) => {
                        const slot = week.plan?.[g.id]?.[`${day}-${meal}`] ?? null;
                        if (!slot) return [];
                        return dishesFromSlot(slot, isLunch)
                          .filter((dish) => RECIPES_BY_ID[dish.recipeId])
                          .map((dish) => ({ group: g, slot, dish }));
                      });
                      if (cards.length === 0) return null;
                      return (
                        <div key={meal} style={{ marginBottom: 4 }}>
                          {cards.map((card, idx) => {
                            const groupMembers = membersOfGroup(card.group, members);
                            const slotEaters = eatersForSlot(card.group, members, week.schedule ?? {}, day, meal);
                            const showEaters =
                              groupMembers.length > 1 &&
                              slotEaters.length > 0 &&
                              slotEaters.length < groupMembers.length;
                            return (
                              <DishCard
                                key={`dish-${card.group.id}-${card.dish.courseKey}-${idx}`}
                                slot={{ ...card.slot, recipeId: card.dish.recipeId }}
                                courseLabel={card.dish.course}
                                showDivider={idx < cards.length - 1}
                                eaterMembers={showEaters ? slotEaters : null}
                                allMembers={members}
                                groups={groups}
                                group={card.group}
                                showGroupBadge={multiGroup}
                                kitchenTools={data.kitchenTools ?? []}
                                onTap={() =>
                                  setActiveDish({
                                    recipe: RECIPES_BY_ID[card.dish.recipeId],
                                    slot: card.slot,
                                    group: card.group,
                                  })
                                }
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {activeDish?.recipe && (
        <DishDetail
          recipe={activeDish.recipe}
          slot={activeDish.slot}
          kitchenTools={data.kitchenTools ?? []}
          group={activeDish.group}
          allMembers={members}
          onClose={() => setActiveDish(null)}
        />
      )}
    </div>
  );
}
