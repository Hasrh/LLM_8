import path from "path"
import z from "zod"
import { analyze } from "./analyze"
import { Filesystem } from "@/util/filesystem"
import { DEFAULT_CONTROLS_PATH, DEFAULT_TOPK, DEFAULT_VECTOR_COLLECTION, type SecurityVector } from "./schema"

export const RAW_GPT_MODEL = "openrouter/openai/gpt-5.4-mini"

const Suite = z.enum(["gpt", "opencode", "rag"])
type Suite = z.infer<typeof Suite>

export const SecurityBenchmarkInput = z.object({
  path: z.array(z.string()).optional(),
  list: z.string().optional(),
  suite: z.array(Suite).default(["gpt", "opencode", "rag"]),
  out: z.string().default("outputs/benchmarks"),
  prompt: z.string().optional(),
  controls: z.string().default(DEFAULT_CONTROLS_PATH),
  topk: z.number().int().positive().default(DEFAULT_TOPK),
  vector: z.enum(["pinecone", "qdrant", "lexical"]).optional(),
  collection: z.string().default(DEFAULT_VECTOR_COLLECTION),
  namespace: z.string().optional(),
  maxchars: z.number().int().positive().optional(),
  model: z.string().optional(),
  agent: z.string().optional(),
  gptModel: z.string().default(RAW_GPT_MODEL),
  failfast: z.boolean().default(false),
})
export type SecurityBenchmarkInput = z.infer<typeof SecurityBenchmarkInput>
export type SecurityBenchmarkInputRaw = z.input<typeof SecurityBenchmarkInput>

export type SecurityBenchmarkRow = {
  suite: Suite
  target: string
  ok: boolean
  run_dir?: string
  score?: number
  passed?: boolean
  provider_id?: string
  model_id?: string
  error?: string
}

export type SecurityBenchmarkResult = {
  dir: string
  rows: SecurityBenchmarkRow[]
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function parse(text: string) {
  return text
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .filter((x) => !x.startsWith("#"))
}

async function targets(input: SecurityBenchmarkInput) {
  const file = input.list ? path.resolve(input.list) : undefined
  const fromFile = file ? parse(await Filesystem.readText(file)) : []
  const all = [...(input.path ?? []), ...fromFile].map((x) => path.resolve(x))
  const uniq = Array.from(new Set(all))
  if (uniq.length === 0) throw new Error("Provide at least one target via --path or --list.")
  for (const item of uniq) {
    if (await Filesystem.exists(item)) continue
    throw new Error(`Target not found: ${item}`)
  }
  return uniq
}

function avg(rows: SecurityBenchmarkRow[]) {
  const vals = rows.map((x) => x.score).filter((x): x is number => typeof x === "number")
  if (vals.length === 0) return null
  return vals.reduce((sum, x) => sum + x, 0) / vals.length
}

function md(rows: SecurityBenchmarkRow[]) {
  const head = [
    "# Benchmark Summary",
    "",
    "## Per-run results",
    "",
    "| Suite | Target | Status | Score | Passed | Provider | Model | Run Dir |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- |",
  ]
  const body = rows.map((x) => {
    const status = x.ok ? "ok" : "error"
    const score = typeof x.score === "number" ? x.score.toFixed(2) : "-"
    const pass = typeof x.passed === "boolean" ? (x.passed ? "yes" : "no") : "-"
    const provider = x.provider_id ?? "-"
    const model = x.model_id ?? "-"
    const run = x.run_dir ?? x.error ?? "-"
    return `| ${x.suite} | ${x.target} | ${status} | ${score} | ${pass} | ${provider} | ${model} | ${run} |`
  })
  const suites = Array.from(new Set(rows.map((x) => x.suite)))
  const stats = suites.map((suite) => {
    const set = rows.filter((x) => x.suite === suite)
    const ok = set.filter((x) => x.ok).length
    const pass = set.filter((x) => x.passed === true).length
    const score = avg(set)
    const val = score === null ? "-" : score.toFixed(2)
    return `- ${suite}: ${ok}/${set.length} completed, ${pass} passed verification, mean score=${val}`
  })
  return [...head, ...body, "", "## Aggregate stats", "", ...stats, ""].join("\n")
}

async function run(input: {
  suite: Suite
  target: string
  out: string
  cfg: SecurityBenchmarkInput
  vector?: SecurityVector
}) {
  const suite = input.suite
  const base = {
    path: input.target,
    out: input.out,
    prompt: input.cfg.prompt,
    maxchars: input.cfg.maxchars,
  }
  if (suite === "gpt") {
    return analyze({
      ...base,
      mode: "direct",
      model: input.cfg.gptModel,
      topk: input.cfg.topk,
    })
  }
  if (suite === "opencode") {
    return analyze({
      ...base,
      mode: "baseline",
      model: input.cfg.model,
      agent: input.cfg.agent,
      topk: input.cfg.topk,
    })
  }
  return analyze({
    ...base,
    mode: "rag",
    model: input.cfg.model,
    agent: input.cfg.agent,
    controls: input.cfg.controls,
    topk: input.cfg.topk,
    vector: input.vector,
    collection: input.cfg.collection,
    namespace: input.cfg.namespace,
  })
}

export async function benchmark(raw: SecurityBenchmarkInputRaw): Promise<SecurityBenchmarkResult> {
  const input = SecurityBenchmarkInput.parse(raw)
  const dirs = await targets(input)
  const out = path.resolve(input.out, stamp())
  const suites = Array.from(new Set(input.suite))
  if (suites.includes("gpt") && !process.env.OPENROUTER_API_KEY) {
    throw new Error("GPT suite requires OPENROUTER_API_KEY.")
  }
  const rows: SecurityBenchmarkRow[] = []
  for (const target of dirs) {
    for (const suite of suites) {
      const item = await run({
        suite,
        target,
        out,
        cfg: input,
        vector: input.vector,
      })
        .then((result) => {
          const meta = result.metadata as Record<string, unknown>
          return {
            suite,
            target,
            ok: true,
            run_dir: result.run_dir,
            score: result.verification.score,
            passed: result.verification.passed,
            provider_id: typeof meta["provider_id"] === "string" ? meta["provider_id"] : undefined,
            model_id: typeof meta["model_id"] === "string" ? meta["model_id"] : undefined,
          } satisfies SecurityBenchmarkRow
        })
        .catch((err) => ({
          suite,
          target,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      rows.push(item)
      if (item.ok || !input.failfast) continue
      throw new Error(item.error ?? "benchmark failed")
    }
  }
  await Filesystem.writeJson(path.join(out, "results.json"), rows)
  await Filesystem.write(path.join(out, "summary.md"), md(rows))
  return { dir: out, rows }
}
