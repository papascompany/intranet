import type { AuthSession } from "../api/auth.js";
import { createNeonQuery } from "./neonRepositoryFactory.js";
import {
  createSignedSessionToken,
  getRequiredSessionSecret,
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
  password_hash: string;
  role: AuthSession["role"];
  disabled_at?: string | null;
  locked_until?: string | null;
};

export type CredentialLoginInput = {
  employeeNumber: string;
  password: string;
  rememberLogin?: boolean;
};

export type AuthenticatedServerSession = {
  session: AuthSession;
  accountId: string;
  employeeNumber: string;
};

const SESSION_COOKIE_NAME = "intranet_session";
const INVALID_CREDENTIALS = "Invalid employee number or password.";

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
  const employeeNumber = input.employeeNumber.trim();
  if (!employeeNumber || !input.password) {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  const account = await findAccountByEmployeeNumber(query, employeeNumber);
  if (!account || !isAccountActive(account, now)) {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  if (!(await verifyPassword(input.password, account.password_hash))) {
    await recordFailedSignIn(query, account.account_id);
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  await query("update auth_accounts set failed_sign_in_count = 0, last_signed_in_at = now(), updated_at = now() where id = $1", [account.account_id]);
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

async function findAccountByEmployeeNumber(query: AuthAccountQuery, employeeNumber: string) {
  const rows = await query<AuthAccountRow>(
    `select
       auth_accounts.id as account_id,
       auth_accounts.employee_id,
       auth_accounts.employee_number,
       auth_accounts.password_hash,
       auth_accounts.disabled_at,
       auth_accounts.locked_until,
       employees.role
     from auth_accounts
     join employees on employees.id = auth_accounts.employee_id
     where auth_accounts.employee_number = $1
     limit 1`,
    [employeeNumber]
  );
  return rows[0];
}

async function findAccountBySignedSession(query: AuthAccountQuery, token: ServerAuthSession) {
  const rows = await query<AuthAccountRow>(
    `select
       auth_accounts.id as account_id,
       auth_accounts.employee_id,
       auth_accounts.employee_number,
       auth_accounts.password_hash,
       auth_accounts.disabled_at,
       auth_accounts.locked_until,
       employees.role
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

function toAuthenticatedSession(account: AuthAccountRow, rememberLogin: boolean, now: Date): AuthenticatedServerSession {
  return {
    accountId: account.account_id,
    employeeNumber: account.employee_number,
    session: {
      employeeId: account.employee_id,
      role: account.role,
      authenticatedAt: now.toISOString(),
      rememberLogin
    }
  };
}

function isAccountActive(account: AuthAccountRow, now: Date) {
  return !account.disabled_at && (!account.locked_until || new Date(account.locked_until).getTime() <= now.getTime());
}

async function recordFailedSignIn(query: AuthAccountQuery, accountId: string) {
  await query("update auth_accounts set failed_sign_in_count = failed_sign_in_count + 1, updated_at = now() where id = $1", [accountId]);
}

function shouldUseSecureCookie(env: ServerAuthEnv) {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}
