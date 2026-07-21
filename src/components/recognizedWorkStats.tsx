import { useMemo, useState } from "react";
import type { AttendanceRecord, Employee } from "../domain/types";
import { buildRecognizedWorkStats, formatRecognizedMinutes } from "../features/recognizedWork";
import { DetailPanel, KpiGrid, KpiTile } from "./erp";
import "./recognizedWorkStats.css";

export function RecognizedWorkSummary({ monthLabel, cumulativeLabel }: { monthLabel: string; cumulativeLabel: string }) {
  return (
    <section aria-label="인정근로시간 요약" className="recognized-work-summary">
      <div>
        <span>이번 달 인정근로</span>
        <strong>{monthLabel}</strong>
        <small>이번 달 조기퇴근으로 누적된 시간</small>
      </div>
      <div>
        <span>누적 인정근로</span>
        <strong>{cumulativeLabel}</strong>
        <small>전체 근태 기록 기준</small>
      </div>
    </section>
  );
}

export function RecognizedWorkStats({ asOf, employees, records }: { asOf: string; employees: Employee[]; records: AttendanceRecord[] }) {
  const currentMonth = asOf.slice(0, 7);
  const [startDate, setStartDate] = useState(`${currentMonth}-01`);
  const [endDate, setEndDate] = useState(asOf.slice(0, 10));
  const [employeeId, setEmployeeId] = useState("");
  const stats = useMemo(
    () => buildRecognizedWorkStats(records, employees, { startDate, endDate, employeeId: employeeId || undefined }),
    [employeeId, employees, endDate, records, startDate]
  );

  return (
    <DetailPanel title="인정근로시간 통계" description="직원별·기간별·날짜별 조기퇴근 인정 시간을 한 화면에서 집계합니다.">
      <div className="recognized-work-filters" aria-label="인정근로시간 통계 필터">
        <label><span>시작일</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label><span>종료일</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label><span>직원</span><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">전체 직원</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
        <button type="button" onClick={() => { setStartDate(`${currentMonth}-01`); setEndDate(asOf.slice(0, 10)); setEmployeeId(""); }}>이번 달</button>
      </div>
      <KpiGrid className="recognized-work-kpis">
        <KpiTile label="기간 합계" value={formatRecognizedMinutes(stats.totalMinutes)} footer={`${stats.totalDays}일 기록`} />
        <KpiTile label="집계 직원" value={`${stats.employeeTotals.length}명`} footer="인정근로 발생 직원" />
        <KpiTile label="최다 누적 직원" value={stats.employeeTotals[0] ? formatRecognizedMinutes(stats.employeeTotals[0].minutes) : "0분"} footer={stats.employeeTotals[0]?.name ?? "기록 없음"} />
      </KpiGrid>
      <div className="recognized-work-tables">
        <RecognizedWorkTable title="직원별" headers={["직원", "부서", "일수", "인정근로"]} rows={stats.employeeTotals.map((total) => [total.name, total.department, `${total.days}일`, formatRecognizedMinutes(total.minutes)])} empty="선택한 조건의 인정근로 기록이 없습니다." />
        <RecognizedWorkTable title="날짜별" headers={["날짜", "직원 수", "인정근로"]} rows={stats.dateTotals.map((total) => [total.date, `${total.employees}명`, formatRecognizedMinutes(total.minutes)])} empty="선택한 조건의 날짜별 기록이 없습니다." />
      </div>
    </DetailPanel>
  );
}

function RecognizedWorkTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="recognized-work-table-wrap">
      <h4>{title}</h4>
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={`${title}-${rowIndex}`}>{row.map((value, valueIndex) => <td key={`${rowIndex}-${valueIndex}`}><strong>{valueIndex === row.length - 1 ? value : null}</strong>{valueIndex === row.length - 1 ? null : value}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 ? <p className="recognized-work-empty">{empty}</p> : null}
    </div>
  );
}
