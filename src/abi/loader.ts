import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Abi } from "viem";

export interface AbiFile {
  name: string;
  abi: Abi;
}

export async function loadAbisFromDirectory(dirPath: string): Promise<AbiFile[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const abiFiles: AbiFile[] = [];

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
      : (parsed as Record<string, unknown>)?.abi as Abi;

    if (!abi) {
      console.warn(`Skipping ${file}: no ABI found`);
      continue;
    }

    abiFiles.push({
      name: file.replace(".json", ""),
      abi,
    });
  }

  return abiFiles;
}
