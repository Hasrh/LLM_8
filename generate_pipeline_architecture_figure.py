from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float
    title: str
    lines: list[str]


def _add_box(ax, b: Box, *, fc: str, ec: str) -> FancyBboxPatch:
    patch = FancyBboxPatch(
        (b.x, b.y),
        b.w,
        b.h,
        boxstyle="round,pad=0.02,rounding_size=0.02",
        linewidth=1.2,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)

    ax.text(
        b.x + 0.02,
        b.y + b.h - 0.03,
        b.title,
        ha="left",
        va="top",
        fontsize=11,
        fontweight="semibold",
        color="#0f172a",
    )

    body = "\n".join(f"• {line}" for line in b.lines)
    ax.text(
        b.x + 0.02,
        b.y + b.h - 0.075,
        body,
        ha="left",
        va="top",
        fontsize=9.5,
        color="#334155",
        linespacing=1.2,
    )

    return patch


def _arrow(ax, x1: float, y1: float, x2: float, y2: float, *, color: str = "#475569"):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=12,
            linewidth=1.2,
            color=color,
        )
    )


def generate(out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Normalized canvas coordinates [0..1] for a clean export.
    fig = plt.figure(figsize=(14, 7.875), dpi=200)  # ~16:9
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # Title
    ax.text(
        0.5,
        0.965,
        "Figure 4.1 – High-Level Data Flow Pipeline (Representative Structure)",
        ha="center",
        va="top",
        fontsize=14,
        fontweight="semibold",
        color="#0f172a",
    )

    # Palette
    box_fc = "#ffffff"
    box_ec = "#94a3b8"
    accent_fc = "#eff6ff"
    accent_ec = "#60a5fa"
    mode_fc = "#f8fafc"
    mode_ec = "#cbd5e1"

    # Main flow boxes
    b_input = Box(
        0.05,
        0.64,
        0.18,
        0.20,
        "Input Artifacts",
        ["Git repo / directory", "Config files", "PDF policy docs (optional)"],
    )
    b_ingest = Box(
        0.27,
        0.64,
        0.20,
        0.20,
        "Ingestion & Normalization",
        ["Recursive scan", "Text extraction (code + docs)", "Size cap / maxchars"],
    )
    b_chunk = Box(
        0.51,
        0.64,
        0.20,
        0.20,
        "Chunking & Context Builder",
        ["Chunk files", "Summarize / index", "Build audit query"],
    )

    _add_box(ax, b_input, fc=box_fc, ec=box_ec)
    _add_box(ax, b_ingest, fc=box_fc, ec=box_ec)
    _add_box(ax, b_chunk, fc=box_fc, ec=box_ec)

    _arrow(ax, b_input.x + b_input.w, b_input.y + b_input.h / 2, b_ingest.x, b_ingest.y + b_ingest.h / 2)
    _arrow(ax, b_ingest.x + b_ingest.w, b_ingest.y + b_ingest.h / 2, b_chunk.x, b_chunk.y + b_chunk.h / 2)

    # Modes split
    ax.text(0.74, 0.86, "Modes", ha="center", va="center", fontsize=10, color="#334155")
    split_x = b_chunk.x + b_chunk.w
    split_y = b_chunk.y + b_chunk.h / 2

    # Mode boxes
    b_direct = Box(0.75, 0.73, 0.20, 0.10, "direct", ["Single-pass prompt", "(no retrieval)"])
    b_baseline = Box(0.75, 0.60, 0.20, 0.10, "baseline", ["Agentic workflow", "(no retrieval)"])
    b_rag = Box(0.75, 0.47, 0.20, 0.12, "rag", ["Retrieve top‑k controls", "Top‑k snippets"])

    _add_box(ax, b_direct, fc=mode_fc, ec=mode_ec)
    _add_box(ax, b_baseline, fc=mode_fc, ec=mode_ec)
    _add_box(ax, b_rag, fc=mode_fc, ec=mode_ec)

    # Split arrows
    _arrow(ax, split_x, split_y, b_direct.x, b_direct.y + b_direct.h / 2)
    _arrow(ax, split_x, split_y, b_baseline.x, b_baseline.y + b_baseline.h / 2)
    _arrow(ax, split_x, split_y, b_rag.x, b_rag.y + b_rag.h / 2)

    # RAG resources
    b_controls = Box(0.56, 0.39, 0.17, 0.10, "Controls corpus", ["ISO/IEC 27001 JSON"])
    b_vector = Box(0.56, 0.27, 0.17, 0.10, "Vector DB", ["Qdrant / Pinecone"])
    _add_box(ax, b_controls, fc=accent_fc, ec=accent_ec)
    _add_box(ax, b_vector, fc=accent_fc, ec=accent_ec)
    _arrow(ax, b_controls.x + b_controls.w, b_controls.y + b_controls.h / 2, b_rag.x, b_rag.y + b_rag.h * 0.70, color="#2563eb")
    _arrow(ax, b_vector.x + b_vector.w, b_vector.y + b_vector.h / 2, b_rag.x, b_rag.y + b_rag.h * 0.35, color="#2563eb")

    # Join to execution
    b_exec = Box(
        0.05,
        0.33,
        0.42,
        0.20,
        "LLM / Agent Execution",
        ["Prompt assembly", "Generate findings + evidence", "Map to controls (rag)"],
    )
    b_verify = Box(
        0.51,
        0.33,
        0.26,
        0.20,
        "Heuristic Verification",
        [
            "Structure completeness",
            "Evidence grounding",
            "Control grounding (rag)",
            "Consistency / generic output checks",
        ],
    )
    b_out = Box(
        0.80,
        0.25,
        0.15,
        0.28,
        "Reproducible Artifacts (Outputs)",
        [
            "report.md",
            "retrieved_controls.json (rag)",
            "verification.json",
            "metadata.json",
            "input.txt",
            "manual_score.json (optional)",
        ],
    )

    _add_box(ax, b_exec, fc=box_fc, ec=box_ec)
    _add_box(ax, b_verify, fc=box_fc, ec=box_ec)
    _add_box(ax, b_out, fc=box_fc, ec=box_ec)

    # Join arrows from modes to execution
    join_x = b_exec.x + b_exec.w
    join_y = b_exec.y + b_exec.h / 2
    _arrow(ax, b_direct.x, b_direct.y + b_direct.h / 2, 0.52, join_y + 0.08)
    _arrow(ax, b_baseline.x, b_baseline.y + b_baseline.h / 2, 0.52, join_y)
    _arrow(ax, b_rag.x, b_rag.y + b_rag.h / 2, 0.52, join_y - 0.08)
    _arrow(ax, 0.52, join_y + 0.08, join_x, join_y + 0.06)
    _arrow(ax, 0.52, join_y, join_x, join_y)
    _arrow(ax, 0.52, join_y - 0.08, join_x, join_y - 0.06)

    _arrow(ax, b_exec.x + b_exec.w, b_exec.y + b_exec.h / 2, b_verify.x, b_verify.y + b_verify.h / 2)
    _arrow(ax, b_verify.x + b_verify.w, b_verify.y + b_verify.h / 2, b_out.x, b_out.y + b_out.h / 2)

    # Footer note
    ax.text(
        0.5,
        0.06,
        "Each run saved under outputs/runs/<timestamp>_<mode>_<target>/",
        ha="center",
        va="center",
        fontsize=10,
        color="#334155",
    )

    fig.savefig(out_path, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    generate(Path("reportassets") / "figure5pipelinearchitecture.png")

