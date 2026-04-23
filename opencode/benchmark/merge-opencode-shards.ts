#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs"
import path from "path"

const root = path.resolve(import.meta.dir, "../outputs/benchmarks")
const suf = ["115Z", "124Z", "135Z", "158Z", "159Z"]
const out: { suite: string }[] = []
for (const s of suf) {
  const p = path.join(root, `2026-04-06T21-44-09-${s}`, "results.json")
  const j = JSON.parse(readFileSync(p, "utf8")) as { suite: string }[]
  out.push(...j.filter((r) => r.suite === "opencode"))
}
const outPath = path.join(root, "merged-opencode-bench50.json")
writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(outPath, out.length)
