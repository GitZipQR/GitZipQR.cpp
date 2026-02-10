import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Pool } from 'pg';

dotenv.config();

export type DatabaseName =
  | 'test'
const pools = new Map<DatabaseName, Pool>();

const getPool = (db: DatabaseName): Pool => {
  let pool = pools.get(db);
  if (!pool) {
    pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: db,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT),
    });
    pools.set(db, pool);
  }
  return pool;
};

const AUTO_SCHEMA = process.env.DB_AUTO_SCHEMA !== "0";
const AUTO_DATABASE = process.env.DB_AUTO_DATABASE !== "0";
const AUTO_INDEX = process.env.DB_AUTO_INDEX !== "0";
const AUTO_SCHEMA_LOG = process.env.DB_AUTO_SCHEMA_LOG !== "0";
const AUTO_TYPES = process.env.DB_AUTO_TYPES !== "0";
const ensuredDatabases = new Set<DatabaseName>();

type ColumnTypeInfo = {
  type: string;
  priority: number;
  fromWhere: boolean;
};

type TableRef = {
  schema: string;
  name: string;
};

const PRIORITY_SELECT = 1;
const PRIORITY_WHERE = 2;
const PRIORITY_ASSIGN = 3;

const stripSqlComments = (sql: string): string =>
  sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const quoteIdent = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

type AutoSchemaData = Record<string, Record<string, Record<string, string>>>;

const AUTO_SCHEMA_DATA_START = "AUTO_SCHEMA_DATA_START";
const AUTO_SCHEMA_DATA_END = "AUTO_SCHEMA_DATA_END";
const TYPE_FILE_PATH = path.resolve(__dirname, "./scheme/postgesql/test/type.ts");
let cachedAutoSchema: AutoSchemaData | null = null;
let autoSchemaWriteQueue = Promise.resolve();

const logSchema = (message: string) => {
  if (!AUTO_SCHEMA_LOG) return;
  // eslint-disable-next-line no-console
  console.log(`[db:auto-schema] ${message}`);
};

const toPascalCase = (value: string): string => {
  const cleaned = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "Unknown";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
};

const makeTypeAliasName = (schema: string, table: string): string => {
  const schemaPart = toPascalCase(schema);
  const tablePart = toPascalCase(table);
  const name = `${schemaPart}${tablePart}Row`;
  return /^[A-Za-z_]/.test(name) ? name : `T${name}`;
};

const extractAutoSchemaJson = (content: string): AutoSchemaData | null => {
  const regex = new RegExp(
    `/\\*\\s*${AUTO_SCHEMA_DATA_START}\\s*([\\s\\S]*?)\\s*${AUTO_SCHEMA_DATA_END}\\s*\\*/`,
  );
  const match = content.match(regex);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AutoSchemaData;
  } catch {
    return null;
  }
};

const buildTypeFile = (data: AutoSchemaData): string => {
  const json = JSON.stringify(data, null, 2);
  const schemaEntries = Object.entries(data);
  const aliasLines: string[] = [];

  for (const [schemaName, tables] of schemaEntries) {
    const tableEntries = Object.keys(tables || {});
    for (const tableName of tableEntries) {
      const aliasName = makeTypeAliasName(schemaName, tableName);
      aliasLines.push(
        `export type ${aliasName} = TableRow<"${schemaName}", "${tableName}">;`,
      );
    }
  }

  const aliasesBlock = aliasLines.length ? `\n${aliasLines.join("\n")}\n` : "\n";

  return `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Updated by server-app/db/index.ts when DB_AUTO_TYPES is enabled.

/* ${AUTO_SCHEMA_DATA_START}
${json}
${AUTO_SCHEMA_DATA_END} */

export const AUTO_SCHEMA = ${json} as const;

export type AutoSchema = typeof AUTO_SCHEMA;
export type SchemaName = keyof AutoSchema;
export type TableName<S extends SchemaName> = keyof AutoSchema[S];
export type ColumnName<
  S extends SchemaName,
  T extends TableName<S>
> = keyof AutoSchema[S][T];
export type ColumnType<
  S extends SchemaName,
  T extends TableName<S>,
  C extends ColumnName<S, T>
> = AutoSchema[S][T][C];

export type KnownPgColumnType =
  | "smallint"
  | "integer"
  | "bigint"
  | "serial"
  | "bigserial"
  | "numeric"
  | "real"
  | "double precision"
  | "boolean"
  | "text"
  | "varchar"
  | "character varying"
  | "bpchar"
  | "character"
  | "uuid"
  | "json"
  | "jsonb"
  | "bytea"
  | "date"
  | "time"
  | "timestamp"
  | "timestamptz"
  | "inet"
  | "cidr"
  | "macaddr"
  | "text[]"
  | "numeric[]"
  | "boolean[]"
  | "timestamptz[]"
  | "uuid[]";

export type PgColumnType = KnownPgColumnType | (string & {});

export type PgToTs<T extends string> =
  T extends \`\${infer Base}[]\` ? PgToTs<Base>[] :
  T extends "smallint" | "integer" | "bigint" | "serial" | "bigserial" | "numeric" | "real" | "double precision" ? number :
  T extends "boolean" ? boolean :
  T extends "json" | "jsonb" ? any :
  T extends "bytea" ? Buffer :
  T extends "uuid" | "text" | "varchar" | "character varying" | "bpchar" | "character" | "inet" | "cidr" | "macaddr" ? string :
  T extends "timestamp" | "timestamptz" | "date" | "time" ? Date :
  unknown;

export type TableRow<S extends SchemaName, T extends TableName<S>> = {
  [C in ColumnName<S, T>]: PgToTs<ColumnType<S, T, C>>;
};
${aliasesBlock}
export const PG_TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  serial4: "serial",
  serial8: "bigserial",
  float4: "real",
  float8: "double precision",
  bool: "boolean",
  varchar: "varchar",
  "character varying": "character varying",
  char: "bpchar",
  bpchar: "bpchar",
  timestamptz: "timestamptz",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
};

export const normalizePgType = (type: string): string => {
  const trimmed = type.trim().toLowerCase();
  if (trimmed.endsWith("[]")) {
    const base = trimmed.slice(0, -2);
    const normalizedBase = PG_TYPE_ALIASES[base] ?? base;
    return \`\${normalizedBase}[]\`;
  }
  return PG_TYPE_ALIASES[trimmed] ?? trimmed;
};

export const pgTypeToTs = (type: string): string => {
  const normalized = normalizePgType(type);
  if (normalized.endsWith("[]")) {
    const base = normalized.slice(0, -2);
    return \`\${pgTypeToTs(base)}[]\`;
  }
  switch (normalized) {
    case "smallint":
    case "integer":
    case "bigint":
    case "serial":
    case "bigserial":
    case "numeric":
    case "real":
    case "double precision":
      return "number";
    case "boolean":
      return "boolean";
    case "json":
    case "jsonb":
      return "any";
    case "bytea":
      return "Buffer";
    case "uuid":
    case "text":
    case "varchar":
    case "character varying":
    case "bpchar":
    case "character":
    case "inet":
    case "cidr":
    case "macaddr":
      return "string";
    case "timestamp":
    case "timestamptz":
    case "date":
    case "time":
      return "Date";
    default:
      return "unknown";
  }
};
`;
};

const readAutoSchema = async (): Promise<AutoSchemaData> => {
  if (cachedAutoSchema) return cachedAutoSchema;
  try {
    const content = await fs.promises.readFile(TYPE_FILE_PATH, "utf8");
    const parsed = extractAutoSchemaJson(content);
    if (parsed) {
      cachedAutoSchema = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  cachedAutoSchema = {};
  return cachedAutoSchema;
};

const writeAutoSchema = async (data: AutoSchemaData): Promise<void> => {
  cachedAutoSchema = data;
  await fs.promises.mkdir(path.dirname(TYPE_FILE_PATH), { recursive: true });
  const content = buildTypeFile(data);
  await fs.promises.writeFile(TYPE_FILE_PATH, content, "utf8");
};

const updateAutoTypes = async (table: TableRef, columns: Array<{ name: string; type: string }>) => {
  if (!AUTO_TYPES) return;
  const schemaName = table.schema || "public";
  if (!table.name) return;

  const data = await readAutoSchema();
  let changed = false;

  if (!data[schemaName]) {
    data[schemaName] = {};
    changed = true;
  }
  if (!data[schemaName][table.name]) {
    data[schemaName][table.name] = {};
    changed = true;
  }

  const tableData = data[schemaName][table.name];
  for (const column of columns) {
    const normalizedType = normalizeTypeName(column.type);
    const existing = tableData[column.name];
    if (!existing) {
      tableData[column.name] = normalizedType;
      changed = true;
    } else {
      const merged = mergeTypes(existing, normalizedType);
      if (merged !== existing) {
        tableData[column.name] = merged;
        changed = true;
      }
    }
  }

  if (!changed) return;

  autoSchemaWriteQueue = autoSchemaWriteQueue
    .then(async () => {
      await writeAutoSchema(data);
      logSchema(`updated types ${schemaName}.${table.name}`);
    })
    .catch(() => {
      // ignore
    });

  await autoSchemaWriteQueue;
};

const buildIndexName = (table: TableRef, column: string): string => {
  const base = `${table.name}_${column}_idx`.replace(/[^a-zA-Z0-9_]/g, "_");
  if (base.length <= 60) return base;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 33 + base.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(36).slice(0, 6);
  const trimmed = base.slice(0, Math.max(1, 60 - suffix.length - 1));
  return `${trimmed}_${suffix}`;
};

const ensureDatabaseExists = async (db: DatabaseName): Promise<void> => {
  if (!AUTO_DATABASE) return;
  if (db === "postgres") return;
  if (ensuredDatabases.has(db)) return;

  const adminPool = getPool("postgres");
  const existsRes = await adminPool.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [db],
  );
  if (existsRes.rowCount === 0) {
    try {
      await adminPool.query(`CREATE DATABASE ${quoteIdent(db)}`);
      logSchema(`created database ${db}`);
    } catch (error: any) {
      if (error?.code !== "42P04") {
        throw error;
      }
    }
  }
  ensuredDatabases.add(db);
};

const normalizeIdentifier = (token: string): string => {
  let name = token.trim();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex !== -1) {
    name = name.slice(dotIndex + 1);
  }
  if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
    name = name.slice(1, -1).replace(/""/g, '"');
  }
  return name;
};

const splitTopLevel = (input: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }

    if (ch === "(") {
      depth += 1;
      current += ch;
      continue;
    }

    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const parseTableRef = (raw: string): TableRef | null => {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length === 2) {
    return {
      schema: normalizeIdentifier(parts[0]),
      name: normalizeIdentifier(parts[1]),
    };
  }
  return { schema: "public", name: normalizeIdentifier(raw) };
};

function normalizeTypeName(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "int" || normalized === "int4") return "integer";
  if (normalized === "int8") return "bigint";
  if (normalized === "float8" || normalized === "double precision") return "numeric";
  if (normalized === "varchar" || normalized === "character varying") return "text";
  if (normalized === "character") return "bpchar";
  if (normalized === "serial4") return "serial";
  if (normalized === "serial8") return "bigserial";
  return type.trim();
}

function inferScalarTypeFromArray(values: any[]): string {
  if (values.length === 0) return "text";
  const types = values.map((value) => inferTypeFromValue(value));
  const unique = Array.from(new Set(types));
  if (unique.length === 1) {
    const single = unique[0];
    if (single === "integer" || single === "numeric" || single === "bigint") return "numeric";
    if (single === "boolean") return "boolean";
    if (single === "bpchar" || single === "text" || single === "varchar") return "text";
    if (single === "timestamptz" || single === "timestamp" || single === "date") return "timestamptz";
    return single;
  }
  if (unique.every((t) => ["integer", "numeric", "bigint"].includes(t))) return "numeric";
  if (unique.every((t) => ["text", "varchar", "bpchar"].includes(t))) return "text";
  if (unique.some((t) => t === "jsonb")) return "jsonb";
  return "text";
}

function inferTypeFromValue(value: any): string {
  if (value === null || value === undefined) return "text";
  if (value instanceof Date) return "timestamptz";
  if (Buffer.isBuffer(value)) return "bytea";
  if (Array.isArray(value)) {
    const scalar = inferScalarTypeFromArray(value);
    if (scalar === "jsonb") return "jsonb";
    if (scalar === "boolean") return "boolean[]";
    if (scalar === "numeric") return "numeric[]";
    if (scalar === "timestamptz") return "timestamptz[]";
    return "text[]";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "numeric";
  if (typeof value === "bigint") return "numeric";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return "uuid";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "date";
    if (/^\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}(\.\d+)?(z|[+-]\d{2}:\d{2})?$/.test(trimmed)) {
      return "timestamptz";
    }
    if (/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) return "time";
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) return "inet";
    if (/^[0-9a-f:]{2,}$/i.test(trimmed) && trimmed.includes(":")) return "inet";
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(trimmed);
        return "jsonb";
      } catch {
        // fall through
      }
    }
    if (trimmed.length === 1) return "bpchar";
    return "text";
  }
  if (Object.prototype.toString.call(value) === "[object Object]") return "jsonb";
  return "text";
}

const inferTypeFromLiteral = (literal: string): string => {
  const trimmed = literal.trim();
  if (!trimmed) return "text";
  if (/^null$/i.test(trimmed)) return "text";
  if (/^(true|false)$/i.test(trimmed)) return "boolean";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "uuid";
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed.includes(".") ? "numeric" : "integer";
  }
  if (/^(now\(\)|current_timestamp)$/i.test(trimmed)) return "timestamptz";
  if (/^current_date$/i.test(trimmed)) return "date";
  if (trimmed.startsWith("ARRAY[") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "jsonb";
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    const unescaped = trimmed.slice(1, -1).replace(/''/g, "'");
    if (/^\d{4}-\d{2}-\d{2}$/.test(unescaped)) return "date";
    if (/^\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}(\.\d+)?(z|[+-]\d{2}:\d{2})?$/.test(unescaped)) {
      return "timestamptz";
    }
    if (/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(unescaped)) return "time";
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(unescaped)) return "inet";
    if (
      (unescaped.startsWith("{") && unescaped.endsWith("}")) ||
      (unescaped.startsWith("[") && unescaped.endsWith("]"))
    ) {
      try {
        JSON.parse(unescaped);
        return "jsonb";
      } catch {
        // fall through
      }
    }
    if (unescaped.length === 1) return "bpchar";
    return "text";
  }
  return "text";
};

const inferTypeFromValueExpr = (expr: string, params: any[]): string => {
  const trimmed = expr.trim();
  if (!trimmed) return "text";
  const castMatch = trimmed.match(/::\s*([\w\[\]]+)/i);
  if (castMatch) {
    return normalizeTypeName(castMatch[1]);
  }
  const castFuncMatch = trimmed.match(/\bCAST\s*\([\s\S]+?\s+AS\s+([^)]+)\)/i);
  if (castFuncMatch) {
    return normalizeTypeName(castFuncMatch[1]);
  }
  if (/^\$\d+$/.test(trimmed)) {
    const idx = Number(trimmed.slice(1)) - 1;
    return inferTypeFromValue(params[idx]);
  }
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(1, -1).trim();
    const parts = splitTopLevel(inner);
    if (parts.length > 0) {
      return inferTypeFromValueExpr(parts[0], params);
    }
  }
  if (/^(now\(\)|current_timestamp|current_date)$/i.test(trimmed)) {
    return inferTypeFromLiteral(trimmed);
  }
  return inferTypeFromLiteral(trimmed);
};

const inferTypeForComparison = (
  operator: string,
  expr: string,
  params: any[],
): string => {
  if (operator === "IN") {
    const trimmed = expr.trim();
    if (/^\$\d+$/.test(trimmed)) {
      const idx = Number(trimmed.slice(1)) - 1;
      const value = params[idx];
      if (Array.isArray(value)) {
        return inferScalarTypeFromArray(value);
      }
    }
  }
  return inferTypeFromValueExpr(expr, params);
};

const inferTypeFromColumnName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower === "id" || lower.endsWith("_id")) return "integer";
  if (lower.startsWith("is_") || lower.startsWith("has_")) return "boolean";
  if (lower.endsWith("_at") || lower.includes("date") || lower.includes("time")) return "timestamptz";
  if (lower.endsWith("_uuid")) return "uuid";
  if (lower.includes("email")) return "text";
  if (lower.includes("ip")) return "inet";
  return "text";
};

function mergeTypes(a: string, b: string): string {
  if (a === b) return a;
  if (a.endsWith("[]") || b.endsWith("[]")) return "jsonb";
  if (a === "jsonb" || b === "jsonb") return "jsonb";
  const stringTypes = new Set(["text", "varchar", "bpchar"]);
  const numericTypes = new Set(["integer", "bigint", "numeric"]);
  const timeTypes = new Set(["timestamp", "timestamptz", "date", "time"]);

  if (stringTypes.has(a) && stringTypes.has(b)) return "text";
  if (numericTypes.has(a) && numericTypes.has(b)) return "numeric";
  if (timeTypes.has(a) && timeTypes.has(b)) return "timestamptz";
  if (stringTypes.has(a) || stringTypes.has(b)) return "text";
  return a;
}

const addColumnType = (
  map: Map<string, ColumnTypeInfo>,
  column: string,
  type: string,
  priority: number,
  fromWhere: boolean,
) => {
  if (!column) return;
  const current = map.get(column);
  if (!current) {
    map.set(column, { type, priority, fromWhere });
    return;
  }
  const mergedWhere = current.fromWhere || fromWhere;
  if (priority > current.priority) {
    map.set(column, { type, priority, fromWhere: mergedWhere });
    return;
  }
  if (priority === current.priority) {
    map.set(column, { type: mergeTypes(current.type, type), priority, fromWhere: mergedWhere });
  } else if (mergedWhere !== current.fromWhere) {
    map.set(column, { ...current, fromWhere: mergedWhere });
  }
};

const extractSelectColumns = (statement: string): string[] => {
  const match = statement.match(/\bSELECT\b\s+([\s\S]+?)\bFROM\b/i);
  if (!match) return [];
  let list = match[1].trim();
  list = list.replace(/^distinct\s+on\s*\([^)]+\)\s*/i, "");
  list = list.replace(/^distinct\s+/i, "");
  const items = splitTopLevel(list);
  const columns: string[] = [];

  for (const item of items) {
    let expr = item.trim();
    if (!expr || expr === "*") continue;
    if (expr.endsWith(".*")) continue;
    expr = expr.replace(/\s+as\s+.+$/i, "");
    if (/\s+/.test(expr)) {
      expr = expr.split(/\s+/)[0];
    }
    expr = expr.replace(/::\s*[\w[\]]+$/i, "");
    const simpleMatch = expr.match(/^(?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?$/);
    if (!simpleMatch) continue;
    const name = normalizeIdentifier(expr);
    if (!name || name === "*") continue;
    columns.push(name);
  }

  return columns;
};

const extractWhereClause = (statement: string): string | null => {
  const match = statement.match(
    /\bWHERE\b\s+([\s\S]+?)(?=\bORDER\b|\bGROUP\b|\bLIMIT\b|\bRETURNING\b|$)/i,
  );
  return match ? match[1] : null;
};

const extractWhereComparisons = (
  clause: string,
): Array<{ column: string; value?: string; operator: string }> => {
  const results: Array<{ column: string; value?: string; operator: string }> = [];
  const regex =
    /((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*(=|<>|!=|<=|>=|<|>|\bLIKE\b|\bILIKE\b|\bIN\b|\bIS\b)\s*([^\s)]+|\([^)]*\))/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clause)) !== null) {
    const column = normalizeIdentifier(match[1]);
    const operator = match[2].toUpperCase();
    let value = match[3];
    if (operator === "IN" && value.startsWith("(") && value.endsWith(")")) {
      const inner = value.slice(1, -1);
      const parts = splitTopLevel(inner);
      value = parts[0] ?? "";
    }
    results.push({ column, value, operator });
  }
  return results;
};

const extractSetAssignments = (statement: string): Array<{ column: string; value: string }> => {
  const match = statement.match(/\bSET\b\s+([\s\S]+?)(?=\bWHERE\b|\bRETURNING\b|$)/i);
  if (!match) return [];
  const clause = match[1];
  const parts = splitTopLevel(clause);
  const assignments: Array<{ column: string; value: string }> = [];
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const column = normalizeIdentifier(part.slice(0, idx));
    const value = part.slice(idx + 1).trim();
    if (!column || !value) continue;
    assignments.push({ column, value });
  }
  return assignments;
};

const extractInsertColumnsAndValues = (
  statement: string,
): Array<{ column: string; value: string }> => {
  const match = statement.match(
    /\bINSERT\b\s+INTO\b[\s\S]+?\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)/i,
  );
  if (!match) return [];
  const columns = splitTopLevel(match[1]);
  const values = splitTopLevel(match[2]);
  const result: Array<{ column: string; value: string }> = [];
  for (let i = 0; i < columns.length; i += 1) {
    const column = normalizeIdentifier(columns[i]);
    const value = values[i]?.trim();
    if (!column || !value) continue;
    result.push({ column, value });
  }
  return result;
};

const extractReturningColumns = (statement: string): string[] => {
  const match = statement.match(/\bRETURNING\b\s+([\s\S]+?)(?=\bINTO\b|$)/i);
  if (!match) return [];
  const items = splitTopLevel(match[1]);
  const columns: string[] = [];
  for (const item of items) {
    let expr = item.trim();
    if (!expr || expr === "*") continue;
    expr = expr.replace(/\s+as\s+.+$/i, "");
    if (/\s+/.test(expr)) {
      expr = expr.split(/\s+/)[0];
    }
    expr = expr.replace(/::\s*[\w[\]]+$/i, "");
    const simpleMatch = expr.match(/^(?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?$/);
    if (!simpleMatch) continue;
    const name = normalizeIdentifier(expr);
    if (!name || name === "*") continue;
    columns.push(name);
  }
  return columns;
};

const parseSchemaRequest = (
  sql: string,
  params: any[],
): { table: TableRef; columns: Map<string, ColumnTypeInfo> } | null => {
  const cleaned = stripSqlComments(sql).trim();
  if (!cleaned) return null;
  const statement = cleaned.split(";")[0]?.trim();
  if (!statement) return null;
  const opMatch = statement.match(/^(\w+)/);
  if (!opMatch) return null;
  const op = opMatch[1].toUpperCase();
  if (!["SELECT", "INSERT", "UPDATE", "DELETE"].includes(op)) return null;

  let tableToken: string | null = null;
  if (op === "SELECT") {
    const match = statement.match(/\bFROM\b\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/i);
    tableToken = match?.[1] ?? null;
  } else if (op === "UPDATE") {
    const match = statement.match(/\bUPDATE\b\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/i);
    tableToken = match?.[1] ?? null;
  } else if (op === "INSERT") {
    const match = statement.match(/\bINSERT\b\s+INTO\b\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/i);
    tableToken = match?.[1] ?? null;
  } else if (op === "DELETE") {
    const match = statement.match(/\bDELETE\b\s+FROM\b\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/i);
    tableToken = match?.[1] ?? null;
  }

  if (!tableToken) return null;
  const table = parseTableRef(tableToken);
  if (!table?.name) return null;

  const columns = new Map<string, ColumnTypeInfo>();

  if (op === "SELECT") {
    const selectColumns = extractSelectColumns(statement);
    for (const column of selectColumns) {
      addColumnType(columns, column, inferTypeFromColumnName(column), PRIORITY_SELECT, false);
    }
    const whereClause = extractWhereClause(statement);
    if (whereClause) {
      const comparisons = extractWhereComparisons(whereClause);
      for (const comparison of comparisons) {
        const type = comparison.value
          ? inferTypeForComparison(comparison.operator, comparison.value, params)
          : inferTypeFromColumnName(comparison.column);
        addColumnType(columns, comparison.column, type, PRIORITY_WHERE, true);
      }
    }
  }

  if (op === "UPDATE") {
    const assignments = extractSetAssignments(statement);
    for (const assignment of assignments) {
      const type = inferTypeFromValueExpr(assignment.value, params);
      addColumnType(columns, assignment.column, type, PRIORITY_ASSIGN, false);
    }
    const whereClause = extractWhereClause(statement);
    if (whereClause) {
      const comparisons = extractWhereComparisons(whereClause);
      for (const comparison of comparisons) {
        const type = comparison.value
          ? inferTypeForComparison(comparison.operator, comparison.value, params)
          : inferTypeFromColumnName(comparison.column);
        addColumnType(columns, comparison.column, type, PRIORITY_WHERE, true);
      }
    }
    const returningColumns = extractReturningColumns(statement);
    for (const column of returningColumns) {
      addColumnType(columns, column, inferTypeFromColumnName(column), PRIORITY_SELECT, false);
    }
  }

  if (op === "INSERT") {
    const inserts = extractInsertColumnsAndValues(statement);
    for (const insert of inserts) {
      const type = inferTypeFromValueExpr(insert.value, params);
      addColumnType(columns, insert.column, type, PRIORITY_ASSIGN, false);
    }
    const returningColumns = extractReturningColumns(statement);
    for (const column of returningColumns) {
      addColumnType(columns, column, inferTypeFromColumnName(column), PRIORITY_SELECT, false);
    }
  }

  if (op === "DELETE") {
    const whereClause = extractWhereClause(statement);
    if (whereClause) {
      const comparisons = extractWhereComparisons(whereClause);
      for (const comparison of comparisons) {
        const type = comparison.value
          ? inferTypeForComparison(comparison.operator, comparison.value, params)
          : inferTypeFromColumnName(comparison.column);
        addColumnType(columns, comparison.column, type, PRIORITY_WHERE, true);
      }
    }
    const returningColumns = extractReturningColumns(statement);
    for (const column of returningColumns) {
      addColumnType(columns, column, inferTypeFromColumnName(column), PRIORITY_SELECT, false);
    }
  }

  return { table, columns };
};

const ensureSchema = async (pool: Pool, sql: string, params: any[]) => {
  const schemaRequest = parseSchemaRequest(sql, params);
  if (!schemaRequest) return;

  const { table, columns } = schemaRequest;
  if (!table.name) return;

  if (table.schema && table.schema !== "public") {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(table.schema)}`);
  }

  const tableCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [table.schema, table.name],
  );
  const tableExists = tableCheck.rowCount > 0;

  const columnEntries = Array.from(columns.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    fromWhere: info.fromWhere,
  }));
  const fallbackColumns = [{ name: "id", type: "bigserial", fromWhere: false }];

  if (!tableExists) {
    const createColumns = columnEntries.length
      ? columnEntries
      : fallbackColumns;
    const columnSql = createColumns
      .map((col) => `${quoteIdent(col.name)} ${col.type}`)
      .join(", ");
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.schema)}.${quoteIdent(table.name)} (${columnSql})`,
    );
    logSchema(`created table ${table.schema}.${table.name}`);
  }

  const typeColumns = columnEntries.length ? columnEntries : (!tableExists ? fallbackColumns : []);
  if (columnEntries.length === 0 && typeColumns.length === 0) return;

  const existingColumnsRes = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [table.schema, table.name],
  );
  const existing = new Set<string>(existingColumnsRes.rows.map((row) => row.column_name));
  const missing = columnEntries.filter((col) => !existing.has(col.name));
  for (const col of missing) {
    await pool.query(
      `ALTER TABLE ${quoteIdent(table.schema)}.${quoteIdent(table.name)} ADD COLUMN IF NOT EXISTS ${quoteIdent(
        col.name,
      )} ${col.type}`,
    );
    logSchema(`added column ${table.schema}.${table.name}.${col.name} ${col.type}`);
  }

  if (AUTO_INDEX) {
    const indexColumns = columnEntries.filter((col) => col.fromWhere);
    for (const col of indexColumns) {
      const indexName = buildIndexName(table, col.name);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${quoteIdent(table.schema)}.${quoteIdent(
          table.name,
        )} (${quoteIdent(col.name)})`,
      );
      logSchema(`ensured index ${table.schema}.${table.name}.${col.name}`);
    }
  }

  if (typeColumns.length > 0) {
    await updateAutoTypes(table, typeColumns);
  }
};
export const RootDatabase = async (db: DatabaseName, text: string, params: any[] = []) => {
  await ensureDatabaseExists(db);
  const pool = getPool(db);
  if (AUTO_SCHEMA) {
    await ensureSchema(pool, text, params);
  }
  return params && params.length ? pool.query(text, params) : pool.query(text);
};

export const database = RootDatabase;
