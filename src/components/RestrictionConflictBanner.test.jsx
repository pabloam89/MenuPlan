// @vitest-environment jsdom
//
// Render/interaction test for the banner that surfaces stale-menu restriction
// conflicts (see utils/menuConflicts.js for the pure detection logic, already
// covered exhaustively there). This file only exercises the presentational
// piece: does it show the message, does "Generar menú nuevo" call the
// callback, does "Ahora no" dismiss it without calling the callback.
//
// Scoped to jsdom via the docblock above rather than a global vitest config
// change, and hand-rolled with react-dom/client (no @testing-library/*) to
// keep the new jsdom devDependency the only addition to this project's
// otherwise pure-logic test suite.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RestrictionConflictBanner } from "./RestrictionConflictBanner.jsx";

let container = null;
let root = null;

function mount(ui) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return container;
}

function clickButtonWithText(text) {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent.includes(text),
  );
  if (!button) throw new Error(`No button found with text "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => root.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe("RestrictionConflictBanner", () => {
  it("renders the heading and the given message", () => {
    mount(
      <RestrictionConflictBanner
        message="1 plato del menú actual podría no respetar: Gluten."
        onRegenerate={() => {}}
      />,
    );
    expect(container.textContent).toContain("Restricciones cambiadas desde que se generó este menú");
    expect(container.textContent).toContain("1 plato del menú actual podría no respetar: Gluten.");
  });

  it('calls onRegenerate exactly once when "Generar menú nuevo" is clicked', () => {
    const onRegenerate = vi.fn();
    mount(<RestrictionConflictBanner message="algo cambió" onRegenerate={onRegenerate} />);

    clickButtonWithText("Generar menú nuevo");

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('hides itself when "Ahora no" is clicked, without ever calling onRegenerate', () => {
    const onRegenerate = vi.fn();
    mount(<RestrictionConflictBanner message="algo cambió" onRegenerate={onRegenerate} />);

    clickButtonWithText("Ahora no");

    expect(container.textContent).not.toContain("Restricciones cambiadas");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('omits the "Generar menú nuevo" button when onRegenerate is not provided', () => {
    mount(<RestrictionConflictBanner message="algo cambió" />);

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Generar menú nuevo"),
    );
    expect(button).toBeUndefined();
    // "Ahora no" must still be there so the user can dismiss it either way.
    expect(container.textContent).toContain("Ahora no");
  });
});
