// Central registry of Claude model ids used by the client.
// Single source of truth — never hardcode model ids elsewhere in src/.
// (api/recipe-steps.js runs server-side and keeps its own constant.)

// Menu generation (main planner call).
export const PLANNER_MODEL = "claude-sonnet-4-6";

// Cheap/fast model: format retries, recipe steps, receipt vision.
export const FAST_MODEL = "claude-haiku-4-5-20251001";

// School menu import (PDF/image → structured JSON).
export const PARSER_MODEL = "claude-sonnet-4-6";
