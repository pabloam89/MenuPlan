// @vitest-environment jsdom
//
// Guards the two ways a coach tour silently rots:
//
// 1. A step points at a selector nobody renders any more (the deck rewrite left
//    `menu-filters` on a classic-mode-only chevron, and `shop-add` never had an
//    anchor at all). Those steps just vanish, so nothing fails loudly.
// 2. The tour mounts before its lazy-loaded screen paints, the step list is
//    filtered once against an empty DOM, and a 7-step tour collapses to the one
//    step whose target lives in the always-mounted BottomNav.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  HOME_COACH_STEPS,
  RECIPES_COACH_STEPS,
  MENU_COACH_STEPS,
  SHOPPING_COACH_STEPS,
  PANTRY_COACH_STEPS,
  MenuCoachTour,
} from "./HomeCoachTour.jsx";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [full] : [];
  });
}

// Anchors are written three ways: straight on an element, as a `coach:` field on
// a config object that a map() spreads onto one, and as a plain DOM id.
const anchors = (() => {
  const found = new Set();
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, "utf8");
    for (const [, v] of code.matchAll(/data-coach="([^"]+)"/g)) found.add(`[data-coach="${v}"]`);
    for (const [, v] of code.matchAll(/\bcoach:\s*"([^"]+)"/g)) found.add(`[data-coach="${v}"]`);
    for (const [, v] of code.matchAll(/\bid="(coach-[^"]+)"/g)) found.add(`#${v}`);
  }
  return found;
})();

describe("every coach step points at an anchor that exists in the source", () => {
  const tours = {
    HOME: HOME_COACH_STEPS,
    RECIPES: RECIPES_COACH_STEPS,
    MENU: MENU_COACH_STEPS,
    SHOPPING: SHOPPING_COACH_STEPS,
    PANTRY: PANTRY_COACH_STEPS,
  };

  for (const [name, steps] of Object.entries(tours)) {
    it(`${name}`, () => {
      const orphans = steps.filter((s) => !anchors.has(s.selector)).map((s) => s.selector);
      expect(orphans).toEqual([]);
    });
  }
});

describe("MenuCoachTour waits for its screen instead of filtering against an empty DOM", () => {
  let container = null;
  let root = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  const addAnchor = (selector) => {
    const el = document.createElement("div");
    el.setAttribute("data-coach", selector.replace(/^\[data-coach="|"\]$/g, ""));
    // jsdom gives every element a zero-sized rect; the tour treats that as
    // "not laid out yet", so fake a real one.
    el.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 50, width: 80, height: 40 });
    document.body.appendChild(el);
  };

  it("shows the first step of the real list, not whichever target happened to be mounted", () => {
    vi.useFakeTimers();
    // Only the portaled BottomNav exists at mount — the state the old one-shot
    // filter saw, which made "Compra" the entire tour.
    addAnchor('[data-coach="nav-shopping"]');

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MenuCoachTour onClose={() => {}} />));

    expect(document.body.textContent).not.toContain(MENU_COACH_STEPS[0].title);

    for (const step of MENU_COACH_STEPS) {
      if (step.selector !== '[data-coach="nav-shopping"]') addAnchor(step.selector);
    }
    // First tick resolves the list and mounts the tour; the second lets the
    // freshly mounted tour measure its target and draw the bubble.
    act(() => vi.advanceTimersByTime(200));
    act(() => vi.advanceTimersByTime(200));

    expect(document.body.textContent).toContain(MENU_COACH_STEPS[0].title);
  });

  it("gives up after the grace period and runs with whatever did render", () => {
    vi.useFakeTimers();
    addAnchor('[data-coach="nav-shopping"]');

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MenuCoachTour onClose={() => {}} />));

    act(() => vi.advanceTimersByTime(2000));
    act(() => vi.advanceTimersByTime(200));

    expect(document.body.textContent).toContain("Compra");
  });
});
