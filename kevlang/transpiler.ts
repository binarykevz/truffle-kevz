import { tokenize, Token } from "./lexer";

export function transpile(source: string, filename: string = "unknown.kev", isInner: boolean = false): string {
    const tokens = tokenize(source);
    const out: string[] = [];
    let lineBuffer = "";
    let i = 0;

    if (!isInner) {
        out.push("// SYNTHESIZED from " + filename);
        out.push("");
    }

    function flushLine() {
        if (lineBuffer.trim()) {
            out.push(lineBuffer.trim());
            lineBuffer = "";
        }
    }

    while (i < tokens.length) {
        const t = tokens[i];

        if (t.type === "NEWLINE") {
            flushLine();
            i++;
            continue;
        }

        if (t.type === "BOND") {
            flushLine();
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

        if (t.type === "ATOM") {
            flushLine();
            const next = tokens[i + 1];
            const nextNext = tokens[i + 2];

            if (next?.type === "IDENT" && nextNext?.type === "MUT_ATOM") {
                i++;
                const name = tokens[i].value;
                i += 2;
                const expr = readUntilEOL(tokens, i);
                out.push("let " + name + " = " + expr + ";");
                i = skipPastEOL(tokens, i);
                continue;
            }

            if (next?.value === "{") {
                i++;
                const block = readBracedBlock(tokens, i);
                i = block.endIdx;
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++;
                    const expr = readUntilEOL(tokens, i);
                    out.push("let {" + rewriteInner(block.body) + "} = " + expr + ";");
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                out.push("const {" + rewriteInner(block.body) + "} = {};");
                continue;
            }

            if (next?.value === "[") {
                i++;
                const block = readBracketedBlock(tokens, i);
                i = block.endIdx;
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++;
                    const expr = readUntilEOL(tokens, i);
                    out.push("let [" + rewriteInner(block.body) + "] = " + expr + ";");
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                out.push("const [" + rewriteInner(block.body) + "] = [];");
                continue;
            }

            if (next?.type === "IDENT" && nextNext?.type === "OPERATOR" && nextNext.value === "=") {
                i++;
                const name = tokens[i].value;
                i += 2;
                const expr = readUntilEOL(tokens, i);
                out.push("const " + name + " = " + expr + ";");
                i = skipPastEOL(tokens, i);
                continue;
            }

            i++;
            continue;
        }

        if (t.type === "SOLUTION") {
            flushLine();
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;

            if (tokens[i]?.type === "MUT_ATOM") {
                i++;
                const expr = readUntilEOL(tokens, i);
                out.push("let " + name + " = " + expr + ";");
                i = skipPastEOL(tokens, i);
                continue;
            }

            if (tokens[i]?.type === "OPERATOR" && tokens[i].value === "=") {
                i++;
                const expr = readUntilEOL(tokens, i);
                out.push("const " + name + " = " + expr + ";");
                i = skipPastEOL(tokens, i);
                continue;
            }

            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push("const " + name + " = {" + rewriteInner(body) + "};");
            continue;
        }

        if (t.type === "DNA") {
            flushLine();
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;
            if (tokens[i]?.value === "[") {
                const block = readBracketedBlock(tokens, i);
                out.push("const " + name + " = [" + rewriteInner(block.body) + "];");
                i = block.endIdx;
            } else {
                out.push("const " + name + " = [];");
            }
            continue;
        }

        if (t.type === "REACTION") {
            const next = tokens[i + 1];

            if (!next || next.type === "NEWLINE" || next.type === "EOF") {
                i++;
                continue;
            }

            if (next?.type === "IDENT") {
                flushLine();
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

                out.push("async function " + name + "(" + params + ") {");
                const inner = rewriteInner(body);
                if (inner) out.push(inner);
                out.push("}");
                continue;
            }

            i++;
            continue;
        }

        if (t.type === "CYCLING") {
            flushLine();
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{" && tokens[i].type !== "NEWLINE") {
                    cond += emitToken(tokens[i]) + (needsSpace(tokens[i], tokens[i + 1]) ? " " : "");
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push("while (" + cond.trim() + ") {");
            const inner = rewriteInner(body);
            if (inner) out.push(inner);
            out.push("}");
            continue;
        }

        if (t.type === "EQUILIBRIUM") {
            flushLine();
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{" && tokens[i].type !== "NEWLINE") {
                    cond += emitToken(tokens[i]) + (needsSpace(tokens[i], tokens[i + 1]) ? " " : "");
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push("if (" + cond.trim() + ") {");
            const inner = rewriteInner(body);
            if (inner) out.push(inner);
            out.push("}");
            continue;
        }

        if (t.type === "MICROSCOPE") {
            flushLine();
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push("console.log(" + expr + ");");
            i = skipPastEOL(tokens, i);
            continue;
        }

        if (t.type === "ENERGY") {
            flushLine();
            i++;
            let event = "";
            while (i < tokens.length) {
                const tk = tokens[i];
                if (tk.type === "NEWLINE" || tk.type === "EOF") break;
                if (tk.type === "REACTION") break;
                if (tk.value === "{") break;
                if (tk.value === "=" && tokens[i+1] && tokens[i+1].value === ">") break;
                if (tk.type === "IDENT" && (tk.value === "async" || tk.value === "function")) break;
                event += tk.value;
                i++;
            }
            if (tokens[i] && tokens[i].type === "REACTION") i++;
            if (tokens[i] && tokens[i].value === "=" && tokens[i+1] && tokens[i+1].value === ">") { i += 2; }
            while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
            
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
                    if (!started && braceDepth === 0) {
                        break;
                    }
                    handler += "\n";
                    i++;
                    continue;
                }
                handler += emitToken(t2) + (needsSpace(t2, tokens[i + 1]) ? " " : "");
                i++;
            }
            out.push("bot.command(" + JSON.stringify(event.trim()) + ", " + handler.trim() + ");");
            continue;
        }

        if (t.type === "ACTIVATE") {
            lineBuffer += "await ";
            i++;
            continue;
        }

        if (t.type === "CATALYST") {
            flushLine();
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push("return " + expr + ";");
            i = skipPastEOL(tokens, i);
            continue;
        }

        if (t.type === "COMBUSTION") {
            flushLine();
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push("throw " + expr + ";");
            i = skipPastEOL(tokens, i);
            continue;
        }

        if (t.type === "SHIELD") {
            flushLine();
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
            out.push("try {");
            const tryInner = rewriteInner(tryBody);
            if (tryInner) out.push(tryInner);
            out.push("} catch (" + catchVar + ") {");
            const catchInner = rewriteInner(catchBody);
            if (catchInner) out.push(catchInner);
            out.push("}");
            continue;
        }

        if (t.type === "VOID") {
            lineBuffer += "null ";
            i++;
            continue;
        }

        if (t.type === "SOLVENT") {
            lineBuffer += "ctx ";
            i++;
            continue;
        }

        if (t.type === "IDENT" && t.value === "export") {
            lineBuffer += "export ";
            i++;
            continue;
        }

        if (t.type === "MUT_ATOM") {
            lineBuffer += "= ";
            i++;
            continue;
        }

        if (t.type === "REACTION") {
            i++;
            continue;
        }

        lineBuffer += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }

    flushLine();
    return out.filter(line => line.trim() !== "").join("\n");
}

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
    if (a.value === "." || b.value === ".") return false;
    if (a.value === "?" || b.value === "?") return false;
    if (a.value === "!" || b.value === "!") return false;
    const noSpace = "(){}[],.;:";
    if (a.type === "PUNCT" && noSpace.includes(a.value)) return false;
    if (b.type === "PUNCT" && noSpace.includes(b.value)) return false;
    if (a.type === "OPERATOR" && noSpace.includes(a.value)) return false;
    if (b.type === "OPERATOR" && noSpace.includes(b.value)) return false;
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
