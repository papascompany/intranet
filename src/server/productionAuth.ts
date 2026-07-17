import type { AuthSession } from "../api/auth.js";
import { createNeonQuery } from "./neonRepositoryFactory.js";
import {
  createSignedSessionToken,
  getRequiredSessionSecret,
  hashPassword,
  parseCookieHeader,
  serializeSessionCookie,
  verifyPassword,
  verifySignedSessionToken,
  type ServerAuthSession
} from "./sessionAuth.js";

export type ServerAuthEnv = {
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  VERCEL?: string;
  NODE_ENV?: string;
};

export type AuthAccountQuery = <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type AuthAccountRow = Record<string, unknown> & {
  account_id: string;
  employee_id: string;
  employee_number: string;
  login_id: string;
  password_hash: string;
  password_change_required: boolean;
  failed_sign_in_count?: number;
  role: AuthSession["role"];
  employment_status?: "ACTIVE" | "LEAVE" | "TERMINATED";
  disabled_at?: string | null;
  locked_until?: string | null;
};

export type CredentialLoginInput = {
  loginId: string;
  password: string;
  rememberLogin?: boolean;
};

export type AuthenticatedServerSession = {
  session: AuthSession;
  accountId: string;
  employeeNumber: string;
};

const SESSION_COOKIE_NAME = "intranet_session";
const INVALID_CREDENTIALS = "Invalid login ID or password.";
const MAX_FAILED_SIGN_INS = 5;
const SIGN_IN_LOCK_DURATION_MS = 15 * 60 * 1000;

export function getAuthQuery(env: ServerAuthEnv = process.env): AuthAccountQuery {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for server authentication.");
  }
  return createNeonQuery(env.DATABASE_URL);
}

export async function authenticateCredentials(
  input: CredentialLoginInput,
  env: ServerAuthEnv = process.env,
  query: AuthAccountQuery = getAuthQuery(env),
  now = new Date()
): Promise<{ authenticated: AuthenticatedServerSession; cookie: string }> {
  const loginId = input.loginId.trim();
  if (!loginId || !input.password) {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  const account = await findAccountByLoginId(query, loginId);
  if (!account || !isAccountActive(account, now)) {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  await clearExpiredSignInLock(query, account, now);

  if (!(await verifyPassword(input.password, account.password_hash))) {
    await recordFailedSignIn(query, account.account_id, now);
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  await query("update auth_accounts set failed_sign_in_count = 0, locked_until = null, last_signed_in_at = now(), updated_at = now() where id = $1", [account.account_id]);
  const authenticated = toAuthenticatedSession(account, input.rememberLogin ?? false, now);
  const secret = getRequiredSessionSecret(env);
  const lifetimeSeconds = authenticated.session.rememberLogin ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
  const token = createSignedSessionToken(
    {
      accountId: authenticated.accountId,
      employeeId: authenticated.session.employeeId,
      employeeNumber: authenticated.employeeNumber
    },
    secret,
    now.getTime(),
    lifetimeSeconds * 1000
  );

  return {
    authenticated,
    cookie: serializeSessionCookie(token, {
      name: SESSION_COOKIE_NAME,
      maxAgeSeconds: lifetimeSeconds,
      secure: shouldUseSecureCookie(env)
    })
  };
}

export async function changeAuthenticatedPassword(
  cookieHeader: string | undefined,
  newPassword: string,
  env: ServerAuthEnv = process.env,
  query: AuthAccountQuery = getAuthQuery(env),
  now = new Date()
): Promise<AuthenticatedServerSession> {
  const authenticated = await getAuthenticatedSessionFromCookie(cookieHeader, env, query, now);
  if (!authenticated) {
    throw new AuthenticationError();
  }

  const passwordHash = await hashPassword(newPassword);
  await query(
    "update auth_accounts set password_hash = $1, password_changed_at = now(), password_change_required = false, updated_at = now() where id = $2",
    [passwordHash, authenticated.accountId]
  );

  return {
    ...authenticated,
    session: { ...authenticated.session, passwordChangeRequired: false }
  };
}

export async function getAuthenticatedSessionFromCookie(
  cookieHeader: string | undefined,
  env: ServerAuthEnv = process.env,
  query: AuthAccountQuery = getAuthQuery(env),
  now = new Date()
): Promise<AuthenticatedServerSession | undefined> {
  const token = parseCookieHeader(cookieHeader)[SESSION_COOKIE_NAME];
  const tokenSession = verifySignedSessionToken(token, getRequiredSessionSecret(env), now.getTime());
  if (!tokenSession) {
    return undefined;
  }

  const account = await findAccountBySignedSession(query, tokenSession);
  if (!account || !isAccountActive(account, now)) {
    return undefined;
  }

  return toAuthenticatedSession(account, false, new Date(tokenSession.issuedAt));
}

export function clearSessionCookie(env: ServerAuthEnv = process.env): string {
  return serializeSessionCookie("logout", {
    name: SESSION_COOKIE_NAME,
    maxAgeSeconds: 0,
    secure: shouldUseSecureCookie(env)
  });
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export async function findAccountByLoginId(query: AuthAccountQuery, loginId: string) {
  const rows = await query<AuthAccountRow>(
    `select
       auth_accounts.id as account_id,
       auth_accounts.employee_id,
       auth_accounts.employee_number,
       auth_accounts.login_id,
       auth_accounts.password_hash,
       auth_accounts.password_change_required,
       auth_accounts.failed_sign_in_count,
       auth_accounts.disabled_at,
       auth_accounts.locked_until,
       employees.role,
       employees.employment_status
     from auth_accounts
     join employees on employees.id = auth_accounts.employee_id
     where auth_accounts.login_id = $1
     limit 1`,
    [loginId]
  );
  return rows[0];
}

export async function findAccountBySignedSession(query: AuthAccountQuery, token: ServerAuthSession) {
  const rows = await query<AuthAccountRow>(
    `select
       auth_accounts.id as account_id,
       auth_accounts.employee_id,
       auth_accounts.employee_number,
       auth_accounts.login_id,
       auth_accounts.password_hash,
       auth_accounts.password_change_required,
       auth_accounts.failed_sign_in_count,
       auth_accounts.disabled_at,
       auth_accounts.locked_until,
       employees.role,
       employees.employment_status
     from auth_accounts
     join employees on employees.id = auth_accounts.employee_id
     where auth_accounts.id = $1
       and auth_accounts.employee_id = $2
       and auth_accounts.employee_number = $3
     limit 1`,
    [token.accountId, token.employeeId, token.employeeNumber]
  );
  return rows[0];
}

export function toAuthenticatedSession(account: AuthAccountRow, rememberLogin: boolean, now: Date): AuthenticatedServerSession {
  return {
    accountId: account.account_id,
    employeeNumber: account.employee_number,
    session: {
      employeeId: account.employee_id,
      role: account.role,
      authenticatedAt: now.toISOString(),
      rememberLogin,
      passwordChangeRequired: account.password_change_required
    }
  };
}

export function isAccountActive(account: AuthAccountRow, now: Date) {
  if (account.employment_status === "TERMINATED" || account.disabled_at) {
    return false;
  }
  if (!account.locked_until) {
    return true;
  }

  const lockedUntil = new Date(account.locked_until).getTime();
  return Number.isFinite(lockedUntil) && lockedUntil <= now.getTime();
}

async function recordFailedSignIn(query: AuthAccountQuery, accountId: string, now: Date) {
  const lockedUntil = new Date(now.getTime() + SIGN_IN_LOCK_DURATION_MS).toISOString();
  await query(
    `update auth_accounts
     set failed_sign_in_count = coalesce(failed_sign_in_count, 0) + 1,
         locked_until = case when coalesce(failed_sign_in_count, 0) + 1 >= $2 then $3::timestamptz else locked_until end,
         updated_at = now()
     where id = $1`,
    [accountId, MAX_FAILED_SIGN_INS, lockedUntil]
  );
}

async function clearExpiredSignInLock(query: AuthAccountQuery, account: AuthAccountRow, now: Date) {
  if (!account.locked_until || new Date(account.locked_until).getTime() > now.getTime()) {
    return;
  }

  await query(
    "update auth_accounts set failed_sign_in_count = 0, locked_until = null, updated_at = now() where id = $1 and locked_until <= $2",
    [account.account_id, now.toISOString()]
  );
  account.failed_sign_in_count = 0;
  account.locked_until = null;
}

function shouldUseSecureCookie(env: ServerAuthEnv) {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}
