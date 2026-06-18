import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_PORT = Number(process.env.SEC_POLICY_API_PORT ?? 8787);
const HOST = "127.0.0.1";
const CORS_ORIGIN = process.env.SEC_POLICY_UI_ORIGIN ?? "http://localhost:5173";
const DEFAULT_MODEL = "openrouter/openai/gpt-5.4-mini";
const DEFAULT_OUT_ROOT = path.resolve(process.cwd(), "analysis-runs");
const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

async function loadEnvFile() {
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];
  let text = "";
  for (const envPath of envPaths) {
    text = await fs.readFile(envPath, "utf-8").catch(() => "");
    if (text) break;
  }
  if (!text) return;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
await loadEnvFile();

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

function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_REGEX, "");
}

function runProcess(command, args, cwd) {
  const callbacks = arguments[3] ?? {};
  const envOverrides = callbacks.envOverrides ?? {};
  const onStdout = typeof callbacks.onStdout === "function" ? callbacks.onStdout : null;
  const onStderr = typeof callbacks.onStderr === "function" ? callbacks.onStderr : null;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env, ...envOverrides },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (onStdout) {
        onStdout(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (onStderr) {
        onStderr(text);
      }
    });
    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function parseRequestBody(req) {
  return new Promise(async (resolve, reject) => {
    try {
      const bodyChunks = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      const rawBody = Buffer.concat(bodyChunks).toString("utf-8");
      resolve(rawBody ? JSON.parse(rawBody) : {});
    } catch (error) {
      reject(error);
    }
  });
}

function sendSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
  onStdout,
  onStderr,
  runKey,
}) {
  await fs.mkdir(outDir, { recursive: true });
  const beforeDirs = new Set(await listDirectories(outDir));

  const modeArgs = [
    "analyze",
    "--path",
    repoPath,
    "--mode",
    mode,
    "--out",
    outDir,
  ];

  if (model) {
    modeArgs.push("--model", model);
  }
  if (mode === "rag") {
    if (controlsPath) {
      modeArgs.push("--controls", controlsPath);
    }
    if (typeof topk === "number" && Number.isFinite(topk)) {
      modeArgs.push("--topk", String(topk));
    }
    if (vector) {
      modeArgs.push("--vector", vector);
    }
  }

  const opencodeRoot = path.resolve(cwd, "opencode");
  const localCliCwd = path.resolve(opencodeRoot, "packages/opencode");
  const attempts = [
    { command, args: modeArgs, cwd },
    {
      command: "bun",
      args: [
        "run",
        "--cwd",
        localCliCwd,
        "--conditions=browser",
        "src/index.ts",
        ...modeArgs,
      ],
      cwd: opencodeRoot,
    },
  ];

  let proc = null;
  const stateDir = path.join(outDir, "_state", runKey);
  const xdgDataDir = path.join(stateDir, "xdg-data");
  const xdgConfigDir = path.join(stateDir, "xdg-config");
  const xdgCacheDir = path.join(stateDir, "xdg-cache");
  const xdgStateDir = path.join(stateDir, "xdg-state");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(xdgDataDir, { recursive: true });
  await fs.mkdir(xdgConfigDir, { recursive: true });
  await fs.mkdir(xdgCacheDir, { recursive: true });
  await fs.mkdir(xdgStateDir, { recursive: true });
  const envOverrides = {
    OPENCODE_DB: path.join(stateDir, "opencode.db"),
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "1",
    XDG_DATA_HOME: xdgDataDir,
    XDG_CONFIG_HOME: xdgConfigDir,
    XDG_CACHE_HOME: xdgCacheDir,
    XDG_STATE_HOME: xdgStateDir,
  };
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt.command) continue;
    const streamLogs = index > 0;
    const result = await runProcess(attempt.command, attempt.args, attempt.cwd, {
      onStdout: streamLogs ? onStdout : undefined,
      onStderr: streamLogs ? onStderr : undefined,
      envOverrides,
    });
    proc = result;
    if (result.code === 0) break;
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
    const looksLikeUnknownCommand =
      output.includes("commands:") && !output.includes("run_dir:");
    if (!looksLikeUnknownCommand) break;
  }

  if (!proc) {
    proc = {
      code: -1,
      stdout: "",
      stderr: "Failed to execute analyzer command.",
    };
  }
  if (
    proc.code !== 0 &&
    `${proc.stdout}\n${proc.stderr}`.includes("Cannot find module '@opencode-ai/")
  ) {
    proc.stderr = `${proc.stderr}\nMissing opencode workspace dependencies. Run 'bun install' in /home/aggerio/temp/LLM_8/opencode and retry.`;
  }

  const afterDirs = (await listDirectories(outDir)).filter((name) => name !== "_state");
  const newDirs = afterDirs.filter((name) => !beforeDirs.has(name));
  const sortedNewDirs = newDirs.sort();
  const runDirName = sortedNewDirs.length
    ? sortedNewDirs[sortedNewDirs.length - 1]
    : afterDirs.sort().at(-1);
  const runDir = runDirName ? path.join(outDir, runDirName) : null;

  if (proc.code !== 0 || !runDir) {
    let detail = stripAnsi(proc.stderr || proc.stdout || `Failed to run mode: ${mode}`);
    const lower = detail.toLowerCase();
    if (mode === "direct" && lower.includes("no output generated")) {
      detail = `${detail}\nHint: GPT Direct uses OpenRouter. Check OPENROUTER_API_KEY and confirm the key/account is valid (OpenRouter returned 401 in opencode logs).`;
    }
    return {
      key,
      label,
      mode,
      ok: false,
      error: detail,
      stdout: stripAnsi(proc.stdout).slice(-4000),
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

function makeFailedRun(spec, error) {
  return {
    key: spec.key,
    label: spec.label,
    mode: spec.mode,
    ok: false,
    findings: [],
    recommendations: [],
    error: error instanceof Error ? error.message : String(error),
  };
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
      const body = await parseRequestBody(req);

      const repoPath = String(body.repoPath ?? "").trim();
      const controlsPath = String(body.controlsPath ?? "").trim();
      const gptModel = String(body.gptModel ?? DEFAULT_MODEL).trim();
      let vector = String(body.vector ?? "qdrant").trim();
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

  if (req.method === "POST" && req.url === "/api/analyze-compare/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    let streamClosed = false;
    res.on("close", () => {
      streamClosed = true;
    });
    const stream = (event, payload) => {
      if (!streamClosed) {
        sendSseEvent(res, event, payload);
      }
    };

    try {
      const body = await parseRequestBody(req);
      const repoPath = String(body.repoPath ?? "").trim();
      const controlsPath = String(body.controlsPath ?? "").trim();
      const gptModel = String(body.gptModel ?? DEFAULT_MODEL).trim();
      let vector = String(body.vector ?? "qdrant").trim();
      const topk = Number(body.topk ?? 3);
      const command = String(body.command ?? process.env.OPENCODE_BIN ?? "opencode").trim();
      const cwd = String(body.cwd ?? path.resolve(process.cwd(), "..")).trim();
      const outRoot = String(body.outRoot ?? DEFAULT_OUT_ROOT).trim();

      if (!repoPath) {
        stream("job.failed", { error: "repoPath is required." });
        if (!streamClosed) res.end();
        return;
      }
      const repoStat = await fs.stat(repoPath).catch(() => null);
      if (!repoStat || !repoStat.isDirectory()) {
        stream("job.failed", {
          error: `repoPath does not exist or is not a directory: ${repoPath}`,
        });
        if (!streamClosed) res.end();
        return;
      }
      if (vector === "qdrant" && !process.env.QDRANT_URL) {
        if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX) {
          vector = "pinecone";
        } else {
          vector = "lexical";
        }
      }
      if (vector === "pinecone") {
        if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
          stream("job.failed", {
            error:
              "Pinecone vector mode requires PINECONE_API_KEY and PINECONE_INDEX in server environment.",
          });
          if (!streamClosed) res.end();
          return;
        }
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

      stream("job.started", {
        repoPath,
        generatedAt: new Date().toISOString(),
        command,
        cwd,
        outRoot: requestOutDir,
        selectedVector: vector,
        runs: runSpecs.map((spec) => ({
          key: spec.key,
          label: spec.label,
          mode: spec.mode,
          status: "queued",
        })),
      });

      const runPromises = runSpecs.map(async (spec) => {
        const startedAt = new Date().toISOString();
        stream("run.started", {
          key: spec.key,
          label: spec.label,
          mode: spec.mode,
          status: "running",
          startedAt,
        });

        const modeOutDir = path.join(requestOutDir, spec.mode);
        try {
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
            runKey: spec.key,
            onStdout: (text) => {
              const message = stripAnsi(text).trim();
              if (!message) return;
              stream("run.stdout", {
                key: spec.key,
                mode: spec.mode,
                message: message.slice(-500),
                timestamp: new Date().toISOString(),
              });
            },
            onStderr: (text) => {
              const message = stripAnsi(text).trim();
              if (!message) return;
              stream("run.stderr", {
                key: spec.key,
                mode: spec.mode,
                message: message.slice(-500),
                timestamp: new Date().toISOString(),
              });
            },
          });

          stream("run.completed", {
            key: spec.key,
            mode: spec.mode,
            status: result.ok ? "completed" : "failed",
            finishedAt: new Date().toISOString(),
            score: result.score ?? null,
            passed: result.passed ?? null,
            findingsCount: result.findings?.length ?? 0,
            error: result.error ?? null,
            runDir: result.runDir ?? null,
          });
          return result;
        } catch (error) {
          const failedRun = makeFailedRun(spec, error);
          stream("run.completed", {
            key: spec.key,
            mode: spec.mode,
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: failedRun.error,
            runDir: null,
          });
          return failedRun;
        }
      });

      const settled = await Promise.allSettled(runPromises);
      const runs = settled.map((item, index) =>
        item.status === "fulfilled" ? item.value : makeFailedRun(runSpecs[index], item.reason),
      );
      const payload = {
        repoPath,
        generatedAt: new Date().toISOString(),
        command,
        cwd,
        outRoot: requestOutDir,
        runs,
        comparison: buildComparison(runs),
      };

      stream("job.completed", payload);
    } catch (error) {
      stream("job.failed", {
        error: error instanceof Error ? error.message : "Unexpected error in analyze stream",
      });
    }

    if (!streamClosed) {
      res.end();
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(API_PORT, HOST, () => {
  console.log(`Security policy API listening at http://${HOST}:${API_PORT}`);
});

