import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { benchmark, RAW_GPT_MODEL } from "@/security/benchmark"
import { DEFAULT_CONTROLS_PATH } from "@/security/schema"

export const BenchmarkCommand = cmd({
  command: "benchmark",
  describe: "run comparative security benchmark suites",
  builder: (yargs: Argv) => {
    return yargs
      .option("path", {
        type: "string",
        alias: ["f", "file"],
        array: true,
        describe: "target path(s) to benchmark",
      })
      .option("list", {
        type: "string",
        describe: "newline-delimited file with target paths",
      })
      .option("suite", {
        type: "string",
        choices: ["gpt", "opencode", "rag"],
        array: true,
        default: ["gpt", "opencode", "rag"],
        describe: "suite(s) to run",
      })
      .option("out", {
        type: "string",
        default: "outputs/benchmarks",
        describe: "output base directory",
      })
      .option("prompt", {
        type: "string",
        describe: "optional extra prompt guidance",
      })
      .option("model", {
        type: "string",
        describe: "model override for opencode and rag suites",
      })
      .option("agent", {
        type: "string",
        describe: "agent override for opencode and rag suites",
      })
      .option("gpt-model", {
        type: "string",
        default: RAW_GPT_MODEL,
        describe: "model for gpt suite in provider/model format",
      })
      .option("controls", {
        type: "string",
        default: DEFAULT_CONTROLS_PATH,
        describe: "controls corpus JSON path for rag suite",
      })
      .option("topk", {
        type: "number",
        default: 3,
        describe: "number of controls to retrieve in rag suite",
      })
      .option("vector", {
        type: "string",
        choices: ["pinecone", "qdrant", "lexical"],
        describe: "vector backend override for rag suite",
      })
      .option("collection", {
        type: "string",
        default: "security_controls",
        describe: "vector collection/index name for rag suite",
      })
      .option("namespace", {
        type: "string",
        describe: "optional vector namespace for rag suite",
      })
      .option("maxchars", {
        type: "number",
        describe: "max chars loaded from each target",
      })
      .option("failfast", {
        type: "boolean",
        default: false,
        describe: "stop on first failed run",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const result = await benchmark({
        path: args.path ? args.path.map(String) : undefined,
        list: args.list ? String(args.list) : undefined,
        suite: (args.suite ?? ["gpt", "opencode", "rag"]) as ("gpt" | "opencode" | "rag")[],
        out: args.out ? String(args.out) : undefined,
        prompt: args.prompt ? String(args.prompt) : undefined,
        controls: args.controls ? String(args.controls) : undefined,
        topk: Number(args.topk),
        vector: args.vector as "pinecone" | "qdrant" | "lexical" | undefined,
        collection: args.collection ? String(args.collection) : undefined,
        namespace: args.namespace ? String(args.namespace) : undefined,
        maxchars: typeof args.maxchars === "number" ? Number(args.maxchars) : undefined,
        model: args.model ? String(args.model) : undefined,
        agent: args.agent ? String(args.agent) : undefined,
        gptModel: args["gpt-model"] ? String(args["gpt-model"]) : undefined,
        failfast: Boolean(args.failfast),
      })
      UI.println(`benchmark dir: ${result.dir}`)
      UI.empty()
      for (const item of result.rows) {
        const status = item.ok ? "ok" : "error"
        const score = typeof item.score === "number" ? item.score.toFixed(2) : "-"
        const note = item.run_dir ?? item.error ?? "-"
        UI.println(`${item.suite}\t${status}\t${score}\t${item.target}\t${note}`)
      }
    })
  },
})
