// The Listen toggle: browser speech synthesis (the Web Speech API) with a radio squelch from Web Audio. No audio
// files, no dependencies, off by default. S.E.A.N. and the pilots get different voices when the browser has two.
// The parts that decide what to say are pure so they can be tested; main.js wires the browser objects in.

import { speakerOf } from './feed.js';

const VOICE_OF = { sean: 'sean', pilot: 'pilot', monitor: null };

// What gets read aloud. The monitor's log is not on the radio, and the ATIS goes out on its own frequency.
export const spokenKinds = (kind) => VOICE_OF[speakerOf(kind)] ?? null;

const LETTERS = { ILS: 'I L S', ATIS: 'A T I S', PIREP: 'pirep', UAP: 'U A P', AARO: 'A A R O', GaaS: 'gas', NOTAM: 'notam', FAF: 'F A F', 'D.U.F.F.Y.': 'Duffy', 'S.E.A.N.': 'Sean' };

// Text the way a speech engine should get it. The feed already has numbers in words (2-4-17), so this only handles the
// bits written for the eye: the "PEACH412:" label on a pilot line, the [blocked] marker, acronyms and initials.
export function toSpeech(text) {
  let t = text.replace(/^([A-Z]{3,})(\d+): /, (_, w, d) => `${w[0]}${w.slice(1).toLowerCase()} ${d.split('').join(' ')}: `);
  t = t.replace(/\[blocked\]/g, '...');
  for (const [from, to] of Object.entries(LETTERS)) t = t.replace(new RegExp(`(?<![A-Za-z])${from.replaceAll('.', '\.')}(?![A-Za-z])`, 'g'), to);
  return t.replace(/\bPEACH(\d+)\b/g, (_, d) => `Peach ${d.split('').join(' ')}`).replace(/\s+/g, ' ').trim();
}

// Two voices that sound different. `voices` is speechSynthesis.getVoices(). Prefers English, then splits the list so
// S.E.A.N. and the pilots do not share one. With a single voice they differ in pitch and rate instead.
export function pickVoices(voices = []) {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang ?? ''));
  const pool = en.length ? en : voices;
  const sean = pool[0] ?? null;
  const pilot = pool.find((v) => v !== sean && v.name !== sean?.name) ?? null;
  return {
    sean: { voice: sean, pitch: 0.7, rate: 1.05 },
    pilot: pilot ? { voice: pilot, pitch: 1, rate: 1.15 } : { voice: sean, pitch: 1.35, rate: 1.2 },
  };
}

// A burst of squelch: noise that dies away, so the end of a transmission sounds like a radio. Deterministic.
export function squelchSamples(sampleRate, ms = 90, seed = 7) {
  const n = Math.max(1, Math.round((sampleRate * ms) / 1000));
  const out = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const noise = (s / 0xffffffff) * 2 - 1;
    out[i] = noise * 0.25 * (1 - i / n) ** 2;
  }
  return out;
}

// The listener. `deps`: { synth, makeUtterance(text), voices(), squelch(), unlock(), setTimer, clearTimer }. Any of them may be
// missing (no speech in this browser), and then it says so through `available` and does nothing.
export function createListener(deps = {}) {
  const { synth, makeUtterance, voices, squelch, unlock } = deps;
  const setTimer = deps.setTimer ?? globalThis.setTimeout?.bind(globalThis);
  const clearTimer = deps.clearTimer ?? globalThis.clearTimeout?.bind(globalThis);
  const available = !!(synth && makeUtterance);
  const state = { on: false, last: null, queue: [], speaking: false, spoken: 0, dropped: 0, available, current: null };
  const MAX_QUEUE = 3; // the sim runs faster than anyone can talk: the newest calls win
  let gen = 0; // bumped on every enable and disable, so a late callback from an old utterance is ignored
  let timer = null;

  function stop() {
    gen++;
    state.queue = [];
    state.speaking = false;
    state.current = null; // chrome drops onend on an utterance nobody holds, so `current` is held until it ends
    if (timer != null) clearTimer?.(timer);
    timer = null;
    synth?.cancel?.();
    synth?.resume?.(); // cancel does not clear a pause, and a paused synth says nothing and never ends
  }

  function next() {
    if (!state.on || state.speaking || !state.queue.length) return;
    const line = state.queue.shift();
    const who = spokenKinds(line.kind);
    const v = pickVoices(voices?.() ?? [])[who];
    const text = toSpeech(line.text);
    const u = makeUtterance(text);
    if (v?.voice) u.voice = v.voice;
    if (v) {
      u.pitch = v.pitch;
      u.rate = v.rate;
    }
    const mine = gen;
    state.speaking = true;
    state.current = u;
    const done = () => {
      if (mine !== gen || !state.speaking) return; // an old utterance, or the watchdog already moved on
      if (timer != null) clearTimer?.(timer);
      timer = null;
      state.speaking = false;
      state.current = null;
      state.spoken++;
      squelch?.();
      next();
    };
    u.onend = done;
    u.onerror = done;
    // Speech engines sometimes never report the end. About a tenth of a second a character, plus two seconds of slack.
    timer = setTimer?.(done, text.length * 100 + 2000) ?? null;
    squelch?.();
    synth.speak(u);
  }

  return {
    state,
    get on() {
      return state.on;
    },
    // Turn it on at the end of the feed: it reads what is said from now, not the backlog. Also the way to start over for
    // a new run: anything still being said from the old one is cut off. Call it from the click that ticks the box so
    // the browser lets the audio start.
    enable(feed, paused = false) {
      if (!available) return false;
      stop();
      unlock?.();
      state.on = true;
      state.last = feed.at(-1) ?? null;
      if (paused) synth.pause?.();
      return true;
    },
    disable() {
      state.on = false;
      stop();
    },
    // Called every frame with the feed (oldest first). Queues the new lines that are on the radio.
    update(feed) {
      if (!state.on) return;
      const at = state.last ? feed.lastIndexOf(state.last) : -1;
      // Enabled on an empty feed: everything is new. Anchor scrolled off the front: only the newest can matter.
      const fresh = !state.last ? feed.slice() : at >= 0 ? feed.slice(at + 1) : feed.slice(-MAX_QUEUE);
      if (feed.length) state.last = feed.at(-1);
      for (const line of fresh) {
        if (!spokenKinds(line.kind) || line.kind === 'atis') continue;
        state.queue.push(line);
      }
      while (state.queue.length > MAX_QUEUE) {
        state.queue.shift();
        state.dropped++;
      }
      next();
    },
    // Pausing the sim pauses the radio.
    hold(paused) {
      if (!state.on) return;
      if (paused) synth?.pause?.();
      else synth?.resume?.();
    },
  };
}

// The browser side: builds the real speech and audio objects. Not run in tests (node has neither).
export function browserDeps(win = globalThis) {
  const synth = win.speechSynthesis;
  const Utter = win.SpeechSynthesisUtterance;
  if (!synth || !Utter) return {};
  let ac = null;
  const context = () => {
    const Ctx = win.AudioContext ?? win.webkitAudioContext;
    if (!Ctx) return null;
    try {
      ac ??= new Ctx();
      return ac;
    } catch {
      return null;
    }
  };
  return {
    // Made in the click that ticks Listen: safari and ios only start audio from a gesture.
    unlock() {
      context()?.resume?.();
    },
    synth,
    makeUtterance: (text) => new Utter(text),
    voices: () => synth.getVoices(),
    squelch() {
      try {
        if (!context()) return;
        const data = squelchSamples(ac.sampleRate);
        const buf = ac.createBuffer(1, data.length, ac.sampleRate);
        buf.copyToChannel(data, 0);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.start();
      } catch {
        // no audio: the speech still works
      }
    },
  };
}
