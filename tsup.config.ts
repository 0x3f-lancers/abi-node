import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  minify: true,
  shims: true,
  async onSuccess() {
    // Add shebang to CLI entry
    const fs = await import("fs");
    const cliPath = "./dist/cli.js";
    const content = fs.readFileSync(cliPath, "utf-8");
    if (!content.startsWith("#!/usr/bin/env node")) {
      fs.writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
    }
  },
});
