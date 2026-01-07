import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Abi } from "viem";

export interface AbiFile {
  name: string;
  abi: Abi;
}

/**
 * Convert JavaScript object notation to JSON
 * Handles: { key: value } -> { "key": value }
 */
function jsToJson(content: string): string {
  return (
    content
      // Remove single-line comments (// ...)
      .replace(/\/\/[^\n]*/g, "")
      // Remove multi-line comments (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Add quotes around unquoted keys (word characters followed by colon)
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      // Handle trailing commas (invalid in JSON)
      .replace(/,\s*([}\]])/g, "$1")
  );
}

/**
 * Extract the complete array by counting brackets
 */
function extractArray(content: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    // Handle string boundaries
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Count brackets only outside strings
    if (!inString) {
      if (char === "[") depth++;
      if (char === "]") {
        depth--;
        if (depth === 0) {
          return content.slice(startIndex, i + 1);
        }
      }
    }
    i++;
  }
  return null;
}

/**
 * Parse a TypeScript file that exports an ABI in ts format:
 * export const abi = [...] as const
 */
function parseTsAbi(content: string, fileName: string): AbiFile | null {
  // Find export const <name> = [
  const exportMatch = content.match(/export\s+const\s+(\w+)\s*=\s*\[/);
  if (!exportMatch) {
    return null;
  }

  const exportName = exportMatch[1];
  const arrayStartIndex = exportMatch.index! + exportMatch[0].length - 1; // Position of '['

  // Extract the complete array using bracket counting
  const arrayContent = extractArray(content, arrayStartIndex);
  if (!arrayContent) {
    return null;
  }

  // Convert JS object notation to JSON
  const jsonContent = jsToJson(arrayContent);

  try {
    const abi = JSON.parse(jsonContent) as Abi;

    // Derive contract name from export (e.g., stakingAbi -> Staking)
    const name = exportName
      .replace(/Abi$/i, "") // Remove Abi suffix
      .replace(/^./, (c) => c.toUpperCase()); // Capitalize first letter

    // If name is empty (export was just 'abi'), use capitalized filename
    const finalName = name || fileName.replace(/^./, (c) => c.toUpperCase());
    return { name: finalName, abi };
  } catch {
    return null;
  }
}

export async function loadAbisFromDirectory(
  dirPath: string
): Promise<AbiFile[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const tsFiles = files.filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".d.ts")
  );

  const abiFiles: AbiFile[] = [];

  // Load JSON files
  for (const file of jsonFiles) {
    const filePath = join(dirPath, file);
    const content = await readFile(filePath, "utf-8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`Skipping ${file}: invalid JSON`);
      continue;
    }

    // Handle both raw ABI arrays and objects with "abi" property (Hardhat/Foundry artifacts)
    const abi: Abi = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>)?.abi as Abi);

    if (!abi) {
      console.warn(`Skipping ${file}: no ABI found`);
      continue;
    }

    abiFiles.push({
      name: file.replace(".json", ""),
      abi,
    });
  }

  // Load TypeScript files (viem format)
  for (const file of tsFiles) {
    const filePath = join(dirPath, file);
    const content = await readFile(filePath, "utf-8");

    const result = parseTsAbi(content, file.replace(".ts", ""));
    if (result) {
      abiFiles.push(result);
    } else {
      console.warn(`Skipping ${file}: no ABI export found`);
    }
  }

  return abiFiles;
}
