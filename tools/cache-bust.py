#!/usr/bin/env python3
"""Stamp local CSS/JS references with a content hash.

Run before committing: python3 tools/cache-bust.py
Browsers and CDNs (e.g. a Cloudflare proxy with a long browser-cache TTL)
then always fetch a changed file, because its URL changes with its content.

1. JavaScript modules first: inside every local .js/.mjs file that a page
   loads (and everything those import, transitively), local module specifiers
   -- `import x from '/a.js'`, `import '/a.js'`, `export * from './a.js'`,
   `import('/a.js')` -- get `?v=<hash of the imported file>`. Files are
   processed leaves first, so a change deep in the graph (zmanim.js) changes
   the importer (ui.js), whose new hash then reaches the HTML. Without this a
   phone could run a fresh ui.js against a stale cached zmanim.js.
2. Then HTML: src/href references to local .js/.css files get the same stamp.
   Relative references are rewritten to absolute paths so pages served under
   rewritten URLs (vercel.json: /admin -> /sys/) still find their assets.

Idempotent: running it twice changes nothing the second time.
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {'node_modules', '.git'}
REF = re.compile(r'(?P<attr>src|href)="(?P<path>(?!https?:|//|data:|#)[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"')
# local module specifiers: '/x.js', './x.js', '../x.mjs' (bare and https: specifiers are left alone)
SPEC = r'(?P<q>[\'"])(?P<path>(?:/|\.\.?/)[^\'"?#\s]+\.m?js)(?:\?v=[0-9a-f]+)?(?P=q)'
IMPORT = re.compile(
    r'(?P<lead>\bfrom\s*|\bimport\s*\(\s*|(?<![.\w$])import\s+)' + SPEC
)


def digest(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def html_files():
    return [f for f in sorted(ROOT.rglob('*.html')) if not SKIP_DIRS & set(f.parts)]


def resolve(spec, base_dir):
    target = (ROOT / spec.lstrip('/')) if spec.startswith('/') else (base_dir / spec)
    target = target.resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    return target if target.is_file() else None


def module_imports(js_file):
    text = js_file.read_text(encoding='utf-8')
    return [t for m in IMPORT.finditer(text) if (t := resolve(m['path'], js_file.parent))]


def stamp_module(js_file):
    text = js_file.read_text(encoding='utf-8')

    def repl(m):
        target = resolve(m['path'], js_file.parent)
        if not target:
            return m[0]
        return f'{m["lead"]}{m["q"]}{m["path"]}?v={digest(target)}{m["q"]}'

    new = IMPORT.sub(repl, text)
    if new != text:
        js_file.write_text(new, encoding='utf-8')
        print('stamped', js_file.relative_to(ROOT))


def stamp_modules():
    """Stamp imports in every JS file the pages load, dependencies first."""
    roots = []
    for f in html_files():
        for m in REF.finditer(f.read_text(encoding='utf-8')):
            if m['path'].endswith('.js') and (t := resolve(m['path'], f.parent)):
                roots.append(t)
    order, state = [], {}  # state: 1 = visiting, 2 = done

    def visit(f):
        if state.get(f) == 2:
            return
        if state.get(f) == 1:
            print(f'warning: import cycle through {f.relative_to(ROOT)}; its stamp may need a second run', file=sys.stderr)
            return
        state[f] = 1
        for dep in module_imports(f):
            visit(dep)
        state[f] = 2
        order.append(f)

    for r in roots:
        visit(r)
    for f in order:  # post-order: leaves before the files that import them
        stamp_module(f)


def stamp_html(html_file):
    text = html_file.read_text(encoding='utf-8')

    def repl(m):
        target = resolve(m['path'], html_file.parent)
        if not target:
            return m[0]
        abs_path = '/' + target.relative_to(ROOT).as_posix()
        return f'{m["attr"]}="{abs_path}?v={digest(target)}"'

    new = REF.sub(repl, text)
    if new != text:
        html_file.write_text(new, encoding='utf-8')
        print('stamped', html_file.relative_to(ROOT))


stamp_modules()
for f in html_files():
    stamp_html(f)
