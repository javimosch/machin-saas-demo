# MachNotes — an end-to-end SaaS demo in one machin binary

A tiny multi-user notes app that wires together the **whole machin backend stack** —
SSO login, sessions, a database, and a web UI — in a single static native binary, all
pure [MFL](https://github.com/javimosch/machin). No Node, no cgo, no client libraries.

| Concern | Built on |
|---|---|
| **SSO login** (OAuth2 / OIDC) | [`framework/sso.src`](https://github.com/javimosch/machin/blob/main/framework/sso.src) |
| **Sessions** (session id → email, 1h TTL) | [`framework/redis.src`](https://github.com/javimosch/machin/blob/main/framework/redis.src) |
| **Data** (a `notes` table, parameterized) | [`framework/postgres.src`](https://github.com/javimosch/machin/blob/main/framework/postgres.src) |
| **Web** (routing, cookies, redirects, SSR) | [`framework/machweb.src`](https://github.com/javimosch/machin/blob/main/framework/machweb.src) |

The whole app is [`src/app.src`](src/app.src) (~200 lines); the rest of `src/` is the
four frameworks vendored verbatim.

## The flow

```
GET /            landing → "Log in with SSO"
GET /login       sso_begin → 302 to the provider (+ a signed CSRF-state cookie)
                 ↳ provider authenticates the user, redirects back with a code
GET /callback    sso_complete (verify state, exchange code, fetch userinfo)
                 → store sessionid→email in Redis (TTL), set a signed cookie → 302 /
GET /            dashboard: the user's notes from Postgres + an add-note form
POST /notes      insert a note (parameterized by the session's email)
GET /api/notes   the same notes as JSON
GET /logout      delete the Redis session + clear the cookie
```

A **mock identity provider** is bundled (a second server on :48191) so the entire login
flow runs locally with no external account. For production, point the `OAuthProvider` at
a real provider (Google / Microsoft / GitHub) and delete the mock.

## Run it

Needs `machin` ([install](https://github.com/javimosch/machin#install)), a C compiler,
and a Postgres + Redis to talk to:

```bash
docker run -d --name pg    -e POSTGRES_PASSWORD=machin -e POSTGRES_DB=machindb -p 5432:5432 postgres:16
docker run -d --name redis -p 6379:6379 redis:7

./build.sh           # encode the frameworks + app → one binary
./machnotes          # serves http://localhost:48190 (app) + :48191 (mock IdP)
```

Open <http://localhost:48190>, click **Log in with SSO**, and add notes. Config via env:
`SESSION_SECRET`, `PGHOST`, `REDISHOST`.

```bash
# or drive it headless:
curl -c jar -b jar -L http://localhost:48190/login            # logs in via the mock IdP
curl -c jar -b jar --data-urlencode "body=hello" -L http://localhost:48190/notes
curl -c jar -b jar http://localhost:48190/api/notes           # -> JSON from Postgres
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
