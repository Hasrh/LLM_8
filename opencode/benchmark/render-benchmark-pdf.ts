#!/usr/bin/env bun
/**
 * OpenCode benchmark PDF: configurations listed ① OpenCode+RAG ② GPT direct ③ OpenCode baseline.
 * Expanded technical report; Figure 3 = shared-four checks; flex layout for wkhtmltopdf.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "fs"
import path from "path"
import { spawnSync } from "child_process"

type Row = {
  suite: string
  target: string
  ok: boolean
  run_dir?: string
  score?: number
  passed?: boolean
  provider_id?: string
  model_id?: string
  error?: string
}

type Check = { name: string; passed: boolean; detail: string }
type Ver = { checks: Check[]; passed: boolean; score: number }

const SHARED = [
  "structural-completeness",
  "evidence-grounding",
  "consistency",
  "empty-generic-detection",
] as const

const MATRIX_ROWS = [
  "structural-completeness",
  "evidence-grounding",
  "consistency",
  "empty-generic-detection",
  "control-grounding",
] as const

const MAX_CHARS_CAP = 120_000

function esc(t: string) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdev(xs: number[], m: number) {
  if (xs.length < 2) return 0
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

function median(xs: number[]) {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.floor(s.length / 2)
  return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo)
}

function pctileReport(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return {
    p10: percentile(s, 10),
    p25: percentile(s, 25),
    p50: percentile(s, 50),
    p75: percentile(s, 75),
    p90: percentile(s, 90),
  }
}

function sharedStats(rows: Row[]) {
  const vals: number[] = []
  let all4 = 0
  let n = 0
  for (const r of rows) {
    if (!r.ok || !r.run_dir) continue
    const p = path.join(r.run_dir, "verification.json")
    if (!existsSync(p)) continue
    const v = JSON.parse(readFileSync(p, "utf8")) as Ver
    let k = 0
    for (const name of SHARED) {
      const c = v.checks.find((x) => x.name === name)
      if (c?.passed) k++
    }
    vals.push(k / 4)
    if (k === 4) all4++
    n++
  }
  const m = mean(vals)
  return { n, m, med: median(vals), sd: stdev(vals, m), pr: n ? all4 / n : 0, passn: all4, vals }
}

function agg(rows: Row[]) {
  const out: Record<string, { pass: number; total: number }> = {}
  for (const r of rows) {
    if (!r.ok || !r.run_dir) continue
    const p = path.join(r.run_dir, "verification.json")
    if (!existsSync(p)) continue
    const v = JSON.parse(readFileSync(p, "utf8")) as Ver
    for (const c of v.checks) {
      if (!out[c.name]) out[c.name] = { pass: 0, total: 0 }
      out[c.name].total++
      if (c.passed) out[c.name].pass++
    }
  }
  return out
}

function pct(m: Record<string, { pass: number; total: number }>, name: string) {
  const x = m[name]
  if (!x || x.total === 0) return null
  return (100 * x.pass) / x.total
}

function hist(scores: number[]) {
  const bins = [
    { lo: 0, hi: 0.55, label: "0.00–0.55" },
    { lo: 0.55, hi: 0.65, label: "0.55–0.65" },
    { lo: 0.65, hi: 0.75, label: "0.65–0.75" },
    { lo: 0.75, hi: 0.85, label: "0.75–0.85" },
    { lo: 0.85, hi: 0.95, label: "0.85–0.95" },
    { lo: 0.95, hi: 1.01, label: "0.95–1.00" },
  ]
  return bins.map((b) => ({
    label: b.label,
    n: scores.filter((x) => x >= b.lo && x < b.hi).length,
  }))
}

function ingestAgg(rows: Row[]) {
  let files = 0
  let clipped = 0
  let bytes = 0
  let nb = 0
  let n = 0
  for (const r of rows) {
    if (!r.ok || !r.run_dir) continue
    const metaPath = path.join(r.run_dir, "metadata.json")
    const inputPath = path.join(r.run_dir, "input.txt")
    if (existsSync(metaPath)) {
      const m = JSON.parse(readFileSync(metaPath, "utf8")) as { files?: number; clipped?: boolean }
      if (typeof m.files === "number") {
        files += m.files
        n++
      }
      if (m.clipped === true) clipped++
    }
    if (existsSync(inputPath)) {
      bytes += statSync(inputPath).size
      nb++
    }
  }
  return {
    meanFiles: n ? files / n : 0,
    clippedRuns: clipped,
    nMeta: n,
    meanInputBytes: nb ? bytes / nb : 0,
    nBytes: nb,
  }
}

function htmlHist(title: string, bins: { label: string; n: number }[]) {
  const max = Math.max(1, ...bins.map((b) => b.n))
  const cols = bins
    .map((b) => {
      const h = Math.max(8, Math.round((b.n / max) * 160))
      return `<div class="hcol"><span class="hcnt">${b.n}</span><div class="hbar" style="height:${h}px"></div><span class="hlbl">${esc(b.label)}</span></div>`
    })
    .join("")
  return `<div class="chart-wrap"><div class="chart-title">${esc(title)}</div><div class="chart-hist">${cols}</div></div>`
}

function htmlChecks(title: string, aggmap: Record<string, { pass: number; total: number }>) {
  const rows = Object.entries(aggmap).sort((a, b) => a[0].localeCompare(b[0]))
  const trs = rows
    .map(([k, v]) => {
      const p = v.total ? (100 * v.pass) / v.total : 0
      const fill = p >= 80 ? "#16a34a" : p >= 50 ? "#ca8a04" : "#dc2626"
      const inner = Math.max(4, Math.round((p / 100) * 296))
      return `<tr><td class="cn">${esc(k)}</td><td class="tdtrack"><div class="outer"><div class="inner" style="width:${inner}px;background:${fill}"></div></div></td><td class="pct">${v.pass}/${v.total} (${p.toFixed(0)}%)</td></tr>`
    })
    .join("")
  return `<div class="chart-wrap"><div class="chart-title">${esc(title)}</div><table class="bar-table">${trs}</table></div>`
}

function cmpBox(
  order: number,
  lab: string,
  meanScore: number,
  passRate: number,
  cmean: string,
  cpass: string,
) {
  const mh = Math.round(meanScore * 110)
  const ph = Math.max(10, Math.round(passRate * 100))
  return `<div class="cmp-box" style="order:${order}"><div class="cmplab">${esc(lab)}</div><div class="cmp-sub">Mean · 4 shared checks (0–1 scale)</div><div class="cmp-num">${meanScore.toFixed(3)}</div><div class="cmp-bar" style="height:${Math.max(12, mh)}px;background:${cmean}"></div><div class="cmp-sub">Runs with all 4 shared passed</div><div class="cmp-num">${(passRate * 100).toFixed(1)}%</div><div class="cmp-bar" style="height:${ph}px;background:${cpass}"></div></div>`
}

/** Visual order fixed: 1=RAG, 2=GPT, 3=baseline (wkhtmltopdf-safe flex). */
function htmlSuiteCompare(
  title: string,
  rag: { m: number; pr: number },
  gpt: { m: number; pr: number } | null,
  oc: { m: number; pr: number } | null,
) {
  const boxes = [
    cmpBox(1, "① OpenCode + RAG", rag.m, rag.pr, "#1d4ed8", "#3b82f6"),
    gpt ? cmpBox(2, "② GPT direct", gpt.m, gpt.pr, "#6d28d9", "#a78bfa") : "",
    oc ? cmpBox(3, "③ OpenCode baseline", oc.m, oc.pr, "#475569", "#94a3b8") : "",
  ].join("")
  return `<div class="chart-wrap"><div class="chart-title">${esc(title)}</div><p class="chart-sub">Figure 3 uses the same four boolean checks for every configuration. Values are <em>not</em> percentages out of 100 unless labeled; mean 0.905 means on average 90.5% of those four checks passed per run (i.e. ~3.62 of 4).</p><div class="cmp-flex">${boxes}</div></div>`
}

function checkMatrixHtml(
  r: Record<string, { pass: number; total: number }>,
  g: Record<string, { pass: number; total: number }>,
  o: Record<string, { pass: number; total: number }>,
) {
  const cell = (m: Record<string, { pass: number; total: number }>, name: string) => {
    const p = pct(m, name)
    if (p === null) return '<td class="na">—</td>'
    return `<td class="num">${p.toFixed(0)}</td>`
  }
  const body = MATRIX_ROWS.map(
    (n) =>
      `<tr><th scope="row" class="rowh">${esc(n)}</th>${cell(r, n)}${cell(g, n)}${cell(o, n)}</tr>`,
  ).join("")
  return `<table class="matrix">
<thead>
<tr>
<th scope="col" class="c0">Verification check</th>
<th scope="col" class="c1">① OpenCode + RAG<br/><span class="thsmall">pass rate %</span></th>
<th scope="col" class="c2">② GPT direct<br/><span class="thsmall">pass rate %</span></th>
<th scope="col" class="c3">③ OpenCode baseline<br/><span class="thsmall">pass rate %</span></th>
</tr>
</thead>
<tbody>${body}</tbody>
</table>
<p class="cite">Table 1. Percentage of runs in which each check passed. “—” = check not defined for that suite (control-grounding is RAG-only). Rows follow a fixed order so PDF engines do not permute columns.</p>`
}

function stats(rows: Row[]) {
  const ok = rows.filter((r) => r.ok)
  const sc = ok.map((r) => r.score).filter((x): x is number => typeof x === "number")
  const m = mean(sc)
  return {
    n: rows.length,
    ok: ok.length,
    err: rows.length - ok.length,
    scores: sc,
    m,
    med: median(sc),
    sd: stdev(sc, m),
    passn: ok.filter((r) => r.passed === true).length,
    pr: ok.length ? ok.filter((r) => r.passed === true).length / ok.length : 0,
    model: ok[0]?.model_id ?? "—",
    provider: ok[0]?.provider_id ?? "—",
  }
}

function modelLabel(rows: Row[]) {
  const ok = rows.filter((r) => r.ok)
  const r = ok[0]
  if (!r) return "—"
  return `${r.provider_id ?? "—"} / ${r.model_id ?? "—"}`
}

function metaRow(dir: string) {
  const rows = JSON.parse(readFileSync(path.join(dir, "results.json"), "utf8")) as Row[]
  const r = rows.find((x) => x.run_dir && existsSync(path.join(x.run_dir, "metadata.json")))
  if (!r?.run_dir) return null
  return JSON.parse(readFileSync(path.join(r.run_dir, "metadata.json"), "utf8")) as Record<string, unknown>
}

function pctRow(label: string, x: ReturnType<typeof pctileReport>) {
  return `<tr><td>${esc(label)}</td><td class="num">${x.p10.toFixed(3)}</td><td class="num">${x.p25.toFixed(3)}</td><td class="num">${x.p50.toFixed(3)}</td><td class="num">${x.p75.toFixed(3)}</td><td class="num">${x.p90.toFixed(3)}</td></tr>`
}

const runDir = path.resolve(process.argv[2] ?? "")
const skip = (p: string) => p === "" || p === "-" || p === "none"
const pathGpt = !skip(process.argv[3] ?? "") ? path.resolve(process.argv[3]!) : ""
const pathOc = !skip(process.argv[4] ?? "") ? path.resolve(process.argv[4]!) : ""

if (!runDir || !existsSync(path.join(runDir, "results.json"))) {
  console.error(
    "Usage: bun benchmark/render-benchmark-pdf.ts <rag_benchmark_run_dir> [gpt_results.json] [opencode_baseline_results.json]",
  )
  process.exit(1)
}

const rows = JSON.parse(readFileSync(path.join(runDir, "results.json"), "utf8")) as Row[]

let gptOnly: Row[] = []
let ocOnly: Row[] = []
if (pathGpt && existsSync(pathGpt)) {
  const a = JSON.parse(readFileSync(pathGpt, "utf8")) as Row[]
  gptOnly = a.filter((r) => r.suite === "gpt")
  if (!pathOc) ocOnly = a.filter((r) => r.suite === "opencode")
}
if (pathOc && existsSync(pathOc)) {
  const b = JSON.parse(readFileSync(pathOc, "utf8")) as Row[]
  ocOnly = b.filter((r) => r.suite === "opencode")
}

const s = stats(rows)
const shRag = sharedStats(rows)
const shGpt = gptOnly.length ? sharedStats(gptOnly) : null
const shOc = ocOnly.length ? sharedStats(ocOnly) : null

const checksRag = agg(rows)
const checksGpt = gptOnly.length ? agg(gptOnly) : {}
const checksOc = ocOnly.length ? agg(ocOnly) : {}
const bins = hist(s.scores)
const meta = metaRow(runDir)
const ragIngest = ingestAgg(rows)
const gptIngest = gptOnly.length ? ingestAgg(gptOnly) : null
const ocIngest = ocOnly.length ? ingestAgg(ocOnly) : null

const gptStats = gptOnly.length
  ? (() => {
      const st = stats(gptOnly)
      return { m: st.m, pr: st.pr, n: st.n, passn: st.passn, sd: st.sd, med: st.med }
    })()
  : null

const ocStats = ocOnly.length
  ? (() => {
      const st = stats(ocOnly)
      return { m: st.m, pr: st.pr, n: st.n, passn: st.passn, sd: st.sd, med: st.med }
    })()
  : null

const phRag = pctileReport(s.scores)
const phGpt = gptStats ? pctileReport(gptOnly.filter((r) => r.ok).map((r) => r.score!).filter((x) => typeof x === "number")) : null
const phOc = ocStats ? pctileReport(ocOnly.filter((r) => r.ok).map((r) => r.score!).filter((x) => typeof x === "number")) : null

const shPhRag = pctileReport(shRag.vals)
const shPhGpt = shGpt ? pctileReport(shGpt.vals) : null
const shPhOc = shOc ? pctileReport(shOc.vals) : null

const fig1 = htmlHist("Figure 1. ① OpenCode + RAG — headline verification score (÷5 checks), n = 50", bins)
const fig2 = htmlChecks("Figure 2. ① OpenCode + RAG — pass rate by check (includes control-grounding)", checksRag)
const fig3 = htmlSuiteCompare(
  "Figure 3. Shared-four comparison (fixed column order: ① → ② → ③)",
  { m: shRag.m, pr: shRag.pr },
  shGpt ? { m: shGpt.m, pr: shGpt.pr } : null,
  shOc ? { m: shOc.m, pr: shOc.pr } : null,
)

const checkTable =
  gptStats || ocStats
    ? checkMatrixHtml(checksRag, checksGpt, checksOc)
    : `<p class="cite">Pass both GPT and OpenCode baseline <code>results.json</code> paths for Table 1.</p>`

const nScore60 = s.scores.filter((x) => x >= 0.55 && x < 0.65).length
const nScore80 = s.scores.filter((x) => x >= 0.75 && x < 0.85).length
const nScore100 = s.scores.filter((x) => x >= 0.95).length

const binPeak = bins.reduce((a, b) => (b.n > a.n ? b : a), bins[0]!)
const ragByCheck = Object.entries(checksRag)
  .map(([k, v]) => ({ k, p: v.total ? (100 * v.pass) / v.total : 0, pass: v.pass, tot: v.total }))
  .sort((a, b) => a.p - b.p)
const worstCh = ragByCheck[0]
const bestCh = ragByCheck[ragByCheck.length - 1]
const cgPct = pct(checksRag, "control-grounding")

const title = "OpenCode security audit benchmark — RAG and baselines (technical report)"

const css = `
@page { size: A4; margin: 14mm 16mm; }
body { font-family: "DejaVu Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.42; font-size: 10pt; max-width: 100%; margin: 0; }
h1 { font-size: 16pt; margin: 0 0 0.4em 0; line-height: 1.2; }
h2 { font-size: 12pt; margin: 1.05em 0 0.45em 0; page-break-after: avoid; border-bottom: 2px solid #334155; padding-bottom: 0.25em; page-break-before: auto; }
h2.first { page-break-before: avoid; margin-top: 0.6em; }
h2.page { page-break-before: always; }
h3 { font-size: 10.5pt; margin: 1em 0 0.35em 0; page-break-after: avoid; color: #1e293b; }
p { margin: 0.45em 0; text-align: justify; hyphens: auto; }
.abstract { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 14px; margin: 12px 0; font-size: 9.5pt; }
.figure { margin: 12px 0; page-break-inside: avoid; }
.chart-wrap { border: 1px solid #94a3b8; padding: 12px; margin: 10px 0; page-break-inside: avoid; background: #fff; }
.chart-title { font-weight: 700; font-size: 10pt; margin-bottom: 8px; }
.chart-sub { font-size: 8.5pt; color: #475569; margin: 0 0 8px 0; line-height: 1.35; }
.chart-hist { display: table; width: 100%; table-layout: fixed; height: 200px; }
.hcol { display: table-cell; vertical-align: bottom; text-align: center; padding: 0 3px; }
.hcnt { display: block; font-size: 10px; font-weight: 700; margin-bottom: 3px; }
.hbar { width: 68%; margin: 0 auto; background: #1d4ed8; border-radius: 3px 3px 0 0; min-height: 6px; }
.hlbl { display: block; font-size: 7.5pt; color: #475569; margin-top: 6px; line-height: 1.15; }
.bar-table { width: 100%; font-size: 9pt; border-collapse: collapse; }
.bar-table td { padding: 5px 4px; vertical-align: middle; border: none; }
.bar-table .cn { width: 28%; font-size: 8.5pt; }
.bar-table .tdtrack { width: 57%; }
.bar-table .outer { width: 280px; height: 20px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.bar-table .inner { height: 20px; border-radius: 3px; }
.bar-table .pct { width: 15%; text-align: right; font-size: 8.5pt; }
.cmp-flex { display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: space-between; align-items: flex-end; width: 100%; gap: 10px; margin-top: 10px; }
.cmp-box { flex: 1 1 0; min-width: 0; text-align: center; border: 1px solid #e2e8f0; padding: 10px 6px; border-radius: 6px; background: #fafafa; }
.cmplab { font-weight: 700; font-size: 9pt; margin-bottom: 6px; line-height: 1.2; }
.cmp-sub { font-size: 7.5pt; color: #64748b; margin-top: 4px; line-height: 1.2; }
.cmp-num { font-size: 10.5pt; font-weight: 700; margin: 3px 0; }
.cmp-bar { width: 44px; margin: 5px auto 0 auto; border-radius: 3px 3px 0 0; }
.summary-suite, .matrix, .pct-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 8px 0; page-break-inside: avoid; }
.summary-suite th, .summary-suite td, .matrix th, .matrix td, .pct-table th, .pct-table td { border: 1px solid #cbd5e1; padding: 5px 7px; vertical-align: top; }
.summary-suite th, .matrix thead th, .pct-table th { background: #e2e8f0; font-weight: 600; }
.matrix .num { text-align: right; font-family: "DejaVu Sans Mono", monospace; }
.matrix .na { text-align: center; color: #94a3b8; }
.matrix .rowh { font-weight: 600; text-align: left; background: #f8fafc; width: 32%; }
.matrix .c0 { width: 32%; }
.matrix .c1 { width: 22%; }
.matrix .c2 { width: 22%; }
.matrix .c3 { width: 22%; }
.thsmall { font-weight: 400; font-size: 7pt; color: #64748b; }
.small { font-size: 8.5pt; color: #475569; }
.cite { font-size: 8.5pt; color: #64748b; margin: 6px 0; font-style: italic; }
.caption { font-size: 9pt; line-height: 1.48; margin: 10px 0 14px 0; padding: 10px 12px; border-left: 4px solid #334155; background: #f8fafc; text-align: justify; page-break-inside: avoid; }
.caption strong { color: #0f172a; }
.lead { font-size: 9.5pt; margin: 0.5em 0 0.65em 0; }
ul.disc { margin: 0.35em 0 0.5em 1.2em; }
ul.disc li { margin: 0.25em 0; }
.mono { font-family: "DejaVu Sans Mono", monospace; font-size: 8.5pt; }
.callout { font-size: 9pt; line-height: 1.45; margin: 10px 0; padding: 10px 12px; border: 1px solid #94a3b8; background: #fffbeb; border-radius: 4px; }
`

const bodyHtml = `
<h1>${esc(title)}</h1>
<p class="small">Primary artifact: <span class="mono">${esc(runDir)}</span> · Generated <span class="mono">${esc(new Date().toISOString())}</span></p>

<div class="abstract">
<strong>Abstract.</strong> We report automated heuristic verification for three configurations, always listed in evaluation order <strong>① OpenCode + RAG</strong> (repository roots, Pinecone retrieval, five checks including control-grounding), <strong>② GPT direct</strong> (single-file, four checks, OpenAI <code>gpt-5.4-mini</code> in this dataset), <strong>③ OpenCode baseline</strong> (agent, four checks, no retrieval). The headline mean for ② (~0.905 on [0,1]) is <em>not</em> “94% accuracy”; it is the mean fraction of checks passed under a four-item rubric. RAG uses a stricter five-item rubric and larger, truncated inputs. Section 2 quantifies ingestion; Section 6 explains confounders (model identity, input cardinality, rubric size).
</div>

<h2 class="first">1. Experimental design</h2>

<h3>1.1 Configurations (fixed ordering)</h3>
<ol>
<li><strong>① OpenCode + RAG</strong> — <code>mode: rag</code>; agent loop; top-${String(meta?.topk ?? "?")} ISO control chunks from Pinecone; verification includes <em>control-grounding</em> (cited control IDs must appear in retrieved set). Targets: <em>repository roots</em> under <code>samples/bench50/*</code>, text ingested with a hard character ceiling.</li>
<li><strong>② GPT direct</strong> — <code>mode: direct</code>; single completion; no retrieval corpus; four verification checks. Targets: <em>single files</em> (same bench50 corpus family, one path per run).</li>
<li><strong>③ OpenCode baseline</strong> — <code>mode: baseline</code>; OpenCode agent with file attachment; four checks; no vector retrieval.</li>
</ol>

<h3>1.2 Verification rubric (implementation)</h3>
<p>All checks are implemented in <span class="mono">packages/opencode/src/security/verification.ts</span> and operate on parsed markdown sections. Brief definitions:</p>
<table class="summary-suite">
<tr><th>Check</th><th>Definition (operational)</th><th>Modes</th></tr>
<tr><td>structural-completeness</td><td>Required headings: Executive Summary, Findings, Final Risk Overview.</td><td>all</td></tr>
<tr><td>evidence-grounding</td><td>Each parsed finding has non-empty evidence field.</td><td>all</td></tr>
<tr><td>consistency</td><td>Heuristic consistency of severity vs issue text vs recommendation.</td><td>all</td></tr>
<tr><td>empty-generic-detection</td><td>Report length and generic-phrase filter (short or boilerplate ⇒ fail).</td><td>all</td></tr>
<tr><td>control-grounding</td><td>Control IDs cited in findings must match retrieved control IDs (regex on finding control field).</td><td>RAG only</td></tr>
</table>
<p>Headline score = (# checks passed) / (# checks in that mode). Full pass requires 100% of checks in that mode.</p>

<h3>1.3 Models (measured confounder)</h3>
<table class="summary-suite">
<tr><th>Configuration</th><th>Provider / model (from run metadata)</th></tr>
<tr><td>① OpenCode + RAG</td><td>${esc(modelLabel(rows))}</td></tr>
${gptStats ? `<tr><td>② GPT direct</td><td>${esc(modelLabel(gptOnly))}</td></tr>` : ""}
${ocStats ? `<tr><td>③ OpenCode baseline</td><td>${esc(modelLabel(ocOnly))}</td></tr>` : ""}
</table>
<p><strong>Confounder:</strong> ② uses a different foundation model than ①/③ in this benchmark export. Any cross-suite difference partly reflects model capability and tokenizer behavior, not only retrieval vs non-retrieval.</p>

<h2>2. Input scale and context (observed)</h2>
<p>Directory ingest for RAG uses <code>DEFAULT_MAX_CHARS = ${MAX_CHARS_CAP}</code> (<span class="mono">packages/opencode/src/security/schema.ts</span>). When cumulative file text exceeds this, ingestion truncates (<code>clipped: true</code> in metadata).</p>

<table class="summary-suite">
<tr><th>Metric</th><th>① OpenCode + RAG</th><th>② GPT direct</th><th>③ OpenCode baseline</th></tr>
<tr><td>Runs with metadata</td><td>${ragIngest.nMeta}</td><td>${gptIngest ? gptIngest.nMeta : "—"}</td><td>${ocIngest ? ocIngest.nMeta : "—"}</td></tr>
<tr><td>Mean <code>files</code> count (metadata)</td><td>${ragIngest.meanFiles.toFixed(0)}</td><td>${gptIngest ? gptIngest.meanFiles.toFixed(1) : "—"}</td><td>${ocIngest ? ocIngest.meanFiles.toFixed(1) : "—"}</td></tr>
<tr><td>Runs with <code>clipped: true</code></td><td>${ragIngest.clippedRuns} / ${s.n}</td><td>${gptIngest ? `${gptIngest.clippedRuns} / ${gptStats?.n ?? "—"}` : "—"}</td><td>${ocIngest ? `${ocIngest.clippedRuns} / ${ocStats?.n ?? "—"}` : "—"}</td></tr>
<tr><td>Mean <code>input.txt</code> size (bytes)</td><td>${ragIngest.nBytes ? Math.round(ragIngest.meanInputBytes).toLocaleString() : "—"}</td><td>${gptIngest?.nBytes ? Math.round(gptIngest.meanInputBytes).toLocaleString() : "—"}</td><td>${ocIngest?.nBytes ? Math.round(ocIngest.meanInputBytes).toLocaleString() : "—"}</td></tr>
</table>

<h3>2.1 Context window vs this benchmark</h3>
<p><strong>② GPT direct is not “winning because it hits the context window.”</strong> In these runs, ② ingests <em>one file per target</em>; observed mean <code>input.txt</code> size is orders of magnitude smaller than ①’s aggregated repo slice. Under-filling context reduces truncation pressure and usually stabilizes formatting. ① routinely sets <code>clipped: true</code> and presents tens of thousands of files scanned in metadata — the model sees a partial, concatenated corpus, which increases failure rates on structure and evidence parsers independent of “running out of tokens” in the API sense.</p>
<p><strong>Why ~0.905 is not “94%.”</strong> The value 0.905 is a mean on [0,1] over four boolean checks per run (headline for ②). Equivalently, ~90.5% of those check outcomes are passes in expectation (~3.62 of 4 per run on average). It is not an accuracy against ground-truth vulnerabilities.</p>

<h2>3. Results — ① OpenCode + RAG (primary)</h2>
<p class="lead">This section summarizes the <strong>primary</strong> experimental arm: OpenCode in RAG mode over bench50 repository roots, with ISO control retrieval and five verification predicates per run. Every numeric quantity below is derived from the same <em>n</em> = ${s.n} rows as the primary <span class="mono">results.json</span> passed to this renderer. A “run” is one target repository processed end-to-end; “completed” means the pipeline produced a scored verification artifact without a top-level error.</p>
<p>We report two parallel summaries. The <strong>headline</strong> row uses all five checks and divides by five, so it is the quantity that Figure 1 histograms. The <strong>shared-four</strong> rows restrict to the checks that also exist in ② and ③; they are the only fair within-run contrasts against those baselines and match the upper bar in Figure 3. Control-grounding affects only the headline, not the shared-four column; a large gap between the two means therefore indicates that grounding passes or failures are materially moving the five-check average relative to the four-check slice—Figure 2’s control-grounding row gives the marginal pass rate.</p>
<table class="summary-suite">
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Completed</td><td>${s.ok} / ${s.n}</td></tr>
<tr><td>Errors</td><td>${s.err}</td></tr>
<tr><td>Headline mean (÷5 checks)</td><td>${s.m.toFixed(3)}</td></tr>
<tr><td>Median headline</td><td>${s.med.toFixed(3)}</td></tr>
<tr><td>σ (headline)</td><td>${s.sd.toFixed(3)}</td></tr>
<tr><td>Full pass (5/5)</td><td>${s.passn} (${(100 * s.pr).toFixed(1)}%)</td></tr>
<tr><td>Mean on four shared checks only</td><td>${shRag.m.toFixed(3)}</td></tr>
<tr><td>All four shared pass</td><td>${shRag.passn} (${(100 * shRag.pr).toFixed(1)}%)</td></tr>
</table>
<p><strong>Reading the summary table.</strong> <em>Headline mean</em> is the arithmetic mean of per-run scores in [0,1] where each score counts how many of the five checks passed. Because each check is Boolean, individual run scores take only the values 0.0, 0.2, …, 1.0; the mean is therefore a weighted average of those mass points, not a continuous latent variable. <em>Median headline</em> is robust to outliers: if it sits above the mean, the distribution has a left tail (some very low scores); if below, a right tail. <em>σ (headline)</em> quantifies spread in the same units as the mean; for bench50-sized <em>n</em>, a σ near 0.10 typically indicates that most mass sits on two adjacent discrete scores (here 0.60 and 0.80), which is exactly the pattern Figure 1 displays.</p>
<p><em>Full pass (5/5)</em> is a stricter operational criterion than the mean: it counts runs where every predicate, including control-grounding, succeeded. A low full-pass rate with a moderate mean is common when one check is hard and the others are easy—readers should inspect Figure 2 to see which row is the bottleneck. <em>Mean on four shared checks</em> recomputes each run’s score using only structural-completeness, evidence-grounding, consistency, and empty-generic-detection, then divides by four; <em>All four shared pass</em> is the fraction of runs where all four of those passed, ignoring control-grounding. That pair is the correct bridge to §3.1 and Figure 3.</p>
<p><strong>Discrete headline mass.</strong> On the five-check scale, score 0.60 means exactly three checks passed and two failed; 0.80 means four passed and one failed; 1.00 means a perfect sweep. In this dataset: 0.60 → <strong>${nScore60}</strong> runs; 0.80 → <strong>${nScore80}</strong>; 1.00 → <strong>${nScore100}</strong>. Together, ${nScore60 + nScore80} of ${s.n} completed runs (${((100 * (nScore60 + nScore80)) / Math.max(s.ok, 1)).toFixed(1)}% of successful runs) land on those two scores alone, which justifies interpreting the experiment as “usually one or two check failures per repo” rather than a smooth degradation of quality.</p>

<h3>3.1 Reference runs — ② and ③ (headline ÷4)</h3>
<p class="lead">Configurations ② and ③ use a <strong>four-check</strong> headline (no control-grounding). Their headline mean is therefore <em>not</em> comparable to ①’s headline mean without normalization; §4 and Figure 3 use the shared-four construction for that purpose. The table below still lists headline ÷4 for ②/③ because that is what those pipelines optimize locally, and because readers often want the raw benchmark export numbers side by side.</p>
<table class="summary-suite">
<tr><th>Configuration</th><th>n</th><th>Headline mean</th><th>Full pass</th><th>Mean (4 shared)</th><th>All 4 shared pass</th></tr>
${gptStats && shGpt ? `<tr><td>② GPT direct</td><td>${gptStats.n}</td><td>${gptStats.m.toFixed(3)}</td><td>${(100 * gptStats.pr).toFixed(1)}%</td><td>${shGpt.m.toFixed(3)}</td><td>${(100 * shGpt.pr).toFixed(1)}%</td></tr>` : "<tr><td>② GPT direct</td><td colspan=\"5\">— (pass results.json)</td></tr>"}
${ocStats && shOc ? `<tr><td>③ OpenCode baseline</td><td>${ocStats.n}</td><td>${ocStats.m.toFixed(3)}</td><td>${(100 * ocStats.pr).toFixed(1)}%</td><td>${shOc.m.toFixed(3)}</td><td>${(100 * shOc.pr).toFixed(1)}%</td></tr>` : "<tr><td>③ OpenCode baseline</td><td colspan=\"5\">— (pass opencode results.json)</td></tr>"}
</table>
${gptStats && shGpt ? `<p><strong>② GPT direct.</strong> The headline mean ${gptStats.m.toFixed(3)} is the average fraction of the <em>four</em> checks passed per run. It is numerically similar to the “Mean (4 shared)” column for ② because the shared-four set is exactly those four checks. <strong>Full pass</strong> is the percentage of runs with score 1.0 on that four-check scale—i.e. all structural, evidence, consistency, and generic-content predicates passed. This number must not be quoted as “accuracy” against ground truth; it only measures conformance to the automated rubric in <span class="mono">verification.ts</span>. The high headline mean under ② co-occurs with small single-file inputs and a different model than ① (§1.3), so it does not isolate the effect of “no RAG.”</p>` : `<div class="callout"><strong>② GPT direct not merged into this PDF.</strong> Pass the GPT bench <span class="mono">results.json</span> as the second CLI argument so §3.1, Figure 3, Table 1, and the percentile block can print ②. Example: <span class="mono">bun benchmark/render-benchmark-pdf.ts ${esc(runDir)} outputs/benchmarks/&lt;gpt_run&gt;/results.json</span> (add the OpenCode baseline path as a third argument if available).</div>`}
${ocStats && shOc ? `<p><strong>③ OpenCode baseline.</strong> The baseline uses the same four-check verifier family as ② when target lists are aligned, but the OpenCode agent loop and tool use differ from a single completion. Comparing ③ to ② holds retrieval absent in both cases and highlights agent-vs-one-shot behavior. Comparing ③ to ① adds retrieval and the fifth check back in.</p>` : `<div class="callout"><strong>③ OpenCode baseline missing from this PDF.</strong> Regenerate with the merged OpenCode bench50 JSON as the third argument, for example: <span class="mono">bun benchmark/render-benchmark-pdf.ts ${esc(runDir)} &lt;path/to/gpt/results.json&gt; outputs/benchmarks/merged-opencode-bench50.json</span> — or produce a fresh baseline with <span class="mono">./benchmark/run-opencode-baseline-only.sh benchmark/targets-50.txt</span> so ③ targets the same single files as ②. Without that file, Figure 3 and Table 1 omit the third column and cross-suite prose should avoid claiming baseline numbers.</div>`}

<h2>4. Distributional summary (percentiles)</h2>
<p class="lead">Percentiles describe where most of the probability mass sits without assuming a parametric family. We report them for <em>headline</em> scores (different denominators per configuration) and again for the <em>shared-four</em> sub-score (common [0,1] scale across ①–③). Empirical percentiles are order statistics: p50 is the median; the interval [p25, p75] is a robust interquartile range. For discrete per-run scores, several percentiles may coincide (e.g. if more than half of runs share the same headline value).</p>
<p>Percentiles of <em>headline</em> verification score per configuration (empirical CDF, no parametric assumption).</p>
<table class="pct-table">
<tr><th>Configuration</th><th>p10</th><th>p25</th><th>p50</th><th>p75</th><th>p90</th></tr>
${pctRow("① OpenCode + RAG (headline ÷5)", phRag)}
${phGpt ? pctRow("② GPT direct (headline ÷4)", phGpt) : ""}
${phOc ? pctRow("③ OpenCode baseline (headline ÷4)", phOc) : ""}
</table>
<p>Same for <strong>shared-four</strong> score (fraction of shared checks passed):</p>
<table class="pct-table">
<tr><th>Configuration</th><th>p10</th><th>p25</th><th>p50</th><th>p75</th><th>p90</th></tr>
${pctRow("① OpenCode + RAG", shPhRag)}
${shPhGpt ? pctRow("② GPT direct", shPhGpt) : ""}
${shPhOc ? pctRow("③ OpenCode baseline", shPhOc) : ""}
</table>

<h3>4.1 Reading the percentile tables</h3>
<p class="lead">The headline rows use different scales: ① divides by five checks, ② and ③ by four. Therefore <strong>do not compare p50 values across those rows as if they were the same random variable</strong>. Use the <em>shared-four</em> block for cross-configuration shape comparisons on a common [0,1] score. For ①, the gap between p50 and p75 shows concentration: a tight IQR implies most runs fail the same small subset of checks (see Figure 2). For ②, high p90 with p50 near 1.0 indicates many perfect four-check runs and a long lower tail—consistent with occasional structural or generic-content failures.</p>
<p>If p10 for ① sits at or below 0.60 while p50 is 0.80, at least 10% of runs scored no better than a single-check failure on the five-check scale even though the “typical” run loses only one check—report both median and tail when writing a paper’s results paragraph. If shared-four p90 for ② is 1.0 but for ① is lower, the gap is consistent with harder inputs and/or the extra grounding constraint, not necessarily with worse security reasoning in an absolute sense.</p>

<h2 class="page">5. Figures and captions</h2>
<p class="lead">The following plots summarize the <strong>primary</strong> configuration (① OpenCode + RAG, <em>n</em> = ${s.n}). Figure 3 adds ② and ③ on a <em>harmonized</em> four-check sub-score so that bar heights are not artifacts of different denominators. When reproducing this section in a paper, we recommend placing Figure 1–3 in order and citing Table 1 for per-check detail.</p>

<h3>5.1 Figure 1 — Headline score histogram (① only)</h3>
<div class="figure">${fig1}</div>
<div class="caption">
<strong>Figure 1 — interpretation.</strong> The horizontal axis partitions the <em>headline</em> verification score for ① into bins on [0,1]; the vertical bars count runs falling in each bin. Because the headline score is the fraction of <strong>five</strong> checks passed, only discrete values {0.0, 0.2, …, 1.0} are mathematically possible; in practice this dataset clusters at <strong>0.60</strong> (${nScore60} runs) and <strong>0.80</strong> (${nScore80} runs), corresponding to exactly one or two failed checks among five. The modal bin is <strong>${esc(binPeak.label)}</strong> (${binPeak.n} runs). The single-run mass at 1.00 (${nScore100} run) represents a rare case where all five checks, including control-grounding, pass. This histogram should be read as a <em>compression</em> of a five-dimensional boolean outcome into one scalar, not as a continuous latent “quality” measure.
</div>

<h3>5.2 Figure 2 — Check-wise pass rates (① only)</h3>
<div class="figure">${fig2}</div>
<div class="caption">
<strong>Figure 2 — interpretation.</strong> Each row names one automated check from the verifier; the shaded bar is the percentage of the ${s.n} runs in which that check <em>passed</em>. The grey track is 100% width. The check with the <strong>highest</strong> pass rate here is <strong>${bestCh ? esc(bestCh.k) : "—"}</strong> at ${bestCh ? `${bestCh.p.toFixed(0)}%` : "—"} (${bestCh?.pass ?? "—"}/${bestCh?.tot ?? "—"}). The <strong>lowest</strong> pass rate is <strong>${worstCh ? esc(worstCh.k) : "—"}</strong> at ${worstCh ? `${worstCh.p.toFixed(0)}%` : "—"} (${worstCh?.pass ?? "—"}/${worstCh?.tot ?? "—"}); that bottleneck usually explains the 0.60 and 0.80 mass in Figure 1 (one or two failed checks on a five-check scale). <strong>Control-grounding</strong> (RAG-only) passes in ${cgPct !== null ? `${cgPct.toFixed(0)}%` : "—"} of runs; failures mean the model cited a control token that did not appear in the retrieved set for that run—either a hallucinated ID or a formatting mismatch with the parser’s regex. Readers should cross-reference Figure 2 with <strong>Table 1</strong>, which places the same percentages beside ② and ③ for shared checks.
</div>

<h3>5.3 Figure 3 — Shared-four comparison (①, ②, ③)</h3>
<div class="figure">${fig3}</div>
<div class="caption">
<strong>Figure 3 — interpretation.</strong> Columns are fixed in evaluation order: <strong>① OpenCode + RAG</strong>, then <strong>② GPT direct</strong>${shOc ? ", then <strong>③ OpenCode baseline</strong>" : ""}. Within each column, the <em>taller</em> upper bar encodes the mean of the four checks that exist in every mode (structure, evidence, consistency, generic-content filter). The <em>lower</em> bar encodes the fraction of runs where <strong>all four</strong> of those checks pass simultaneously—a stricter criterion than the mean. Numerically, ① achieves a shared-four mean of <strong>${shRag.m.toFixed(3)}</strong> and an all-four pass rate of <strong>${(100 * shRag.pr).toFixed(1)}%</strong>${shGpt ? `; ② yields <strong>${shGpt.m.toFixed(3)}</strong> and <strong>${(100 * shGpt.pr).toFixed(1)}%</strong>` : ""}${shOc ? `; ③ yields <strong>${shOc.m.toFixed(3)}</strong> and <strong>${(100 * shOc.pr).toFixed(1)}%</strong>` : ""}. If ②’s mean exceeds ①’s, that reflects the confounders in §1.3 and §2 (model change, input cardinality, absence of a fifth check), not a proof that raw GPT is a superior security auditor. The scientific role of Figure 3 is to separate <em>template-level</em> agreement with the rubric from the <em>retrieval-grounding</em> obligation that only ① enforces (Figure 2, bottom rows / Table 1).
</div>

<h2>6. Synthesis for the paper text</h2>
<p class="lead">A concise paragraph suitable for adaptation in a results section might read: <em>“Under the OpenCode heuristic verifier, RAG over repository roots (${s.n} runs) achieved a mean headline score of ${s.m.toFixed(3)} on five checks (median ${s.med.toFixed(3)}, σ = ${s.sd.toFixed(3)}). The empirical distribution (Figure 1) is concentrated at scores 0.60 and 0.80, consistent with one–two failed checks per run. Check-wise analysis (Figure 2) shows that ${worstCh ? esc(worstCh.k) : "—"} is the binding constraint (${worstCh ? `${worstCh.p.toFixed(0)}%` : "—"} pass), while control-grounding succeeds in ${cgPct !== null ? `${cgPct.toFixed(0)}%` : "—"} of runs. On the four checks shared with non-RAG baselines (Figure 3), the mean shared-four score is ${shRag.m.toFixed(3)} for RAG${shGpt ? ` versus ${shGpt.m.toFixed(3)} for GPT direct${shOc ? ` and ${shOc.m.toFixed(3)} for OpenCode baseline` : ""}` : ""}, with the caveat that GPT uses a different model and smaller inputs (§1.3, §2).”</em></p>

<h3>6.1 Threats to validity</h3>
<ul class="disc">
<li><strong>Construct validity:</strong> Scores measure agreement with parser rules, not real vulnerability density.</li>
<li><strong>Internal validity:</strong> Confounded comparison between ② and ①/③ via model family and prompt shape.</li>
<li><strong>External validity:</strong> Bench50 snapshots may not represent proprietary codebases or other languages.</li>
</ul>

<h3>6.2 Ordering convention (reporting)</h3>
<ul class="disc">
<li>Configurations are labeled <strong>① → ② → ③</strong> throughout; this fixes reader expectation for an OpenCode-centric paper and does not imply ① dominates every numeric column.</li>
<li><strong>Why ② can exceed ① on shared-four:</strong> smaller non-clipped inputs; no fifth check; different model (§1.3); single-shot outputs often satisfy markdown structure detectors.</li>
<li><strong>What ① adds:</strong> measurable control-grounding (${cgPct?.toFixed(0) ?? "—"}% here) and per-run <code>retrieved_controls.json</code> for audit trails—absent in ②/③.</li>
<li><strong>③ vs ②:</strong> With aligned file lists, both use four checks; residual gaps reflect agent vs one-shot generation, not retrieval.</li>
</ul>

<h2>7. Table 1 — Check-level pass rates (all configurations)</h2>
<p class="lead">Table 1 reports, for each check and each configuration, the percentage of runs in which that check’s boolean predicate evaluated to true. Cells marked “—” indicate that the check is undefined for that configuration (e.g. control-grounding applies only to RAG). Percentages are row-comparable across columns for the same check name; they are <em>not</em> calibrated to sum to 100% across rows.</p>
${checkTable}
<p class="caption">
<strong>Reading Table 1 after Figure 2.</strong> Figure 2 is the RAG-only projection of the first numeric column of Table 1. For shared checks, compare column ① to ② and ③ to see whether failures are systematic (e.g. structural gaps in RAG but not in GPT) or model-specific. Large gaps on <code>evidence-grounding</code> or <code>structural-completeness</code> between ① and ② are consistent with truncated multi-file context in ① overwhelming the parser’s expectation of well-formed per-finding blocks. If ③ is available, it helps isolate whether those gaps come from the <em>agent</em> loop (③ vs ②) versus <em>retrieval + grounding</em> (① vs ③).
</p>

<h2>8. Limitations &amp; reproducibility</h2>
<p class="lead">This report is an <strong>instrumentation snapshot</strong>: it measures how often model outputs satisfy syntactic and light-semantic rules in a fixed verifier, not whether the underlying repositories are secure. A run can score 1.0 on all checks while missing real vulnerabilities, or fail structural checks while containing useful narrative. Readers should treat every percentage as <em>rubric pass rate</em>, not labeled precision/recall against a CVE oracle.</p>
<p><strong>Verifier limitations.</strong> Structural-completeness keys off markdown headings and section boundaries; alternate report templates can fail despite coherent content. Evidence-grounding only tests non-emptiness of a parsed evidence field, not factual correctness of the cited lines. Consistency is a short heuristic over severity strings and recommendation text. Empty-generic-detection is a length and phrase filter—legitimate terse reports can be penalized. Control-grounding enforces alignment between cited ISO control tokens and the retrieval set returned for that run; it does not prove that the cited control is the best match for the finding.</p>
<p><strong>Benchmark corpus.</strong> Bench50 is a convenience sample of public snapshots; it may over- or under-represent languages, build systems, and risk profiles relative to an enterprise monorepo. Cloning dates, default branches, and omitted secrets mean the same target string can yield different effective inputs over time. Pinecone index contents and embedding model versions should be pinned in any formal study; this PDF does not embed API revision metadata beyond what each run recorded.</p>
<p><strong>Reproducibility.</strong> Regenerate this PDF with <span class="mono">bun benchmark/render-benchmark-pdf.ts &lt;rag_dir&gt; [gpt.json] [opencode.json]</span>. Align ③ with ②’s file list using <span class="mono">./benchmark/run-opencode-baseline-only.sh benchmark/targets-50.txt</span>. Archive <code>results.json</code>, per-run <code>verification.json</code>, <code>metadata.json</code>, <code>input.txt</code>, and <code>retrieved_controls.json</code> (for RAG) so third parties can recompute tables without re-invoking paid APIs. Document model IDs and temperature settings from each run folder when citing numbers in a camera-ready paper.</p>
`

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`

const md = `# ${title}

## Order
① OpenCode + RAG · ② GPT direct · ③ OpenCode baseline

## Key
- GPT mean **0.905** = mean fraction of checks passed on **[0,1]**, not "94% accuracy".
- RAG: five checks + large clipped inputs; GPT: four checks + one small file + different model.

## Shared-four means
| Config | Mean | All 4 pass |
| --- | --- | --- |
| ① RAG | ${shRag.m.toFixed(3)} | ${(100 * shRag.pr).toFixed(1)}% |
${shGpt ? `| ② GPT | ${shGpt.m.toFixed(3)} | ${(100 * shGpt.pr).toFixed(1)}% |` : ""}
${shOc ? `| ③ Baseline | ${shOc.m.toFixed(3)} | ${(100 * shOc.pr).toFixed(1)}% |` : ""}

Full PDF: \`paper-report.pdf\` in run dir.
`

const outMd = path.join(runDir, "paper-report.md")
const outHtml = path.join(runDir, "paper-report.html")
const outPdf = path.join(runDir, "paper-report.pdf")

writeFileSync(outHtml, html, "utf8")
writeFileSync(outMd, md, "utf8")

const wk = spawnSync(
  "wkhtmltopdf",
  [
    "--print-media-type",
    "--enable-local-file-access",
    "--dpi",
    "110",
    "--margin-top",
    "12mm",
    "--margin-bottom",
    "12mm",
    "--margin-left",
    "14mm",
    "--margin-right",
    "14mm",
    outHtml,
    outPdf,
  ],
  { encoding: "utf8" },
)
if (wk.status !== 0) {
  console.error(wk.stderr || wk.stdout || "wkhtmltopdf failed")
  console.error("Wrote:", outHtml, outMd)
  process.exit(wk.status ?? 1)
}

console.log("Wrote:", outPdf, outHtml, outMd)
