import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  AuthenticationError,
  authenticateCredentials,
  changeAuthenticatedPassword,
  clearSessionCookie,
  getAuthenticatedSessionFromCookie,
  getAuthQuery,
  refreshRememberedSessionCookie,
  type AuthAccountQuery,
  type ServerAuthEnv
} from "../src/server/productionAuth.js";
import { PasswordValidationError } from "../src/server/sessionAuth.js";

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

type AuthRequest = {
  method: string;
  body?: unknown;
  cookie?: string;
};

type AuthResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const result = await handleAuthHttpRequest(
    { method: request.method ?? "GET", body: parseRequestBody(request.body), cookie: request.headers.cookie },
    process.env
  );

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (result.setCookie) {
    response.setHeader("Set-Cookie", result.setCookie);
  }
  response.end(JSON.stringify(result.body));
}

export async function handleAuthHttpRequest(
  request: AuthRequest,
  env: ServerAuthEnv = process.env,
  query?: AuthAccountQuery
): Promise<AuthResponse> {
  try {
    if (request.method === "GET") {
      const authenticated = await getAuthenticatedSessionFromCookie(request.cookie, env, query);
      if (!authenticated) {
        throw new AuthenticationError();
      }
      return {
        status: 200,
        body: { session: authenticated.session },
        setCookie: refreshRememberedSessionCookie(authenticated, env)
      };
    }

    if (request.method === "POST") {
      const body = request.body as { action?: string; loginId?: string; password?: string; newPassword?: string; rememberLogin?: boolean; employeeName?: string; employeeNumber?: string; requestId?: string } | undefined;
      if (body?.action === "requestPasswordRecovery") {
        await requestPasswordRecovery(body.employeeName ?? "", body.employeeNumber ?? "", query);
        return { status: 200, body: { accepted: true } };
      }
      if (body?.action === "getPasswordRecoveryRequests" || body?.action === "completePasswordRecoveryRequest") {
        const authenticated = await getAuthenticatedSessionFromCookie(request.cookie, env, query);
        if (!authenticated || !["HR_ADMIN", "SYSTEM_ADMIN"].includes(authenticated.session.role)) {
          throw new AuthenticationError("관리자 권한이 필요합니다.");
        }
        if (body.action === "getPasswordRecoveryRequests") {
          const requests = await (query ?? getAuthQuery(env))<Record<string, unknown>>(
            `select request.id, request.employee_name, request.employee_number, request.requested_at,
                    (account.password_change_required and account.password_changed_at >= request.requested_at) as reset_after_request
             from password_recovery_requests request
             join auth_accounts account on account.employee_id = request.employee_id
             where request.status = 'PENDING' order by request.requested_at asc limit 100`
          );
          return { status: 200, body: { requests } };
        }
        const rows = await (query ?? getAuthQuery(env))<Record<string, unknown>>(
          `update password_recovery_requests request set status = 'COMPLETED', resolved_by = $2, resolved_at = now()
           where request.id = $1 and request.status = 'PENDING'
             and exists (
               select 1 from auth_accounts account
               where account.employee_id = request.employee_id
                 and account.password_change_required = true
                 and account.password_changed_at >= request.requested_at
             )
             and ($3 = 'SYSTEM_ADMIN' or exists (
               select 1 from employees target
               where target.id = request.employee_id and target.role in ('EMPLOYEE', 'APPROVER')
             ))
           returning request.id`,
          [body.requestId ?? "", authenticated.session.employeeId, authenticated.session.role]
        );
        if (!rows.length) return { status: 404, body: { error: "대기 중인 복구 요청을 찾지 못했습니다." } };
        return { status: 200, body: { completed: true } };
      }
      if (body?.action === "login") {
        const result = await authenticateCredentials(
          {
            loginId: body.loginId ?? "",
            password: body.password ?? "",
            rememberLogin: body.rememberLogin
          },
          env,
          query
        );
        return { status: 200, body: { session: result.authenticated.session }, setCookie: result.cookie };
      }
      if (body?.action === "changePassword") {
        const result = await changeAuthenticatedPassword(request.cookie, body.newPassword ?? "", env, query);
        return { status: 200, body: { session: result.authenticated.session }, setCookie: result.cookie };
      }
      if (body?.action === "logout") {
        return { status: 200, body: { ok: true }, setCookie: clearSessionCookie(env) };
      }
      return { status: 400, body: { error: `Unsupported auth action: ${body?.action ?? "missing"}` } };
    }

    return { status: 405, body: { error: "Method not allowed" } };
  } catch (error) {
    const isAuthenticationError = error instanceof AuthenticationError;
    const isPasswordValidationError = error instanceof PasswordValidationError;
    return {
      status: isAuthenticationError ? 401 : isPasswordValidationError ? 400 : 500,
      body: { error: isAuthenticationError || isPasswordValidationError ? error.message : "Authentication service unavailable." }
    };
  }
}

const RECOVERY_ACCEPTED_MESSAGE = "요청을 접수했습니다. 관리자에게 확인을 요청해 주세요.";

async function requestPasswordRecovery(employeeName: string, employeeNumber: string, suppliedQuery?: AuthAccountQuery) {
  const name = employeeName.trim().slice(0, 120);
  const number = employeeNumber.trim().slice(0, 80);
  if (!name || !number) return RECOVERY_ACCEPTED_MESSAGE;
  const query = suppliedQuery ?? getAuthQuery(process.env);
  const matched = await query<{ employee_id: string; employee_name: string }>(
    `select employees.id as employee_id, employees.name as employee_name
     from employees join auth_accounts on auth_accounts.employee_id = employees.id
     where employees.name = $1 and upper(auth_accounts.employee_number) = upper($2)
       and employees.employment_status = 'ACTIVE' and auth_accounts.disabled_at is null limit 1`,
    [name, number]
  );
  if (!matched[0]) return RECOVERY_ACCEPTED_MESSAGE;
  await query(
    `insert into password_recovery_requests (id, employee_id, employee_name, employee_number)
     select $1, $2, $3, $4
     where (select count(*) from password_recovery_requests where requested_at > now() - interval '1 hour') < 100
     on conflict (employee_id) where status = 'PENDING' do nothing`,
    [randomUUID(), matched[0].employee_id, name, number]
  );
  return RECOVERY_ACCEPTED_MESSAGE;
}

function parseRequestBody(body: unknown) {
  if (typeof body !== "string") {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
