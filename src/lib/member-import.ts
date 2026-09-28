import Papa from "papaparse";
import { strFromU8, unzipSync } from "fflate";
import { readSheet } from "read-excel-file/browser";

export const MEMBER_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const MEMBER_IMPORT_MAX_ROWS = 1_000;
const MEMBER_IMPORT_MAX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MEMBER_IMPORT_MAX_ZIP_ENTRIES = 512;

export type MemberImportFormat = "csv" | "xlsx";

type ParsedNumberCell = { kind: "number"; raw: string };
type ImportCell = string | ParsedNumberCell | boolean | Date | null;

export type MemberImportRow = {
  display_name: string;
  title: string;
  email: string;
  phone: string;
  role: string;
  notification_consent_raw: string;
  source_key: string;
  source_kind: "csv_import" | "xlsx_import";
  source_row: number;
  cell_issue: "ambiguous_phone" | "ambiguous_value" | null;
};

export class MemberImportFileError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MemberImportFileError";
  }
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function normalizedHeader(value: ImportCell): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function isNumericCell(value: ImportCell): value is ParsedNumberCell {
  return !!value && typeof value === "object" && !(value instanceof Date) && "kind" in value;
}

function textCell(value: ImportCell): { value: string; ambiguous: boolean } {
  if (value === null || value === undefined) return { value: "", ambiguous: false };
  if (typeof value === "string") return { value: value.trim(), ambiguous: false };
  if (typeof value === "boolean") return { value: value ? "true" : "false", ambiguous: false };
  if (isNumericCell(value)) return { value: value.raw, ambiguous: true };
  return { value: "", ambiguous: true };
}

function assertSafeXlsx(bytes: Uint8Array): void {
  let expandedBytes = 0;
  let entryCount = 0;
  let macroFound = false;

  const files = unzipSync(bytes, {
    filter(file) {
      entryCount += 1;
      expandedBytes += file.originalSize;
      const name = file.name.toLowerCase();
      if (
        name.endsWith("vbaproject.bin") ||
        name.includes("/macrosheets/") ||
        name.includes("/xlm/")
      ) {
        macroFound = true;
      }
      if (
        entryCount > MEMBER_IMPORT_MAX_ZIP_ENTRIES ||
        expandedBytes > MEMBER_IMPORT_MAX_EXPANDED_BYTES
      ) {
        throw new MemberImportFileError("expanded_file_too_large");
      }
      return /^xl\/worksheets\/sheet\d+\.xml$/i.test(file.name);
    },
  });

  if (macroFound) throw new MemberImportFileError("macros_not_allowed");
  for (const worksheet of Object.values(files)) {
    const xml = strFromU8(worksheet);
    if (/<f(?:\s|>)/i.test(xml)) {
      throw new MemberImportFileError("formulas_not_allowed");
    }
  }
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toRows(
  matrix: ImportCell[][],
  digest: string,
  format: MemberImportFormat,
): MemberImportRow[] {
  if (matrix.length === 0) throw new MemberImportFileError("empty_file");
  const header = matrix[0].map(normalizedHeader);
  const displayNameIndex = header.indexOf("display_name") >= 0
    ? header.indexOf("display_name")
    : header.indexOf("name");
  if (displayNameIndex < 0) throw new MemberImportFileError("missing_name_column");

  const index = (name: string) => header.indexOf(name);
  const titleIndex = index("title");
  const emailIndex = index("email");
  const phoneIndex = index("phone");
  const roleIndex = index("role");
  const consentIndex = index("notification_consent");

  const nonEmptyRows = matrix.slice(1).filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));
  if (nonEmptyRows.length > MEMBER_IMPORT_MAX_ROWS) {
    throw new MemberImportFileError("too_many_rows");
  }

  return nonEmptyRows.map((row, offset) => {
    const get = (column: number): ImportCell => column >= 0 ? (row[column] ?? null) : null;
    const displayName = textCell(get(displayNameIndex));
    const title = textCell(get(titleIndex));
    const email = textCell(get(emailIndex));
    const phoneCell = get(phoneIndex);
    const phone = textCell(phoneCell);
    const role = textCell(get(roleIndex));
    const consent = textCell(get(consentIndex));
    const anyAmbiguous = displayName.ambiguous || title.ambiguous || email.ambiguous || role.ambiguous;

    return {
      display_name: displayName.value,
      title: title.value,
      email: email.value,
      // Keep textual phone input exactly apart from surrounding whitespace.
      // Numeric spreadsheet cells are never guessed back into a phone number.
      phone: phone.value,
      role: role.value || "member",
      notification_consent_raw: consent.value || "false",
      source_key: `${digest}:${offset + 2}`,
      source_kind: format === "xlsx" ? "xlsx_import" : "csv_import",
      source_row: offset + 2,
      cell_issue: isNumericCell(phoneCell)
        ? "ambiguous_phone"
        : anyAmbiguous || phoneCell instanceof Date
          ? "ambiguous_value"
          : null,
    };
  });
}

export async function readMemberImportFile(file: File): Promise<{
  format: MemberImportFormat;
  rows: MemberImportRow[];
}> {
  if (file.size === 0) throw new MemberImportFileError("empty_file");
  if (file.size > MEMBER_IMPORT_MAX_BYTES) throw new MemberImportFileError("file_too_large");

  const ext = extension(file.name);
  if (ext !== ".csv" && ext !== ".xlsx") {
    throw new MemberImportFileError("unsupported_format");
  }

  const buffer = await file.arrayBuffer();
  const digest = await sha256(buffer);

  if (ext === ".xlsx") {
    assertSafeXlsx(new Uint8Array(buffer));
    const matrix = await readSheet<ParsedNumberCell>(buffer, {
      trim: true,
      parseNumber(raw) {
        return { kind: "number", raw };
      },
    });
    return { format: "xlsx", rows: toRows(matrix as ImportCell[][], digest, "xlsx") };
  }

  const parsed = Papa.parse<string[]>(new TextDecoder().decode(buffer), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0) throw new MemberImportFileError("malformed_csv");
  return {
    format: "csv",
    rows: toRows(parsed.data as ImportCell[][], digest, "csv"),
  };
}
