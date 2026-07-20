import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import pg from "pg";
import { isNeonDatabaseUrl } from "../src/server/neonRepositoryFactory.ts";
import { hashPassword } from "../src/server/sessionAuth.ts";
import { createSensitiveDataCrypto } from "../src/server/sensitiveDataCrypto.ts";

type ScriptQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

type ScriptDatabase = {
  query: ScriptQuery;
  transaction(queries: { text: string; values: unknown[] }[]): Promise<void>;
  end(): Promise<void>;
};

/** Neon URLs use the SQL-over-HTTP driver; any other Postgres URL uses node-postgres. */
function createScriptDatabase(databaseUrl: string): ScriptDatabase {
  if (isNeonDatabaseUrl(databaseUrl)) {
    const sql = neon(databaseUrl);
    return {
      query: async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[],
      transaction: async (queries) => {
        await sql.transaction((transaction) => queries.map((query) => transaction.query(query.text, query.values)));
      },
      end: async () => {}
    };
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  return {
    query: async (text, params = []) => (await pool.query(text, params)).rows as Record<string, unknown>[],
    transaction: async (queries) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const query of queries) {
          await client.query(query.text, query.values);
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end()
  };
}

const DEFAULT_CSV_PATH = "/Users/yohan/Desktop/스토리지/00 회사일반/00 근로계약서/더스토리지 직원명부.csv";
const REQUIRED_COLUMNS = ["아이디", "사번", "사원명", "부서", "직위", "입사일", "연봉", "은행"] as const;
const SENSITIVE_COLUMNS = ["주민등록번호", "계좌번호"] as const;
const CSV_COLUMNS = [...REQUIRED_COLUMNS, ...SENSITIVE_COLUMNS] as const;

export type ImportedEmployee = {
  loginId: string;
  employeeNumber: string;
  name: string;
  department: string;
  position?: string;
  hireDate: string;
  annualSalary?: number;
  payrollBank?: string;
  residentRegistrationNumber?: string;
  payrollAccount?: string;
};

export type ImportSummary = {
  rows: number;
  valid: number;
  upserted: number;
  dryRun: number;
  errors: number;
};

function decodeCsv(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let index = 2; index < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0));
}

/** Parse RFC 4180-style CSV while retaining only the approved columns. */
export function parseEmployeeCsv(input: string): ImportedEmployee[] {
  const records = parseCsvRecords(input);
  const [header, ...rows] = records;
  if (!header) throw new Error("CSV is empty.");

  const indexes = new Map(header.map((value, index) => [value.trim().replace(/^\uFEFF/, ""), index]));
  const missing = REQUIRED_COLUMNS.filter((column) => indexes.get(column) === undefined);
  if (missing.length > 0) throw new Error("CSV is missing required columns.");

  const employees = rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => {
      const value = (column: (typeof CSV_COLUMNS)[number]) => row[indexes.get(column) ?? -1]?.trim() ?? "";
      return {
        loginId: parseLoginId(required(value("아이디"))),
        employeeNumber: required(value("사번")),
        name: required(value("사원명")),
        department: required(value("부서")),
        position: optional(value("직위")),
        hireDate: parseDate(required(value("입사일"))),
        annualSalary: parseSalary(value("연봉")),
        payrollBank: optional(value("은행")),
        residentRegistrationNumber: optional(value("주민등록번호")),
        payrollAccount: optional(value("계좌번호"))
      };
    });

  assertUnique(employees.map((employee) => employee.loginId.toLocaleLowerCase("en-US")));
  assertUnique(employees.map((employee) => employee.employeeNumber.toLocaleLowerCase("en-US")));
  return employees;
}

export async function importEmployees(options: { csvPath?: string; apply?: boolean; databaseUrl?: string; encryptionKey?: string } = {}): Promise<ImportSummary> {
  const sensitiveDataCrypto = options.apply
    ? createSensitiveDataCrypto(options.encryptionKey ?? process.env.EMPLOYEE_DATA_ENCRYPTION_KEY)
    : undefined;
  const csvPath = options.csvPath ?? DEFAULT_CSV_PATH;
  const employees = parseEmployeeCsv(decodeCsv(await readFile(csvPath)));
  const dryRun = options.apply ? 0 : 1;
  if (!options.apply) return { rows: employees.length, valid: employees.length, upserted: 0, dryRun, errors: 0 };

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database configuration is required.");

  const db = createScriptDatabase(databaseUrl);
  try {
    await assertRequiredAccountColumns(db.query);
    const statements = await Promise.all(employees.map(async (employee) => ({
      employee,
      residentRegistrationNumberEncrypted: sensitiveDataCrypto.encodeSensitiveText("resident_registration_number_enc", employee.residentRegistrationNumber),
      payrollAccountEncrypted: sensitiveDataCrypto.encodeSensitiveText("payroll_account_enc", employee.payrollAccount),
      passwordHash: await hashPassword(createTemporaryPassword()),
      employeeId: randomUUID(),
      accountId: randomUUID()
    })));

    await db.transaction(statements.map(({
      employee,
      residentRegistrationNumberEncrypted,
      payrollAccountEncrypted,
      passwordHash,
      employeeId,
      accountId
    }) => ({
      text: UPSERT_EMPLOYEE_SQL,
      values: [
        employeeId,
        employee.name,
        employee.department,
        employee.position ?? null,
        employee.hireDate,
        employee.annualSalary ?? null,
        employee.payrollBank ?? null,
        employee.employeeNumber,
        residentRegistrationNumberEncrypted ?? null,
        payrollAccountEncrypted ?? null,
        accountId,
        employee.loginId,
        passwordHash
      ]
    })));

    return { rows: employees.length, valid: employees.length, upserted: employees.length, dryRun, errors: 0 };
  } finally {
    await db.end();
  }
}

const UPSERT_EMPLOYEE_SQL = `with upserted_employee as (
   insert into employees (
     id, name, department, position, hire_date, annual_salary, payroll_bank, employee_number, resident_registration_number_enc, payroll_account_enc
   ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   on conflict (employee_number) do update set
     name = excluded.name,
     department = excluded.department,
     position = excluded.position,
     hire_date = excluded.hire_date,
     annual_salary = excluded.annual_salary,
     payroll_bank = excluded.payroll_bank,
     resident_registration_number_enc = coalesce(excluded.resident_registration_number_enc, employees.resident_registration_number_enc),
     payroll_account_enc = coalesce(excluded.payroll_account_enc, employees.payroll_account_enc),
     updated_at = now()
   returning id
 )
 insert into auth_accounts (
   id, employee_id, employee_number, login_id, password_hash, password_change_required, disabled_at
 )
 select $11, id, $8, $12, $13, true, now() from upserted_employee
 on conflict (employee_id) do update set
   employee_number = excluded.employee_number,
   login_id = excluded.login_id,
   updated_at = now()`;

export function createTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      if (value.length !== 0) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (character === ",") {
      record.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(value);
      records.push(record);
      record = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("Invalid CSV quoting.");
  if (value.length !== 0 || record.length !== 0) {
    record.push(value);
    records.push(record);
  }
  return records;
}

function required(value: string): string {
  if (!value) throw new Error("CSV has an invalid required value.");
  return value;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function parseLoginId(value: string): string {
  const loginId = value.toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(loginId)) {
    throw new Error("CSV has an invalid login ID.");
  }
  return loginId;
}

function parseDate(value: string): string {
  const match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/.exec(value);
  if (!match) throw new Error("CSV has an invalid date.");
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("CSV has an invalid date.");
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseSalary(value: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s,₩원]/g, "");
  if (!/^\d+$/.test(normalized)) throw new Error("CSV has an invalid salary.");
  const salary = Number(normalized);
  if (!Number.isSafeInteger(salary)) throw new Error("CSV has an invalid salary.");
  return salary;
}

function assertUnique(values: string[]): void {
  if (new Set(values).size !== values.length) throw new Error("CSV has duplicate identifiers.");
}

async function assertRequiredAccountColumns(query: ScriptQuery): Promise<void> {
  const columns = await query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'auth_accounts' and column_name in ('login_id', 'password_change_required')"
  );
  if (columns.length !== 2) throw new Error("Required account schema is unavailable.");
}

function parseArguments(args: string[]): { apply: boolean; csvPath?: string } {
  let apply = false;
  let csvPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--apply") apply = true;
    else if (args[index] === "--csv" && args[index + 1]) csvPath = args[++index];
    else throw new Error("Invalid command arguments.");
  }
  return { apply, csvPath };
}

async function main(): Promise<void> {
  const { apply, csvPath } = parseArguments(process.argv.slice(2));
  writeSummary(await importEmployees({ apply, csvPath }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    writeSummary({ rows: 0, valid: 0, upserted: 0, dryRun: 0, errors: 1 });
    process.exitCode = 1;
  });
}

function writeSummary(summary: ImportSummary): void {
  process.stdout.write([summary.rows, summary.valid, summary.upserted, summary.dryRun, summary.errors].join(" ") + "\n");
}
