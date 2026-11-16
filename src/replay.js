// Real arrivals as demand. data/replay-2026-07.json holds, for two busy pushes, when each KATL and KCLT arrival reached its
// corner post, which STAR transition fix it came in on and which fleet type it was (scripts/replay.js, docs/data.md).
// Nothing identifies a real flight, and the sim flies them with fictional callsigns. They are demand only: the tracks are
// S.E.A.N.'s, so the monitor never grades a real controller's work.
import data from '../data/replay-2026-07.json' with { type: 'json' };

export const REPLAYS = data.scenarios.map((s) => ({ id: s.id, name: s.name, date: s.date, windowLocal: s.windowLocal, hubs: s.hubs }));
export const replayById = (id) => REPLAYS.find((r) => r.id === id);
export const REPLAY_SOURCE = data.source;

// The entries one hub replays, in the shape setReplay takes.
export const entriesFor = (replay, airport) => replay.hubs[airport] ?? [];
