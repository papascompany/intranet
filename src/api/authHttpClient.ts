import type { AuthSession } from "./auth";

type AuthResponse = {
  session: AuthSession;
};

type AuthError = {
  error?: string;
};

export async function getAuthenticatedSession() {
  const response = await fetch("/api/auth", { credentials: "same-origin" });
  return await parseAuthResponse(response);
}

export async function loginWithLoginId(input: {
  loginId: string;
  password: string;
  rememberLogin: boolean;
}) {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", ...input })
  });
  return await parseAuthResponse(response);
}

/** @deprecated Use loginWithLoginId after the login form has been migrated. */
export async function loginWithEmployeeNumber(input: {
  employeeNumber: string;
  password: string;
  rememberLogin: boolean;
}) {
  return await loginWithLoginId({
    loginId: input.employeeNumber,
    password: input.password,
    rememberLogin: input.rememberLogin
  });
}

export async function changeAuthenticatedPassword(newPassword: string) {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "changePassword", newPassword })
  });
  return await parseAuthResponse(response);
}

export async function logoutAuthenticatedSession() {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" })
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
}

async function parseAuthResponse(response: Response) {
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const body = await response.json() as AuthResponse;
  return body.session;
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as AuthError;
    return body.error ?? "인증 요청을 처리하지 못했습니다.";
  } catch {
    return "인증 요청을 처리하지 못했습니다.";
  }
}
