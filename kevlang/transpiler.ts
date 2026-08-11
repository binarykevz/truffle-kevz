import { tokenize, Token } from "./lexer";

export function transpile(source: string, filename: string = "unknown.kev", isInner: boolean = false): string {
    const tokens = tokenize(source);
    const out: string[] = [];
    let i = 0;

    if (!isInner) {
        out.push(`// ⚗ SYNTHESIZED from ${filename} — do not edit by hand`);
        out.push(`// 🧪 Generated at ${new Date().toISOString()}`);
        out.push("");
    }

    while (i < tokens.length) {
        const t = tokens[i];

        // --- Skip NEWLINEs at top level ---
        if (t.type === "NEWLINE") {
            i++;
            continue;
        }

        // --- Import (Bond): 🧲 { A, B } ⬅ "path" ---
        if (t.type === "BOND") {
            i++;
            const parts: string[] = ["import"];
            while (i < tokens.length && tokens[i].type !== "ABSORB" && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                parts.push(tokens[i].value);
                i++;
            }
            if (tokens[i]?.type === "ABSORB") {
                parts.push("from");
                i++;
                while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                    parts.push(tokens[i].value);
                    i++;
                }
            }
            out.push(parts.join(" ") + ";");
            continue;
        }

        // --- Atom: ⚛ ---
        if (t.type === "ATOM") {
            const next = tokens[i + 1];
            const nextNext = tokens[i + 2];

            // ⚛ IDENT ← expr  →  let name = expr
            if (next?.type === "IDENT" && nextNext?.type === "MUT_ATOM") {
                i++;
                const name = tokens[i].value;
                i += 2;
                const expr = readUntilEOL(tokens, i);
                out.push(`let ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            // ⚛ { ... } ← expr  →  let { ... } = expr
            if (next?.value === "{") {
                i++;
                const block = readBracedBlock(tokens, i);
                i = block.endIdx;
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++;
                    const expr = readUntilEOL(tokens, i);
                    out.push(`let {${rewriteInner(block.body)}} = ${expr};`);
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                out.push(`const {${rewriteInner(block.body)}} = {};`);
                continue;
            }

            // ⚛ [ ... ] ← expr  →  let [ ... ] = expr
            if (next?.value === "[") {
                i++;
                const block = readBracketedBlock(tokens, i);
                i = block.endIdx;
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++;
                    const expr = readUntilEOL(tokens, i);
                    out.push(`let [${rewriteInner(block.body)}] = ${expr};`);
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                out.push(`const [${rewriteInner(block.body)}] = [];`);
                continue;
            }

            // ⚛ IDENT = expr  →  const name = expr
            if (next?.type === "IDENT" && nextNext?.type === "OPERATOR" && nextNext.value === "=") {
                i++;
                const name = tokens[i].value;
                i += 2;
                const expr = readUntilEOL(tokens, i);
                out.push(`const ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            // Fallback: skip ⚛
            i++;
            continue;
        }

        // --- Solution: ⚗ ---
        if (t.type === "SOLUTION") {
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;

            if (tokens[i]?.type === "MUT_ATOM") {
                i++;
                const expr = readUntilEOL(tokens, i);
                out.push(`let ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            if (tokens[i]?.type === "OPERATOR" && tokens[i].value === "=") {
                i++;
                const expr = readUntilEOL(tokens, i);
                out.push(`const ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`const ${name} = {${rewriteInner(body)}};`);
            continue;
        }

        // --- DNA: 🧬 ---
        if (t.type === "DNA") {
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;
            if (tokens[i]?.value === "[") {
                const block = readBracketedBlock(tokens, i);
                out.push(`const ${name} = [${rewriteInner(block.body)}];`);
                i = block.endIdx;
            } else {
                out.push(`const ${name} = [];`);
            }
            continue;
        }

        // --- Reaction: → ---
        if (t.type === "REACTION") {
            const next = tokens[i + 1];

            // Skip → at end of line
            if (!next || next.type === "NEWLINE" || next.type === "EOF") {
                i++;
                continue;
            }

            // → name(params) { body }
            if (next?.type === "IDENT") {
                i++;
                const name = tokens[i].value;
                i++;

                let params = "";
                if (tokens[i]?.value === "(") {
                    const block = readParenBlock(tokens, i);
                    params = rewriteInner(block.body);
                    i = block.endIdx;
                }

                let body = "";
                if (tokens[i]?.value === "{") {
                    const block = readBracedBlock(tokens, i);
                    body = block.body;
                    i = block.endIdx;
                }

                out.push(`async function ${name}(${params}) {`);
                out.push(rewriteInner(body));
                out.push(`}`);
                continue;
            }

            // Fallback: skip →
            i++;
            continue;
        }

        // --- Cycling: ⇌⥀ ---
        if (t.type === "CYCLING") {
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{" && tokens[i].type !== "NEWLINE") {
                    cond += emitToken(tokens[i]) + " ";
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`while (${cond.trim()}) {`);
            out.push(rewriteInner(body));
            out.push(`}`);
            continue;
        }

        // --- Equilibrium: ⇌ ---
        if (t.type === "EQUILIBRIUM") {
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{" && tokens[i].type !== "NEWLINE") {
                    cond += emitToken(tokens[i]) + " ";
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`if (${cond.trim()}) {`);
            out.push(rewriteInner(body));
            out.push(`}`);
            continue;
        }

        // --- Microscope: 🔬 ---
        if (t.type === "MICROSCOPE") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`console.log(${expr});`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Energy: ⚡ ---
        if (t.type === "ENERGY") {
            i++;
            let event = "";
            while (i < tokens.length && tokens[i].type !== "REACTION" && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                event += tokens[i].value;
                i++;
            }
            if (tokens[i]?.type === "REACTION") i++;
            while (i < tokens.length && tokens[i].type === "NEWLINE") i++;

            // Read handler (could be multi-line)
            let handler = "";
            let braceDepth = 0;
            let started = false;
            while (i < tokens.length && tokens[i].type !== "EOF") {
                const t2 = tokens[i];
                if (t2.value === "{") { braceDepth++; started = true; }
                else if (t2.value === "}") {
                    braceDepth--;
                    if (started && braceDepth === 0) {
                        handler += emitToken(t2);
                        i++;
                        break;
                    }
                }
                if (t2.type === "NEWLINE") {
                    handler += "\n";
                    i++;
                    continue;
                }
                handler += emitToken(t2) + (needsSpace(t2, tokens[i + 1]) ? " " : "");
                i++;
            }

            out.push(`bot.command(${JSON.stringify(event.trim())}, ${handler.trim()});`);
            continue;
        }

        // --- Activate: ↯ ---
        if (t.type === "ACTIVATE") {
            out.push("await");
            i++;
            continue;
        }

        // --- Catalyst: ⟲ ---
        if (t.type === "CATALYST") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`return ${expr};`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Combustion: 🔥 ---
        if (t.type === "COMBUSTION") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`throw ${expr};`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Shield/Bandage: 🛡️ / 🩹 ---
        if (t.type === "SHIELD") {
            i++;
            let tryBody = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                tryBody = block.body;
                i = block.endIdx;
            }
            let catchVar = "e";
            let catchBody = "";
            while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
            if (tokens[i]?.type === "BANDAGE") {
                i++;
                if (tokens[i]?.value === "(") {
                    const p = readParenBlock(tokens, i);
                    catchVar = p.body.trim() || "e";
                    i = p.endIdx;
                }
                if (tokens[i]?.value === "{") {
                    const block = readBracedBlock(tokens, i);
                    catchBody = block.body;
                    i = block.endIdx;
                }
            }
            out.push(`try {`);
            out.push(rewriteInner(tryBody));
            out.push(`} catch (${catchVar}) {`);
            out.push(rewriteInner(catchBody));
            out.push(`}`);
            continue;
        }

        // --- Void: ∅ ---
        if (t.type === "VOID") {
            out.push("null");
            i++;
            continue;
        }

        // --- Solvent: H₂O ---
        if (t.type === "SOLVENT") {
            out.push("ctx");
            i++;
            continue;
        }

        // --- export ---
        if (t.type === "IDENT" && t.value === "export") {
            out.push("export");
            i++;
            continue;
        }

        // --- Safety net: stray ← ---
        if (t.type === "MUT_ATOM") {
            out.push("=");
            i++;
            continue;
        }

        // --- Safety net: stray → ---
        if (t.type === "REACTION") {
            i++;
            continue;
        }

        // --- Pass-through ---
        out.push(emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : ""));
        i++;
    }

    // Clean up empty lines
    return out.filter(line => line.trim() !== "").join("\n");
}

// ============================================================
// HELPERS
// ============================================================

function emitToken(t: Token): string {
    switch (t.type) {
        case "SOLVENT": return "ctx";
        case "VOID": return "null";
        case "ACTIVATE": return "await";
        case "CATALYST": return "return";
        case "COMBUSTION": return "throw";
        case "MUT_ATOM": return "=";
        case "REACTION": return "";
        case "ABSORB": return "from";
        default: return t.value;
    }
}

function needsSpace(a: Token, b: Token | undefined): boolean {
    if (!b) return false;
    if (a.type === "NEWLINE" || b.type === "NEWLINE") return false;
    if (a.type === "PUNCT" && /[(){}\[\],.;:]/.test(a.value)) return false;
    if (b.type === "PUNCT" && /[(){}\[\],.;:]/.test(b.value)) return false;
    return true;
}

function readUntilEOL(tokens: Token[], start: number): string {
    let out = "";
    let i = start;
    while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
        out += emitToken(tokens[i]) + (needsSpace(tokens[i], tokens[i + 1]) ? " " : "");
        i++;
    }
    return out.trim();
}

function skipPastEOL(tokens: Token[], start: number): number {
    let i = start;
    while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") i++;
    if (tokens[i]?.type === "NEWLINE") i++;
    return i;
}

// Params: SKIP newlines
function readParenBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "(") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.type === "NEWLINE") { i++; continue; }
        if (t.value === "(") depth++;
        else if (t.value === ")") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body: body.trim(), endIdx: i };
}

// Bodies: PRESERVE newlines
function readBracedBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "{") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "{") depth++;
        else if (t.value === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        if (t.type === "NEWLINE") {
            body += "\n";
            i++;
            continue;
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body: body.trim(), endIdx: i };
}

// Arrays: SKIP newlines
function readBracketedBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "[") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.type === "NEWLINE") { i++; continue; }
        if (t.value === "[") depth++;
        else if (t.value === "]") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body: body.trim(), endIdx: i };
}

function rewriteInner(body: string): string {
    if (!body || body.trim() === "") return "";
    return transpile(body, "inner", true);
}
