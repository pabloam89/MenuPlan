// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { GhostPillButton } from "./ui.jsx";
import { color } from "../design/tokens.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("GhostPillButton", () => {
  it("el tono telegram lleva el azul de Telegram, relleno y sin borde", () => {
    const container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
    act(() => root.render(<GhostPillButton onClick={() => {}} tone="telegram">Habla con Lola en Telegram</GhostPillButton>));
    const boton = container.querySelector("button");
    const probe = document.createElement("div");
    probe.style.background = color.telegram;
    expect(boton.style.background).toBe(probe.style.background);
    expect(boton.style.borderStyle).toBe("none");
  });
});
