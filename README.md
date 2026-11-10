# سمارت كاش · Smart Cash

نموذج تطبيق لإدارة المصروفات والعهد والفواتير (خطط: أفراد، مؤسسة صغيرة، شركة كبرى). يعمل كتطبيق ويب قابل للتثبيت (PWA) على الجوال والتابلت والكمبيوتر.

Prototype of an expense, custody and invoice management app (plans: individuals, small business, enterprise). Ships as an installable PWA.

## Run locally
    python3 app/build.py
    cd dist && python3 -m http.server 8080   # open http://localhost:8080

## Deploy
Pushing to `main` builds `dist/` and publishes it with GitHub Pages (Settings → Pages → Source: GitHub Actions).

## Production build
`python3 app/build.py` produces `dist/` with **no sample data**: first run shows "Create your workspace" (owner account), then the owner adds users. See `docs/GITHUB_DEPLOY.md`.

## Data
Everything is stored in the browser on the device (no server, no sync). Sample data is included for the demo; clear it from the login screen ("Start with my own data") or Me → Clear sample data.

## Layout
- `prototype/` source (HTML + JS), `app/` PWA build script and icons, `db/` PostgreSQL schema and tests, `docs/` design and architecture.
- Smart Cash never holds money; card issuing and transfers are out of scope.
