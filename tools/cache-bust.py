#!/usr/bin/env python3
"""Stamp local CSS/JS references in every HTML page with a content hash.

Run before committing: python3 tools/cache-bust.py
Browsers and CDNs (e.g. a Cloudflare proxy with a long browser-cache TTL)
then always fetch a changed file, because its URL changes with its content.
Relative references are rewritten to absolute paths so pages served under
rewritten URLs (vercel.json: /admin -> /sys/) still find their assets.
"""
import hashlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = re.compile(r'(?P<attr>src|href)="(?P<path>(?!https?:|//|data:|#)[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"')

def stamp(html_file):
    text = html_file.read_text(encoding='utf-8')
    def repl(m):
        path = m['path']
        target = (ROOT / path.lstrip('/')) if path.startswith('/') else (html_file.parent / path)
        target = target.resolve()
        if not target.is_file():
            return m[0]
        abs_path = '/' + target.relative_to(ROOT).as_posix()
        digest = hashlib.sha1(target.read_bytes()).hexdigest()[:10]
        return f'{m["attr"]}="{abs_path}?v={digest}"'
    new = REF.sub(repl, text)
    if new != text:
        html_file.write_text(new, encoding='utf-8')
        print('stamped', html_file.relative_to(ROOT))

for f in sorted(ROOT.rglob('*.html')):
    if 'node_modules' not in f.parts and '.git' not in f.parts:
        stamp(f)
