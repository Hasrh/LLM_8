import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type BenchmarkRun = {
  suite: string
  target: string
  ok: boolean
  run_dir: string
  score?: number
  passed?: boolean
  provider_id?: string
  model_id?: string
}

type CompareRun = {
  key: string
  label: string
  mode: string
  ok: boolean
  runDir?: string | null
  score?: number | null
  passed?: boolean | null
  findings: string[]
  recommendations: string[]
  warnings?: string[]
  error?: string
}

type CompareResponse = {
  repoPath: string
  generatedAt: string
  runs: CompareRun[]
  comparison: {
    commonFindings: string[]
    uniqueFindings: Record<string, string[]>
  }
  outRoot?: string
  error?: string
}

const SCORE_BUCKETS = [
  { label: '0.00 - 0.49', min: 0, max: 0.49 },
  { label: '0.50 - 0.69', min: 0.5, max: 0.69 },
  { label: '0.70 - 0.84', min: 0.7, max: 0.84 },
  { label: '0.85 - 1.00', min: 0.85, max: 1.0 },
]

function toPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function extractRepoName(target: string) {
  if (!target) return 'unknown'
  const normalized = target.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

function parseBenchmarkRows(input: unknown): BenchmarkRun[] {
  if (!Array.isArray(input)) {
    throw new Error('JSON must be an array of benchmark run objects.')
  }

  return input.map((item) => {
    const row = item as Partial<BenchmarkRun>
    return {
      suite: String(row.suite ?? 'unknown'),
      target: String(row.target ?? ''),
      ok: Boolean(row.ok),
      run_dir: String(row.run_dir ?? ''),
      score: typeof row.score === 'number' ? row.score : undefined,
      passed: typeof row.passed === 'boolean' ? row.passed : undefined,
      provider_id: row.provider_id ? String(row.provider_id) : undefined,
      model_id: row.model_id ? String(row.model_id) : undefined,
    }
  })
}

function App() {
  const [rows, setRows] = useState<BenchmarkRun[]>([])
  const [sourceLabel, setSourceLabel] = useState('No data loaded')
  const [filterSuite, setFilterSuite] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [onlyPassing, setOnlyPassing] = useState(false)
  const [minScore, setMinScore] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [repoPath, setRepoPath] = useState('c:\\Users\\harsh\\Desktop\\llm\\sec_policy_auto\\opencode\\samples\\hello-world')
  const [controlsPath, setControlsPath] = useState('c:\\Users\\harsh\\Desktop\\llm\\sec_policy_auto\\opencode\\data\\security_controls.json')
  const [gptModel, setGptModel] = useState('openrouter/openai/gpt-5.4-mini')
  const [vector, setVector] = useState('qdrant')
  const [topk, setTopk] = useState(3)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null)

  const suites = useMemo(() => {
    const set = new Set(rows.map((row) => row.suite))
    return ['all', ...Array.from(set).sort()]
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return rows.filter((row) => {
      const suiteMatch = filterSuite === 'all' || row.suite === filterSuite
      const textMatch =
        term.length === 0 ||
        row.target.toLowerCase().includes(term) ||
        extractRepoName(row.target).toLowerCase().includes(term)
      const passingMatch = !onlyPassing || row.passed === true
      const score = row.score ?? 0
      const scoreMatch = score >= minScore
      return suiteMatch && textMatch && passingMatch && scoreMatch
    })
  }, [rows, filterSuite, searchTerm, onlyPassing, minScore])

  const summary = useMemo(() => {
    const scores = filteredRows
      .map((row) => row.score)
      .filter((score): score is number => typeof score === 'number')
    const passCount = filteredRows.filter((row) => row.passed === true).length
    const uniqueTargets = new Set(filteredRows.map((row) => row.target)).size
    const avgScore = scores.length
      ? scores.reduce((acc, score) => acc + score, 0) / scores.length
      : 0
    const passRate = filteredRows.length ? passCount / filteredRows.length : 0

    return {
      totalRuns: filteredRows.length,
      avgScore,
      passRate,
      uniqueTargets,
    }
  }, [filteredRows])

  const scoreBuckets = useMemo(() => {
    return SCORE_BUCKETS.map((bucket) => {
      const count = filteredRows.filter((row) => {
        const score = row.score ?? 0
        return score >= bucket.min && score <= bucket.max
      }).length
      return { ...bucket, count }
    })
  }, [filteredRows])

  const suiteBreakdown = useMemo(() => {
    const groups = new Map<string, BenchmarkRun[]>()
    for (const row of filteredRows) {
      const list = groups.get(row.suite) ?? []
      list.push(row)
      groups.set(row.suite, list)
    }
    return Array.from(groups.entries())
      .map(([suite, suiteRows]) => {
        const passCount = suiteRows.filter((row) => row.passed === true).length
        const scores = suiteRows
          .map((row) => row.score)
          .filter((score): score is number => typeof score === 'number')
        const avgScore = scores.length
          ? scores.reduce((acc, score) => acc + score, 0) / scores.length
          : 0
        return {
          suite,
          runs: suiteRows.length,
          avgScore,
          passRate: suiteRows.length ? passCount / suiteRows.length : 0,
        }
      })
      .sort((a, b) => b.runs - a.runs)
  }, [filteredRows])

  const topRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 15)
  }, [filteredRows])

  async function loadSampleData() {
    try {
      setError(null)
      const response = await fetch('/sample-results.json')
      if (!response.ok) {
        throw new Error('Could not load bundled sample data.')
      }
      const json = await response.json()
      setRows(parseBenchmarkRows(json))
      setSourceLabel('Bundled sample data')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sample data.'
      setError(msg)
    }
  }

  function onFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        setError(null)
        const text = String(reader.result ?? '')
        const parsed = JSON.parse(text)
        setRows(parseBenchmarkRows(parsed))
        setSourceLabel(file.name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON file.'
        setError(msg)
      }
    }
    reader.readAsText(file)
  }

  async function analyzeRepoComparison() {
    try {
      setCompareError(null)
      setIsAnalyzing(true)
      const response = await fetch('/api/analyze-compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoPath,
          controlsPath,
          gptModel,
          vector,
          topk,
        }),
      })
      const json = (await response.json()) as CompareResponse
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to run comparative analysis.')
      }
      setCompareResult(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run comparative analysis.'
      setCompareError(msg)
      setCompareResult(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>Security Audit Benchmark Dashboard</h1>
          <p>
            Upload any `results.json` exported from your benchmark runs and review
            pass rates, score patterns, and top-performing targets.
          </p>
        </div>
        <div className="hero-actions">
          <label className="button button-primary">
            Upload JSON
            <input type="file" accept="application/json" onChange={onFileUpload} />
          </label>
          <button className="button button-secondary" onClick={loadSampleData}>
            Load Sample
          </button>
        </div>
      </header>

      <section className="card compare-card">
        <h2>Analyze New Repository</h2>
        <p className="muted">
          Runs three methods on a target repo and compares findings: GPT Direct,
          OpenCode Baseline, and OpenCode + RAG.
        </p>
        <div className="compare-form">
          <div>
            <label htmlFor="repoPath">Repository path</label>
            <input
              id="repoPath"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="C:\\path\\to\\repo"
            />
          </div>
          <div>
            <label htmlFor="controlsPath">Controls JSON path (for RAG)</label>
            <input
              id="controlsPath"
              value={controlsPath}
              onChange={(event) => setControlsPath(event.target.value)}
              placeholder="C:\\path\\to\\security_controls.json"
            />
          </div>
          <div>
            <label htmlFor="gptModel">GPT model for direct mode</label>
            <input
              id="gptModel"
              value={gptModel}
              onChange={(event) => setGptModel(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="vector">Vector backend (rag)</label>
            <select
              id="vector"
              value={vector}
              onChange={(event) => setVector(event.target.value)}
            >
              <option value="qdrant">qdrant</option>
              <option value="pinecone">pinecone</option>
            </select>
          </div>
          <div>
            <label htmlFor="topk">Top-k controls</label>
            <input
              id="topk"
              type="number"
              min={1}
              max={20}
              value={topk}
              onChange={(event) => setTopk(Number(event.target.value))}
            />
          </div>
          <div className="compare-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={analyzeRepoComparison}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Running analysis...' : 'Analyze & Compare'}
            </button>
          </div>
        </div>
        {compareError && <p className="chip chip-error">{compareError}</p>}
        {compareResult && (
          <div className="compare-output">
            <p className="chip">
              Compared repo: {compareResult.repoPath} | Generated:{' '}
              {new Date(compareResult.generatedAt).toLocaleString()}
            </p>
            {compareResult.outRoot && (
              <p className="chip">Run output root: {compareResult.outRoot}</p>
            )}
            <div className="compare-grid">
              {compareResult.runs.map((run) => (
                <article key={run.key} className="card compare-run">
                  <h3>{run.label}</h3>
                  <p className="muted">mode: {run.mode}</p>
                  {!run.ok ? (
                    <p className="chip chip-error">{run.error ?? 'Failed run'}</p>
                  ) : (
                    <>
                      <p className="muted">
                        score: {typeof run.score === 'number' ? run.score.toFixed(2) : 'n/a'} | passed:{' '}
                        {run.passed === true ? 'yes' : 'no'}
                      </p>
                      <p className="muted">findings: {run.findings.length}</p>
                      <ul className="finding-list">
                        {run.findings.slice(0, 5).map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </article>
              ))}
            </div>
            <article className="card">
              <h3>Common Findings Across All Successful Modes</h3>
              {compareResult.comparison.commonFindings.length === 0 ? (
                <p className="muted">No common findings were detected.</p>
              ) : (
                <ul className="finding-list">
                  {compareResult.comparison.commonFindings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              )}
            </article>
            <article className="card">
              <h3>Unique Findings by Mode</h3>
              <div className="unique-grid">
                {Object.entries(compareResult.comparison.uniqueFindings).map(
                  ([runKey, findings]) => (
                    <div key={runKey}>
                      <h4>{runKey}</h4>
                      {findings.length === 0 ? (
                        <p className="muted">No unique findings.</p>
                      ) : (
                        <ul className="finding-list">
                          {findings.map((finding) => (
                            <li key={finding}>{finding}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ),
                )}
              </div>
            </article>
          </div>
        )}
      </section>

      <section className="source-row">
        <span className="chip">Data Source: {sourceLabel}</span>
        {error && <span className="chip chip-error">{error}</span>}
      </section>

      <section className="card filters">
        <div>
          <label htmlFor="suite">Suite</label>
          <select
            id="suite"
            value={filterSuite}
            onChange={(event) => setFilterSuite(event.target.value)}
          >
            {suites.map((suite) => (
              <option key={suite} value={suite}>
                {suite}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="targetSearch">Search target</label>
          <input
            id="targetSearch"
            placeholder="kubernetes, nginx, ..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="minScore">Minimum score: {minScore.toFixed(2)}</label>
          <input
            id="minScore"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            onChange={(event) => setMinScore(Number(event.target.value))}
          />
        </div>
        <div className="checkbox">
          <label htmlFor="onlyPass">
            <input
              id="onlyPass"
              type="checkbox"
              checked={onlyPassing}
              onChange={(event) => setOnlyPassing(event.target.checked)}
            />
            Only fully passing runs
          </label>
        </div>
      </section>

      <section className="stats-grid">
        <article className="card stat">
          <h3>Total Runs</h3>
          <p>{summary.totalRuns}</p>
        </article>
        <article className="card stat">
          <h3>Average Score</h3>
          <p>{summary.avgScore.toFixed(2)}</p>
        </article>
        <article className="card stat">
          <h3>Pass Rate</h3>
          <p>{toPercent(summary.passRate)}</p>
        </article>
        <article className="card stat">
          <h3>Unique Targets</h3>
          <p>{summary.uniqueTargets}</p>
        </article>
      </section>

      <section className="charts-grid">
        <article className="card">
          <h2>Score Distribution</h2>
          <div className="bars">
            {scoreBuckets.map((bucket) => {
              const width =
                summary.totalRuns > 0 ? (bucket.count / summary.totalRuns) * 100 : 0
              return (
                <div key={bucket.label} className="bar-row">
                  <div className="bar-meta">
                    <span>{bucket.label}</span>
                    <span>{bucket.count}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </article>
        <article className="card">
          <h2>Suite Breakdown</h2>
          {suiteBreakdown.length === 0 ? (
            <p className="muted">Load a data file to see suite metrics.</p>
          ) : (
            <ul className="suite-list">
              {suiteBreakdown.map((suite) => (
                <li key={suite.suite}>
                  <span className="suite-name">{suite.suite}</span>
                  <span>{suite.runs} runs</span>
                  <span>avg {suite.avgScore.toFixed(2)}</span>
                  <span>pass {toPercent(suite.passRate)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="card table-card">
        <h2>Top Runs</h2>
        {topRows.length === 0 ? (
          <p className="muted">
            No rows yet. Upload a `results.json` file or click &quot;Load Sample&quot;.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Suite</th>
                  <th>Score</th>
                  <th>Passed</th>
                  <th>Provider / Model</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((row) => (
                  <tr key={`${row.suite}-${row.target}-${row.run_dir}`}>
                    <td>{extractRepoName(row.target)}</td>
                    <td>{row.suite}</td>
                    <td>{typeof row.score === 'number' ? row.score.toFixed(2) : 'n/a'}</td>
                    <td>{row.passed ? 'yes' : 'no'}</td>
                    <td>{`${row.provider_id ?? 'n/a'} / ${row.model_id ?? 'n/a'}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default App
