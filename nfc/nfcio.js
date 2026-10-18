// /nfc — thin, careful wrapper over Web NFC (Chrome on Android, https only).

export const hasNFC = () => typeof window !== 'undefined' && 'NDEFReader' in window;
export const isSecure = () => window.isSecureContext === true;
export const canLock = () => hasNFC() && typeof NDEFReader.prototype.makeReadOnly === 'function';
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function errText(e) {
  const n = (e && e.name) || '';
  switch (n) {
    case 'AbortError': return 'Cancelled.';
    case 'NotAllowedError': return 'NFC was blocked. Tap Allow when Chrome asks, or check the lock icon > Permissions > NFC. A locked tag also says this.';
    case 'NotSupportedError': return 'NFC isn’t available. It may be switched off in your phone’s Settings, or this phone has no NFC.';
    case 'NotReadableError': return 'Couldn’t read that tag. Hold it flat against the back of the phone and try again.';
    case 'NetworkError': return 'The tag moved away before it finished. Hold it steady against the phone and try again.';
    case 'InvalidStateError': return 'NFC is busy with something else. Close other NFC apps and try again.';
    case 'SecurityError': return 'NFC only works on secure (https) pages.';
    case 'DataError': case 'TypeError': case 'SyntaxError': return 'That data can’t be written to a tag. Check the fields and try again.';
    default: return (e && e.message) ? 'Something went wrong: ' + e.message : 'Something went wrong. Try again.';
  }
}
export const isAbort = (e) => e && e.name === 'AbortError';

// Wait for one tag. Resolves { serial, records } on first read. onSoftError(msg) for unreadable taps.
export function scanOnce({ signal, onSoftError } = {}) {
  return new Promise((resolve, reject) => {
    let reader;
    try { reader = new NDEFReader(); } catch (e) { reject(e); return; }
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
    reader.onreading = (ev) => resolve({ serial: ev.serialNumber || '', records: Array.from((ev.message && ev.message.records) || []) });
    reader.onreadingerror = () => { if (onSoftError) onSoftError('Found a tag but couldn’t read it. Try again.'); };
    reader.scan({ signal }).catch(reject);
  });
}

export async function writeRecords(records, { overwrite = true, signal } = {}) {
  const w = new NDEFReader();
  await w.write({ records }, { overwrite, signal });
}
export async function lockTag({ signal } = {}) {
  const w = new NDEFReader();
  await w.makeReadOnly({ signal });
}

// Pretty serial: 04a2b3 -> 04:A2:B3 (Chrome already gives 04:a2:b3...)
export const fmtSerial = (s) => (s ? String(s).toUpperCase() : '(hidden)');
