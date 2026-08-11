import { glob } from "glob";
import { transpile } from "./transpiler";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join, basename } from "path";

const SRC_DIR = "./src";
const OUT_DIR = "./src/generated";

async function compileAll() {
    await mkdir(OUT_DIR, { recursive: true });

    const files = await new Promise<string[]>((resolve, reject) => {
        glob(`${SRC_DIR}/*.kev`, (err, matches) => err ? reject(err) : resolve(matches || []));
    });

    console.log(`🧪 KevLang: synthesizing ${files.length} molecular recipe(s)...`);

    for (const file of files) {
        const source = await readFile(file, "utf-8");
        const outName = basename(file, ".kev") + ".ts";
        const outPath = join(OUT_DIR, outName);

        try {
            const ts = transpile(source, basename(file));
            await writeFile(outPath, ts, "utf-8");
            console.log(`  ⚗ ${basename(file)} → ${outName}`);
        } catch (err: any) {
            console.error(`  ❌ ${basename(file)} failed: ${err.message}`);
            process.exit(1);
        }
    }

    console.log("✅ All recipes synthesized successfully.\n");
}

compileAll().catch((e) => {
    console.error("KevLang compilation failed:", e);
    process.exit(1);
});
