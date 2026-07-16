const KEY = "menuplan.state.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Returns whether the write actually succeeded, so callers can warn the user
// instead of losing state (profile, restrictions, active menu) with zero
// signal — private-mode Safari and a full quota both throw here, and this
// used to be swallowed unconditionally.
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
