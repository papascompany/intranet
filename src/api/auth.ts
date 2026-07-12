import type { Employee, Role } from "../domain/types.js";

export type AuthSession = {
  employeeId: string;
  role: Role;
  authenticatedAt: string;
  rememberLogin: boolean;
};

export function createDemoAuthSession(
  employee: Employee,
  options: { now?: string; rememberLogin?: boolean } = {}
): AuthSession {
  return {
    employeeId: employee.id,
    role: employee.role,
    authenticatedAt: options.now ?? new Date().toISOString(),
    rememberLogin: options.rememberLogin ?? false
  };
}

export function isAdminRole(role: Role) {
  return role === "HR_ADMIN" || role === "SYSTEM_ADMIN";
}

export function isAdminSession(session?: AuthSession) {
  return Boolean(session && isAdminRole(session.role));
}

export function canApproveRequests(session?: AuthSession) {
  return Boolean(session && (session.role === "APPROVER" || isAdminRole(session.role)));
}
