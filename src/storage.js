// The trophy case is kept in localStorage so it survives a visit. localStorage can be missing (a worker, node, a
// browser with storage turned off) or throw on access (Safari private mode, a full quota), so every touch is guarded and
// the store falls back to memory. Nothing here is part of the simulation: a run is the same with or without it.

const KEY = 'touchdown.trophies.v1';

// `getStorage` returns a Storage-like object ({ getItem, setItem }) or undefined. It may throw.
export function createStore(getStorage = () => globalThis.localStorage) {
  let backing = null;
  try {
    const s = getStorage();
    if (s && typeof s.getItem === 'function' && typeof s.setItem === 'function') backing = s;
  } catch {
    backing = null;
  }

  let ever = {}; // id -> { t, n } the sim time it first unlocked in this browser and how many runs got it
  if (backing) {
    try {
      const raw = JSON.parse(backing.getItem(KEY) ?? 'null');
      if (raw && raw.v === 1 && raw.ever && typeof raw.ever === 'object' && !Array.isArray(raw.ever)) {
        for (const [id, e] of Object.entries(raw.ever)) {
          if (e && typeof e === 'object' && !Array.isArray(e)) ever[id] = { t: Number(e.t) || 0, n: Number(e.n) || 1 }; // drop junk entries
        }
      }
    } catch {
      ever = {}; // unreadable, so start over rather than refuse to run
    }
  }

  let saving = backing !== null;
  const save = () => {
    if (!backing) return false;
    try {
      backing.setItem(KEY, JSON.stringify({ v: 1, ever }));
      saving = true;
      return true;
    } catch {
      saving = false; // quota or disabled: the trophy stays in memory for this visit
      return false;
    }
  };

  return {
    // True while saves are working: the panel only says "kept on this browser" when that is so.
    get persistent() {
      return saving;
    },
    has: (id) => Object.hasOwn(ever, id),
    ids: () => Object.keys(ever),
    // Returns true when this is the first time this browser has seen the trophy.
    add(id, t) {
      if (Object.hasOwn(ever, id)) {
        ever[id].n++;
        save();
        return false;
      }
      ever[id] = { t, n: 1 };
      save();
      return true;
    },
    clear() {
      ever = {};
      save();
    },
  };
}
