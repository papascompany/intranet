import { Search, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Employee } from "../domain/types";
import type { EmployeeAccountState } from "../api/types";
import "./employeeDirectory.css";

type DepartmentFilter = "ALL" | Employee["department"];

export interface EmployeeDirectoryProps {
  accountStates: readonly EmployeeAccountState[];
  busy?: boolean;
  employees: readonly Employee[];
  onSelect: (employeeId: string) => void | Promise<void>;
  selectedEmployeeId?: string;
}

const departmentFilters: Array<{ label: string; value: DepartmentFilter }> = [
  { label: "전체", value: "ALL" },
  { label: "운영팀", value: "운영팀" },
  { label: "제작팀", value: "제작팀" }
];

const roleLabels: Record<Employee["role"], string> = {
  EMPLOYEE: "직원",
  APPROVER: "승인자",
  HR_ADMIN: "HR 관리자",
  SYSTEM_ADMIN: "시스템 관리자"
};

export function EmployeeDirectory({ accountStates, busy = false, employees, onSelect, selectedEmployeeId }: EmployeeDirectoryProps) {
  const [department, setDepartment] = useState<DepartmentFilter>("ALL");
  const [query, setQuery] = useState("");
  const accountStateByEmployee = useMemo(
    () => new Map(accountStates.map((state) => [state.employeeId, state])),
    [accountStates]
  );
  const filteredEmployees = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return employees.filter((employee) => {
      if (department !== "ALL" && employee.department !== department) return false;
      if (!keyword) return true;
      return [employee.name, employee.employeeNumber, employee.position, employee.department]
        .some((value) => value?.toLocaleLowerCase("ko-KR").includes(keyword));
    });
  }, [department, employees, query]);

  return (
    <section aria-labelledby="employee-directory-title" className="employee-directory">
      <header className="employee-directory__header">
        <div>
          <p><Users aria-hidden="true" /> 인사 관리</p>
          <h2 id="employee-directory-title">전체 직원</h2>
        </div>
        <strong>{filteredEmployees.length}명</strong>
      </header>

      <label className="employee-directory__search">
        <Search aria-hidden="true" />
        <span className="sr-only">직원 검색</span>
        <input onChange={(event) => setQuery(event.target.value)} placeholder="이름, 사번, 직급 검색" type="search" value={query} />
      </label>

      <div aria-label="부서 필터" className="employee-directory__filters">
        {departmentFilters.map((filter) => (
          <button
            aria-pressed={department === filter.value}
            className={department === filter.value ? "is-active" : undefined}
            key={filter.value}
            onClick={() => setDepartment(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div aria-label="직원 목록" className="employee-directory__list" role="list">
        {filteredEmployees.map((employee) => {
          const account = accountStateByEmployee.get(employee.id);
          return (
            <div key={employee.id} role="listitem">
              <button
                aria-current={selectedEmployeeId === employee.id ? "true" : undefined}
                className={selectedEmployeeId === employee.id ? "is-selected" : undefined}
                disabled={busy}
                onClick={() => void onSelect(employee.id)}
                type="button"
              >
                <span className="employee-directory__avatar"><UserRound aria-hidden="true" /></span>
                <span className="employee-directory__identity">
                  <strong>{employee.name}</strong>
                  <small>{employee.employeeNumber ?? "사번 미지정"} · {employee.position ?? roleLabels[employee.role]}</small>
                </span>
                <span className="employee-directory__meta">
                  <small>{employee.department}</small>
                  <em className={account?.enabled ? "is-enabled" : undefined}>{account?.enabled ? "사용중" : "미사용"}</em>
                </span>
              </button>
            </div>
          );
        })}
        {filteredEmployees.length === 0 ? <p className="employee-directory__empty">조건에 맞는 직원이 없습니다.</p> : null}
      </div>
    </section>
  );
}
