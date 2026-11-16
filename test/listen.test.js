// Listen: what gets spoken and in which voice. Node has no speech or audio, so the browser objects are fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserDeps, createListener, pickVoices, spokenKinds, squelchSamples, toSpeech } from '../src/listen.js';

function fakes(voices = []) {
  const said = [];
  const timers = [];
  let squelches = 0;
  const calls = [];
  const synth = {
    speak: (u) => said.push(u),
    cancel: () => said.splice(0),
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
  };
  return {
    said,
    calls,
    get squelches() {
      return squelches;
    },
    timers,
    deps: {
      synth,
      makeUtterance: (text) => ({ text }),
      voices: () => voices,
      squelch: () => squelches++,
      setTimer: (fn, ms) => timers.push({ fn, ms }) - 1,
      clearTimer: (i) => { timers[i] = null; },
    },
  };
}
const line = (kind, text, t = 1) => ({ t, kind, text });

test('it is off by default, and does nothing without speech support', () => {
  const f = fakes();
  const l = createListener(f.deps);
  assert.equal(l.on, false);
  l.update([line('tx', 'Peach four one two, descend and maintain one one thousand.')]);
  assert.equal(f.said.length, 0);
  // Node has neither speechSynthesis nor SpeechSynthesisUtterance.
  const none = createListener(browserDeps({}));
  assert.equal(none.state.available, false);
  assert.equal(none.enable([]), false);
  assert.equal(none.on, false);
  none.update([line('tx', 'x')]);
  none.disable();
  assert.equal(createListener().state.available, false);
});

test('S.E.A.N. and the pilots are different voices, and the monitor is not on the radio', () => {
  const voices = [
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Amelie', lang: 'fr-FR' },
    { name: 'Samantha', lang: 'en-US' },
  ];
  const v = pickVoices(voices);
  assert.equal(v.sean.voice.name, 'Daniel');
  assert.equal(v.pilot.voice.name, 'Samantha');
  assert.notEqual(v.sean.voice, v.pilot.voice);
  // One voice only: same voice, different pitch and rate.
  const one = pickVoices([{ name: 'Only', lang: 'en-US' }]);
  assert.equal(one.sean.voice, one.pilot.voice);
  assert.notEqual(one.sean.pitch, one.pilot.pitch);
  assert.notEqual(one.sean.rate, one.pilot.rate);
  // No voices at all is fine.
  assert.equal(pickVoices([]).sean.voice, null);
  assert.equal(spokenKinds('tx'), 'sean');
  assert.equal(spokenKinds('brief'), 'sean');
  assert.equal(spokenKinds('readback'), 'pilot');
  assert.equal(spokenKinds('pirep'), 'pilot');
  assert.equal(spokenKinds('monitor'), null);
});

test('it reads new lines from the moment it is turned on, in the right voice, with a squelch around each', () => {
  const voices = [{ name: 'Daniel', lang: 'en-GB' }, { name: 'Samantha', lang: 'en-US' }];
  const f = fakes(voices);
  const l = createListener(f.deps);
  const feed = [line('tx', 'The backlog. Not read.')];
  assert.equal(l.enable(feed), true);
  l.update(feed);
  assert.equal(f.said.length, 0, 'the backlog is not read');
  feed.push(line('tx', 'Peach four one two, descend and maintain one one thousand.'));
  l.update(feed);
  assert.equal(f.said.length, 1);
  assert.equal(f.said[0].voice.name, 'Daniel');
  assert.ok(f.squelches >= 1, 'squelch on key-up');
  f.said[0].onend();
  feed.push(line('readback', 'PEACH412: Descending one one thousand.'));
  l.update(feed);
  assert.equal(f.said[1].voice.name, 'Samantha');
  assert.match(f.said[1].text, /^Peach 4 1 2: Descending/);
  assert.equal(l.state.spoken, 1);
  // The squelch fires at the end of the call too.
  const before = f.squelches;
  f.said[1].onend();
  assert.ok(f.squelches > before);
});

test('it keeps up by dropping old calls, skips the monitor and the ATIS, and stops when turned off', () => {
  const f = fakes();
  const l = createListener(f.deps);
  const feed = [];
  l.enable(feed);
  feed.push(line('atis', 'Atlanta information Alpha. A very long recording.'));
  feed.push(line('monitor', 'ignored'));
  for (let i = 0; i < 10; i++) feed.push(line('tx', `call ${i}`));
  l.update(feed);
  assert.equal(f.said.length, 1, 'one is speaking');
  assert.equal(f.said[0].text, 'call 7', 'and the oldest were dropped in favour of the newest three');
  assert.ok(l.state.dropped >= 7);
  l.disable();
  assert.equal(l.on, false);
  assert.equal(f.said.length, 0, 'cancelled');
  feed.push(line('tx', 'after'));
  l.update(feed);
  assert.equal(f.said.length, 0);
});

test('it follows the feed even when old lines have scrolled off the front', () => {
  const f = fakes();
  const l = createListener(f.deps);
  const feed = [line('tx', 'a'), line('tx', 'b')];
  l.enable(feed);
  feed.shift();
  feed.push(line('tx', 'c'));
  l.update(feed);
  assert.deepEqual(f.said.map((u) => u.text), ['c']);
});

test('text for speech: call sign labels, blocked marks, acronyms and initials', () => {
  assert.equal(toSpeech('PEACH412: Say again, descend to one one thousand?'), 'Peach 4 1 2: Say again, descend to one one thousand?');
  assert.equal(toSpeech('Peach four [blocked] one one thousand.'), 'Peach four ... one one thousand.');
  assert.equal(toSpeech('S.E.A.N. approach, cleared ILS runway two seven approach.'), 'Sean approach, cleared I L S runway two seven approach.');
  assert.equal(toSpeech('GaaS: go-around #3.'), 'gas: go-around #3.');
});

test('the squelch is a short burst of noise that dies away, and the same every time', () => {
  const a = squelchSamples(48000);
  assert.equal(a.length, Math.round(48000 * 0.09));
  assert.deepEqual(squelchSamples(48000), a);
  const mag = (from, to) => a.slice(from, to).reduce((s, x) => s + Math.abs(x), 0) / (to - from);
  assert.ok(mag(0, 500) > 5 * mag(a.length - 500, a.length), 'it fades');
  assert.ok(a.every((x) => Math.abs(x) <= 0.25));
  assert.ok(a.some((x) => x !== 0));
});

test('an old utterance that ends after Listen is switched off and on again cannot talk over the new one', () => {
  const f = fakes();
  const l = createListener(f.deps);
  const feed = [];
  l.enable(feed);
  feed.push(line('tx', 'old one'), line('tx', 'old two'));
  l.update(feed);
  const stale = f.said[0];
  l.disable();
  l.enable(feed);
  feed.push(line('tx', 'new one'), line('tx', 'new two'));
  l.update(feed);
  assert.deepEqual(f.said.map((u) => u.text), ['new one']);
  stale.onerror(); // chrome reports the cancelled utterance late
  assert.equal(f.said.length, 1, 'new two waits for new one to end');
  assert.equal(l.state.spoken, 0);
});

test('enable starts over for a new run, and a cancelled synth is not left paused', () => {
  const f = fakes();
  const l = createListener(f.deps);
  const feed = [];
  l.enable(feed);
  feed.push(line('tx', 'one'), line('tx', 'two'));
  l.update(feed);
  f.calls.length = 0;
  l.enable([]); // reset: the old run's speech is cut off and its queue dropped
  assert.equal(f.said.length, 0);
  assert.equal(l.state.queue.length, 0);
  assert.ok(f.calls.includes('resume'), 'cancel does not clear a pause, so resume follows it');
  l.enable([], true);
  assert.ok(f.calls.at(-1) === 'pause', 'ticked while the sim is paused: the radio starts paused');
  l.hold(false);
  assert.equal(f.calls.at(-1), 'resume');
});

test('an error moves on to the next call, and a stuck engine is moved on by the watchdog', () => {
  const f = fakes();
  const l = createListener(f.deps);
  const feed = [];
  l.enable(feed);
  feed.push(line('tx', 'first call here'), line('tx', 'second'));
  l.update(feed);
  f.said[0].onerror();
  assert.equal(f.said.length, 2, 'error advances');
  // The second never reports its end: the timer is the way out.
  const t = f.timers.filter(Boolean).at(-1);
  assert.equal(t.ms, 'second'.length * 100 + 2000);
  t.fn();
  assert.equal(l.state.speaking, false);
  assert.equal(l.state.spoken, 2);
});

test('acronyms only change as whole words', () => {
  assert.equal(toSpeech('Cleared ILS runway two six right.'), 'Cleared I L S runway two six right.');
  assert.equal(toSpeech('RAILS and the PIREPS'), 'RAILS and the PIREPS');
});
