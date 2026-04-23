import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_PORT = Number(process.env.SEC_POLICY_API_PORT ?? 8787);
const HOST = "127.0.0.1";
const CORS_ORIGIN = process.env.SEC_POLICY_UI_ORIGIN ?? "http://localhost:5173";
const DEFAULT_MODEL = "openrouter/openai/gpt-5.4-mini";
const DEFAULT_OUT_ROOT = path.resolve(process.cwd(), "analysis-runs");

function normalizeFinding(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonSafe(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseFindingsFromReport(reportText) {
  const lines = reportText.split(/\r?\n/);
  const findings = [];
  const recommendations = [];
  const findingRegex = /^- \*\*Observed Issue\*\*: (.+)$/;
  const recommendationRegex = /^- \*\*Recommendation\*\*: (.+)$/;

  for (const line of lines) {
    const findingMatch = line.match(findingRegex);
    if (findingMatch?.[1]) {
      findings.push(findingMatch[1].trim());
      continue;
    }
    const recMatch = line.match(recommendationRegex);
    if (recMatch?.[1]) {
      recommendations.push(recMatch[1].trim());
    }
  }

  const uniq = (arr) => Array.from(new Set(arr.map((item) => item.trim()).filter(Boolean)));
  return {
    findings: uniq(findings),
    recommendations: uniq(recommendations),
  };
}

async function listDirectories(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function runAnalyzeMode({
  command,
  cwd,
  outDir,
  repoPath,
  mode,
  label,
  key,
  model,
  controlsPath,
  topk,
  vector,
}) {
  await fs.mkdir(outDir, { recursive: true });
  const beforeDirs = new Set(await listDirectories(outDir));

  const args = [
    "analyze",
    "--path",
    repoPath,
    "--mode",
    mode,
    "--out",
    outDir,
  ];

  if (model) {
    args.push("--model", model);
  }
  if (mode === "rag") {
    if (controlsPath) {
      args.push("--controls", controlsPath);
    }
    if (typeof topk === "number" && Number.isFinite(topk)) {
      args.push("--topk", String(topk));
    }
    if (vector) {
      args.push("--vector", vector);
    }
  }

  const proc = await runProcess(command, args, cwd);
  const afterDirs = await listDirectories(outDir);
  const newDirs = afterDirs.filter((name) => !beforeDirs.has(name));
  const sortedNewDirs = newDirs.sort();
  const runDirName = sortedNewDirs.length
    ? sortedNewDirs[sortedNewDirs.length - 1]
    : afterDirs.sort().at(-1);
  const runDir = runDirName ? path.join(outDir, runDirName) : null;

  if (proc.code !== 0 || !runDir) {
    return {
      key,
      label,
      mode,
      ok: false,
      error: proc.stderr || proc.stdout || `Failed to run mode: ${mode}`,
      stdout: proc.stdout.slice(-4000),
      runDir,
    };
  }

  const reportPath = path.join(runDir, "report.md");
  const verificationPath = path.join(runDir, "verification.json");
  const reportText = await fs.readFile(reportPath, "utf-8").catch(() => "");
  const verification = await readJsonSafe(verificationPath);
  const { findings, recommendations } = parseFindingsFromReport(reportText);

  return {
    key,
    label,
    mode,
    ok: true,
    runDir,
    score: typeof verification?.score === "number" ? verification.score : null,
    passed: typeof verification?.passed === "boolean" ? verification.passed : null,
    warnings: Array.isArray(verification?.warnings) ? verification.warnings : [],
    findings,
    recommendations,
    reportPreview: reportText.slice(0, 2000),
    reportPath,
    verificationPath,
  };
}

function buildComparison(runs) {
  const successful = runs.filter((run) => run.ok);
  const findingSets = successful.map((run) => new Set(run.findings.map(normalizeFinding)));
  const commonNormalized = findingSets.length
    ? [...findingSets[0]].filter((item) => findingSets.every((set) => set.has(item)))
    : [];

  const commonFindings = [];
  if (commonNormalized.length) {
    const firstRun = successful[0];
    for (const finding of firstRun.findings) {
      if (commonNormalized.includes(normalizeFinding(finding))) {
        commonFindings.push(finding);
      }
    }
  }

  const uniqueFindings = {};
  for (const run of successful) {
    uniqueFindings[run.key] = run.findings.filter((finding) => {
      const normalized = normalizeFinding(finding);
      return successful.every((other) => {
        if (other.key === run.key) return true;
        return !other.findings.some((item) => normalizeFinding(item) === normalized);
      });
    });
  }

  return {
    commonFindings: Array.from(new Set(commonFindings)),
    uniqueFindings,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/analyze-compare") {
    try {
      const bodyChunks = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      const rawBody = Buffer.concat(bodyChunks).toString("utf-8");
      const body = rawBody ? JSON.parse(rawBody) : {};

      const repoPath = String(body.repoPath ?? "").trim();
      const controlsPath = String(body.controlsPath ?? "").trim();
      const gptModel = String(body.gptModel ?? DEFAULT_MODEL).trim();
      const vector = String(body.vector ?? "qdrant").trim();
      const topk = Number(body.topk ?? 3);
      const command = String(body.command ?? process.env.OPENCODE_BIN ?? "opencode").trim();
      const cwd = String(body.cwd ?? path.resolve(process.cwd(), "..")).trim();
      const outRoot = String(body.outRoot ?? DEFAULT_OUT_ROOT).trim();

      if (!repoPath) {
        sendJson(res, 400, { error: "repoPath is required." });
        return;
      }

      const repoStat = await fs.stat(repoPath).catch(() => null);
      if (!repoStat || !repoStat.isDirectory()) {
        sendJson(res, 400, { error: `repoPath does not exist or is not a directory: ${repoPath}` });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const requestOutDir = path.join(outRoot, `compare_${timestamp}`);

      const runSpecs = [
        {
          key: "gpt_direct",
          label: "GPT Direct",
          mode: "direct",
          model: gptModel || DEFAULT_MODEL,
        },
        {
          key: "opencode_baseline",
          label: "OpenCode Baseline",
          mode: "baseline",
          model: "",
        },
        {
          key: "opencode_rag",
          label: "OpenCode + RAG",
          mode: "rag",
          model: "",
        },
      ];

      const runs = [];
      for (const spec of runSpecs) {
        const modeOutDir = path.join(requestOutDir, spec.mode);
        const result = await runAnalyzeMode({
          command,
          cwd,
          outDir: modeOutDir,
          repoPath,
          mode: spec.mode,
          label: spec.label,
          key: spec.key,
          model: spec.model,
          controlsPath,
          topk,
          vector,
        });
        runs.push(result);
      }

      sendJson(res, 200, {
        repoPath,
        generatedAt: new Date().toISOString(),
        command,
        cwd,
        outRoot: requestOutDir,
        runs,
        comparison: buildComparison(runs),
      });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unexpected error in analyze-compare",
      });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(API_PORT, HOST, () => {
  console.log(`Security policy API listening at http://${HOST}:${API_PORT}`);
});

