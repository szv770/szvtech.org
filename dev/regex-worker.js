// Runs the regex tester off the main thread so a catastrophic pattern can be killed by a timeout.
import { run, replace } from '/dev/lib/regex.js';

self.onmessage = (e) => {
  const { id, pattern, flags, text, replacement } = e.data;
  try {
    const res = run(pattern, flags, text, { limit: 500 });
    let replaced = null;
    if (replacement != null) replaced = replace(pattern, flags, text, replacement);
    self.postMessage({ id, ok: true, res, replaced });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
