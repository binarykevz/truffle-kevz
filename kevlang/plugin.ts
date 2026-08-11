// kevlang/plugin.ts
// Bun plugin that transpiles .kev files to TypeScript on the fly.
// Registered via bunfig.toml so it loads automatically.

import { plugin } from "bun";
import { transpile } from "./transpiler";
import { readFileSync } from "fs";
import { basename } from "path";

plugin({
    name: "KevLang Loader",
    setup(build) {
        // Intercept all .kev file imports
        build.onLoad({ filter: /\.kev$/ }, (args) => {
            try {
                const source = readFileSync(args.path, "utf-8");
                const filename = basename(args.path);

                // Transpile .kev → TypeScript
                const ts = transpile(source, filename);

                // Log synthesis for visibility
                console.log(`🧪 [KevLang] Synthesized ${filename} (${source.length} → ${ts.length} chars)`);

                // Return transpiled TypeScript to Bun
                return {
                    contents: ts,
                    loader: "ts",
                };
            } catch (err: any) {
                console.error(`❌ [KevLang] Failed to synthesize ${args.path}: ${err.message}`);
                throw err;
            }
        });
    },
});