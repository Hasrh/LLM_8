# Security Audit RAG Prototype - Running Guide

Use your own Pinecone credentials; do not commit real API keys to the repository.

## 1) Set environment variables

Run from repo root (values from the [Pinecone console](https://app.pinecone.io/)):

```bash
export PINECONE_API_KEY="your-pinecone-api-key"
export PINECONE_INDEX="your-index-name"
```

## 2) Build controls corpus from PDFs in `ISOdocs/`

This parses all PDFs under `ISOdocs/` and creates `data/security_controls.json`.

```bash
cd /home/aggerio/temp/opencode/packages/opencode

bun -e 'import path from "path"; import { readdir, readFile, writeFile } from "fs/promises"; import { PDFParse } from "pdf-parse"; const dir = path.resolve("../../ISOdocs"); const files = (await readdir(dir)).filter((x)=>x.toLowerCase().endsWith(".pdf")); const out=[]; for (const name of files){ const full=path.join(dir,name); const buf=await readFile(full); const data=buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); const parser=new PDFParse({ data }); const txt=(await parser.getText()).text; await parser.destroy().catch(()=>{}); const clean=txt.replace(/\s+/g," ").trim(); const size=1400; let idx=0; for (let i=0;i<clean.length;i+=size){ const chunk=clean.slice(i,i+size).trim(); if(!chunk) continue; out.push({ id:`ISO-${name.replace(/[^A-Za-z0-9]/g,"").slice(0,16)}-${String(idx+1).padStart(3,"0")}`, title:`${name} snippet ${idx+1}`, text:chunk, tags:["iso","security","control"] }); idx++; if(idx>=24) break; } } const outPath=path.resolve("../../data/security_controls.json"); await writeFile(outPath, JSON.stringify(out,null,2)); console.log(`wrote ${out.length} controls to ${outPath}`);'
```

## 3) Get three small sample repos

```bash
cd /home/aggerio/temp/opencode
mkdir -p samples

git clone --depth 1 https://github.com/octocat/Hello-World.git samples/hello-world
git clone --depth 1 https://github.com/heroku/node-js-getting-started.git samples/node-js-getting-started
git clone --depth 1 https://github.com/docker/getting-started-app.git samples/getting-started-app
```

## 4) Run RAG audits with Pinecone

With `PINECONE_API_KEY` and `PINECONE_INDEX` exported, the multi-suite benchmark also uses Pinecone for RAG by default:

```bash
cd /home/aggerio/temp/opencode
./benchmark/run-all.sh benchmark/repos-50.txt
# optional second arg: pinecone (default) | qdrant | lexical
```

Single-target examples:

```bash
cd /home/aggerio/temp/opencode/packages/opencode

bun run --conditions=browser ./src/index.ts analyze \
  --path "/home/aggerio/temp/opencode/samples/hello-world" \
  --mode rag \
  --vector pinecone \
  --controls "/home/aggerio/temp/opencode/data/security_controls.json" \
  --topk 5 \
  --out "/home/aggerio/temp/opencode/outputs/runs"

bun run --conditions=browser ./src/index.ts analyze \
  --path "/home/aggerio/temp/opencode/samples/node-js-getting-started" \
  --mode rag \
  --vector pinecone \
  --controls "/home/aggerio/temp/opencode/data/security_controls.json" \
  --topk 5 \
  --out "/home/aggerio/temp/opencode/outputs/runs"

bun run --conditions=browser ./src/index.ts analyze \
  --path "/home/aggerio/temp/opencode/samples/getting-started-app" \
  --mode rag \
  --vector pinecone \
  --controls "/home/aggerio/temp/opencode/data/security_controls.json" \
  --topk 5 \
  --out "/home/aggerio/temp/opencode/outputs/runs"
```

## 5) Where outputs are written

Each run creates:

- `outputs/runs/<timestamp>_<mode>_<target>/report.md`
- `outputs/runs/<timestamp>_<mode>_<target>/verification.json`
- `outputs/runs/<timestamp>_<mode>_<target>/retrieved_controls.json`
- `outputs/runs/<timestamp>_<mode>_<target>/metadata.json`
- `outputs/runs/<timestamp>_<mode>_<target>/manual_score.json`

And appends run records to:

- `outputs/runs/manifest.jsonl`
