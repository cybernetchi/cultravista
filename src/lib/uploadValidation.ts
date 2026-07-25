// Validation for user-provided 3D model files (PR8 direct upload).
// Splat exports from Scaniverse/Polycam/Luma/SuperSplat arrive as .ply or
// .splat with an empty or generic MIME type, so validation is extension +
// header based — never trust `file.type` for these.

/** The kinds of 3D model files a user can upload directly. */
export type ModelKind = "ply" | "splat";

/** Size cap for direct uploads. Typical exports are 30–200MB. */
export const MAX_MODEL_UPLOAD_BYTES = 300 * 1024 * 1024; // 300 MB

/** Byte stride of one gaussian in the antimatter15 .splat layout — the only
    splat format the viewer renders (see GaussianSplatViewer/splatEdit). */
const SPLAT_ROW_BYTES = 32;

// Single shape (not a discriminated union) to match the codebase's result
// style — the project compiles with strict:false, where union narrowing
// via `!result.ok` doesn't apply.
export interface ModelValidationResult {
  ok: boolean;
  kind?: ModelKind;
  error?: string;
}

/** Human-readable file size, e.g. "156.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = u;
  }
  return `${value.toFixed(1)} ${unit}`;
}

/**
 * Validate a user-picked file as an uploadable 3D model.
 * Checks extension, size bounds, and a cheap format sniff:
 *  - .ply must start with the ASCII magic "ply" + whitespace/newline
 *  - .splat must be a whole number of 32-byte gaussian rows
 */
export async function validateModelFile(file: File): Promise<ModelValidationResult> {
  const name = file.name.toLowerCase();
  const kind: ModelKind | null = name.endsWith(".ply")
    ? "ply"
    : name.endsWith(".splat")
      ? "splat"
      : null;

  if (!kind) {
    return { ok: false, error: "Unsupported file type — upload a .ply or .splat file." };
  }
  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes)." };
  }
  if (file.size > MAX_MODEL_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_MODEL_UPLOAD_BYTES)}.`,
    };
  }

  if (kind === "ply") {
    // PLY files (ASCII and binary alike) start with the magic line "ply\n".
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const isPly =
      head.length === 4 &&
      head[0] === 0x70 && // p
      head[1] === 0x6c && // l
      head[2] === 0x79 && // y
      (head[3] === 0x0a || head[3] === 0x0d || head[3] === 0x20 || head[3] === 0x09);
    if (!isPly) {
      return { ok: false, error: "This doesn't look like a PLY file (missing 'ply' header)." };
    }
  } else if (file.size % SPLAT_ROW_BYTES !== 0) {
    return {
      ok: false,
      error: "This doesn't look like a supported .splat file (unexpected size).",
    };
  }

  return { ok: true, kind };
}
