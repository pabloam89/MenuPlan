// @vitest-environment jsdom
// resolvePlannerModel reads window.location.search + localStorage, neither of
// which exist under vitest's default "node" environment.
import { describe, it, expect, afterEach } from "vitest";
import { resolvePlannerModel, PLANNER_MODEL, FAST_MODEL } from "./aiModels.js";

function setSearch(query) {
  window.history.replaceState({}, "", query ? `/?${query}` : "/");
}

describe("resolvePlannerModel", () => {
  afterEach(() => {
    setSearch("");
    localStorage.clear();
  });

  it("defaults to the planner model with no override present", () => {
    expect(resolvePlannerModel()).toEqual({ model: PLANNER_MODEL, variant: "sonnet", source: "default" });
  });

  it("resolves the ?planner=haiku alias from the URL", () => {
    setSearch("planner=haiku");
    expect(resolvePlannerModel()).toEqual({ model: FAST_MODEL, variant: "haiku", source: "url" });
  });

  it("ignores an unrecognized ?planner= value instead of forwarding it to the API", () => {
    setSearch("planner=gpt-4-turbo");
    // Falls through every source to the product default, rather than
    // returning a bogus model id that would make Anthropic reply 400.
    expect(resolvePlannerModel()).toEqual({ model: PLANNER_MODEL, variant: "sonnet", source: "default" });
  });

  it("ignores a bad localStorage override AND clears it so the browser self-heals", () => {
    localStorage.setItem("mp_planner_model", "not-a-real-model");
    expect(resolvePlannerModel()).toEqual({ model: PLANNER_MODEL, variant: "sonnet", source: "default" });
    expect(localStorage.getItem("mp_planner_model")).toBeNull();
  });

  it("accepts a valid localStorage override and leaves it in place", () => {
    localStorage.setItem("mp_planner_model", "haiku");
    expect(resolvePlannerModel()).toEqual({ model: FAST_MODEL, variant: "haiku", source: "storage" });
    expect(localStorage.getItem("mp_planner_model")).toBe("haiku");
  });

  it("URL override takes precedence over a valid localStorage override", () => {
    localStorage.setItem("mp_planner_model", "haiku");
    setSearch("planner=sonnet");
    expect(resolvePlannerModel()).toEqual({ model: PLANNER_MODEL, variant: "sonnet", source: "url" });
  });
});
