// Vercel function: shareable, editable notes (anyone with the link can view AND edit). See api/_notes-lib.js.
//   GET  /api/notes?id=ID[&head=1|&versions=1|&v=N]
//   POST /api/notes  {op:'create'|'save'|'settings'|'delete', ...}
// Env (set privately in Vercel): DATABASE_URL (same Neon database as short links; no PIN needed).
import { handleNotes } from './_notes-lib.js';
export default function handler(req, res) { return handleNotes(req, res); }
