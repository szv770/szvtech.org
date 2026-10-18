// Vercel function: owner-only short links API. See api/_links-lib.js and api/_schema.sql.
//   GET    /api/links            header X-Szv-Pin           -> list
//   POST   /api/links            {pin,url,code?,expires?,note?} -> create
//   DELETE /api/links?code=abc   header X-Szv-Pin           -> delete
// Env (set privately in Vercel): DATABASE_URL, SZV_LINK_PIN (or SZV_LINK_PIN_SHA256).
import { handleLinks } from './_links-lib.js';
export default function handler(req, res) { return handleLinks(req, res); }
