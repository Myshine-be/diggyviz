// localStorage wrapper that never throws (private mode, blocked storage, previews).
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem("rv." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("rv." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("rv." + k); } catch {} },
};
