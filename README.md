# MachNotes — an end-to-end SaaS demo in one machin binary

A tiny multi-user notes app that wires together the **whole machin stack** — SSO login,
sessions, a database, and a **reactive WebAssembly UI** — in a single static native
binary, all pure [MFL](https://github.com/javimosch/machin). No Node, no cgo, no client
libraries, no bundler.

| Concern | Built on |
|---|---|
| **SSO login** (OAuth2 / OIDC) | [`framework/sso.src`](https://github.com/javimosch/machin/blob/main/framework/sso.src) |
| **Sessions** (session id → email, 1h TTL) | [`framework/redis.src`](https://github.com/javimosch/machin/blob/main/framework/redis.src) |
| **Data** (a `notes` table, parameterized, pooled) | [`framework/postgres.src`](https://github.com/javimosch/machin/blob/main/framework/postgres.src) |
| **Web** (routing, cookies, redirects) | [`framework/machweb.src`](https://github.com/javimosch/machin/blob/main/framework/machweb.src) |
| **Reactive UI** (signals + keyed list → wasm) | [`framework/reactive.src`](https://github.com/javimosch/machin/blob/main/framework/reactive.src) |

The server is [`src/app.src`](src/app.src) and the wasm view is [`src/client.src`](src/client.src)
(both MFL); the rest of `src/` is the frameworks vendored verbatim, and
[`web/host.js`](web/host.js) is a ~50-line generic JS host embedded into the binary.

The dashboard is a **single-page app**: the server sends a shell (`<div id=app>`) plus
the wasm bundle; the client (`src/client.src` → `app.wasm`) fetches `/api/notes`, renders
a keyed list with signals, and adds/deletes go through the API and reload — the list
patches only the rows that changed (no `innerHTML` churn, no vdom). Login/landing stay
server-rendered.

## The flow

```
GET /            landing → "Log in with SSO"
GET /login       sso_begin → 302 to the provider (+ a signed CSRF-state cookie)
                 ↳ provider authenticates the user, redirects back with a code
GET /callback    sso_complete (verify state, exchange code, fetch userinfo)
                 → store sessionid→email in Redis (TTL), set a signed cookie → 302 /
GET /            dashboard shell (signed-in chrome + <div id=app> + the wasm host)
GET /app.wasm    the reactive client bundle (served with application/wasm)
GET /api/notes   the session user's notes as JSON (the client fetches this)
POST /api/notes  insert a note (parameterized by the session's email) → updated JSON
POST /api/notes/del?id=N   delete a note → updated JSON
GET /logout      delete the Redis session + clear the cookie
```

A **mock identity provider** is bundled (a second server on :48191) so the entire login
flow runs locally with no external account. For production, point the `OAuthProvider` at
a real provider (Google / Microsoft / GitHub) and delete the mock.

## Run it

Needs `machin` ([install](https://github.com/javimosch/machin#install)), a C compiler,
[`zig`](https://ziglang.org) (the C→wasm compiler for the client), and a Postgres + Redis:

```bash
docker run -d --name pg    -e POSTGRES_PASSWORD=machin -e POSTGRES_DB=machindb -p 5432:5432 postgres:16
docker run -d --name redis -p 6379:6379 redis:7

./build.sh           # builds app.wasm (the client) + the machnotes binary (the server)
./machnotes          # http://localhost:48190 (app) + :48191 (mock IdP)
```

Open <http://localhost:48190>, click **Log in with SSO**, and add/delete notes — the
list updates reactively (the wasm client patches just the changed rows). Config via env:
`PORT`, `IDP_PORT` (override the default 48190/48191 if a port is taken),
`SESSION_SECRET`, `PGHOST`, `REDISHOST`.

```bash
PORT=8080 IDP_PORT=8081 ./machnotes        # custom ports

# or drive it headless:
curl -c jar -b jar -L http://localhost:48190/login                       # log in via the mock IdP
curl -c jar -b jar -X POST -d "body=hello" http://localhost:48190/api/notes
curl -c jar -b jar http://localhost:48190/api/notes                      # -> JSON from Postgres
```

## What this demonstrates

One machin binary is a credible SME backend: an HTTP server, server-rendered UI,
**OAuth2/OIDC SSO**, **signed sessions in Redis**, and **parameterized Postgres** — all
in one language, one static binary, no runtime.

It is also **concurrency-safe**: machweb handles each request in its own goroutine, so
the Postgres and Redis connections come from a **pool** (`pg_pool_init` / `pg_acquire` /
`pg_release`, and the Redis equivalents). Each request acquires its own connection and
releases it, so parallel requests never interleave — verified at 40 concurrent requests.
(This demo is what surfaced connection pooling on the backend
[north star](https://github.com/javimosch/machin/blob/main/docs/NORTH-STAR-BACKEND.md);
it was added in machin v0.65.0 and this app now uses it.)

Built with [machin](https://github.com/javimosch/machin) · part of
[awesome-machin](https://github.com/javimosch/awesome-machin).
