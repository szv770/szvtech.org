// Vercel function behind the rewrite /url/<code> -> /api/go?c=<code>: public redirect.
import { handleGo } from './_links-lib.js';
export default function handler(req, res) { return handleGo(req, res); }
