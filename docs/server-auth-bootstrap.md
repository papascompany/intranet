# Server Authentication Bootstrap

`auth_accounts` is the server-side credential store for login-ID and password sign-in. Passwords are never stored in plaintext. Create accounts with `hashPassword()` from `src/server/sessionAuth.ts`; store the resulting encoded PBKDF2 value in `auth_accounts.password_hash`.

## Required environment

Set `SESSION_SECRET` in Vercel for Production, Preview, and local server environments. It must be a distinct cryptographically random value of at least 32 characters. Do not expose it as a `VITE_` variable or commit it to source control.

Example generation command:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Bootstrap sequence

1. Provision the production Postgres database and apply the existing schema migrations, including `202607130002_auth_accounts.sql`.
2. Add `SESSION_SECRET` to the Vercel environment. The application must fail closed when it is absent in the future login endpoint integration.
3. In a one-time server-side admin script or protected administrative workflow, create the employee record, call `hashPassword()` with the initial password, and insert the generated hash into `auth_accounts`.
4. `POST /api/auth` with `{ "action": "login", "loginId", "password", "rememberLogin" }` looks up the account by `login_id`, rejects disabled or locked accounts, verifies the password, and issues only an HttpOnly session cookie. `POST /api/auth` with `{ "action": "logout" }` clears it; `GET /api/auth` returns the current server-derived session.
5. Every protected `/api/hr` operation parses the signed `intranet_session` cookie and verifies the account/employee mapping against the database. The handler overwrites browser-supplied `session`, `actorId`, and correction actor fields with this server-derived identity. A missing or invalid cookie receives `401`; the non-sensitive persistence status endpoint remains public.

Session tokens contain an account ID, employee ID, employee number, issued time, and expiry only. They intentionally contain no role or password material. Use HTTPS in production so the default `Secure; HttpOnly; SameSite=Lax` cookie attributes take effect.
