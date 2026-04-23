from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Rectangle


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "report_assets"
RAG_RESULTS = ROOT / "opencode" / "outputs" / "benchmarks_rag" / "2026-04-07T18-12-56-936Z" / "results.json"
BASELINE_RESULTS = ROOT / "opencode" / "outputs" / "benchmarks" / "2026-04-07T19-12-38-027Z" / "results.json"


def load_scores(path: Path) -> list[float]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return [float(item["score"]) for item in rows if item.get("ok") and item.get("score") is not None]


def setup():
    ASSETS.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update(
        {
            "figure.dpi": 160,
            "savefig.dpi": 200,
            "font.size": 10,
            "axes.titlesize": 13,
            "axes.labelsize": 10,
        }
    )


def save(fig, name: str):
    fig.tight_layout()
    fig.savefig(ASSETS / name, bbox_inches="tight")
    plt.close(fig)


def chart_rag_distribution(rag_scores: list[float]):
    bins = [0.0, 0.55, 0.65, 0.75, 0.85, 0.95, 1.01]
    labels = ["0.00-0.55", "0.55-0.65", "0.65-0.75", "0.75-0.85", "0.85-0.95", "0.95-1.00"]
    counts = [0] * (len(bins) - 1)
    for score in rag_scores:
        for idx in range(len(bins) - 1):
            if bins[idx] <= score < bins[idx + 1]:
                counts[idx] += 1
                break

    fig, ax = plt.subplots(figsize=(10, 4.8))
    bars = ax.bar(labels, counts, color="#2F6BFF")
    ax.set_title("RAG Verification Score Distribution")
    ax.set_xlabel("Normalized verification score range")
    ax.set_ylabel("Number of benchmark runs")
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.3, str(count), ha="center", va="bottom")
    save(fig, "figure_01_rag_score_distribution.png")


def chart_method_comparison(rag_scores: list[float], baseline_scores: list[float]):
    methods = ["OpenCode + RAG", "OpenCode Baseline", "GPT Direct"]
    mean_scores = [
        sum(rag_scores) / len(rag_scores),
        sum(baseline_scores) / len(baseline_scores),
        0.905,
    ]
    full_pass = [
        100 * sum(1 for x in rag_scores if math.isclose(x, 1.0)) / len(rag_scores),
        100 * sum(1 for x in baseline_scores if math.isclose(x, 1.0)) / len(baseline_scores),
        62.0,
    ]

    fig, ax1 = plt.subplots(figsize=(10, 5.2))
    x = range(len(methods))
    bars = ax1.bar(x, mean_scores, width=0.55, color=["#2F6BFF", "#20A486", "#F18F01"])
    ax1.set_xticks(list(x), methods)
    ax1.set_ylim(0, 1.05)
    ax1.set_ylabel("Mean normalized score")
    ax1.set_title("Method Comparison Across Benchmark Conditions")
    ax1.grid(axis="y", linestyle="--", alpha=0.35)

    ax2 = ax1.twinx()
    ax2.plot(list(x), full_pass, color="#B22222", marker="o", linewidth=2)
    ax2.set_ylim(0, 100)
    ax2.set_ylabel("Full-pass rate (%)")

    for bar, val in zip(bars, mean_scores):
        ax1.text(bar.get_x() + bar.get_width() / 2, val + 0.02, f"{val:.2f}", ha="center", va="bottom")
    for idx, val in enumerate(full_pass):
        ax2.text(idx, val + 3, f"{val:.0f}%", ha="center", color="#B22222")

    save(fig, "figure_02_method_comparison.png")


def chart_checkwise_pass_rates():
    checks = [
        "Structural\ncompleteness",
        "Evidence\ngrounding",
        "Generic output\ndetection",
        "Control\ngrounding",
        "Consistency",
    ]
    values = [64, 60, 66, 78, 100]

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.barh(checks, values, color="#5C9E31")
    ax.set_xlim(0, 100)
    ax.set_xlabel("Pass rate (%)")
    ax.set_title("Check-wise Pass Rates for the RAG-Enabled Audit Workflow")
    ax.grid(axis="x", linestyle="--", alpha=0.35)
    for bar, val in zip(bars, values):
        ax.text(val + 1, bar.get_y() + bar.get_height() / 2, f"{val}%", va="center")
    save(fig, "figure_03_checkwise_pass_rates.png")


def chart_project_timeline():
    phases = [
        ("Problem definition and literature review", 1, 3),
        ("Prototype planning and architecture", 3, 5),
        ("Codebase ingestion and prompt design", 5, 8),
        ("Control corpus and retrieval layer", 7, 10),
        ("Verification and benchmark tooling", 9, 12),
        ("Experimental evaluation", 12, 14),
        ("Documentation and report writing", 14, 16),
    ]
    fig, ax = plt.subplots(figsize=(10, 5))
    y_positions = list(range(len(phases)))
    for y, (label, start, end) in zip(y_positions, phases):
        ax.barh(y, end - start, left=start, height=0.6, color="#845EC2")
        ax.text(start + 0.1, y, label, va="center", ha="left", color="white", fontsize=9)
    ax.set_yticks([])
    ax.set_xticks(range(1, 17))
    ax.set_xlabel("Project timeline (weeks)")
    ax.set_title("Indicative Project Implementation Plan")
    ax.grid(axis="x", linestyle="--", alpha=0.35)
    save(fig, "figure_04_project_timeline.png")


def _box(ax, xy, width, height, text, facecolor="#F7F9FC"):
    rect = Rectangle(xy, width, height, facecolor=facecolor, edgecolor="#2A2A2A", linewidth=1.2)
    ax.add_patch(rect)
    ax.text(xy[0] + width / 2, xy[1] + height / 2, text, ha="center", va="center", wrap=True)
    return rect


def _arrow(ax, start, end):
    ax.add_patch(FancyArrowPatch(start, end, arrowstyle="->", mutation_scale=12, linewidth=1.2, color="#2A2A2A"))


def diagram_system_architecture():
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 8)
    ax.axis("off")

    _box(ax, (0.5, 3.1), 2.0, 1.2, "Repository /\nConfiguration Input", "#DDEBFF")
    _box(ax, (3.0, 3.1), 2.0, 1.2, "Ingestion Engine\n(recursive traversal,\nPDF parsing)", "#E9F5DB")
    _box(ax, (5.5, 4.6), 2.3, 1.2, "Security Controls Corpus\n(JSON chunks from ISO PDFs)", "#FFF3CD")
    _box(ax, (5.5, 1.6), 2.3, 1.2, "Vector / Lexical Retrieval\n(Pinecone, Qdrant, or lexical)", "#FFF3CD")
    _box(ax, (8.5, 3.1), 2.1, 1.2, "Prompt Engineering\nModule", "#FCE1F1")
    _box(ax, (11.2, 3.1), 2.0, 1.2, "LLM / OpenCode Agent\n(direct, baseline, RAG)", "#DDEBFF")
    _box(ax, (8.5, 0.6), 4.7, 1.2, "Verification + Logging\n(report.md, verification.json, metadata.json)", "#E9F5DB")

    _arrow(ax, (2.5, 3.7), (3.0, 3.7))
    _arrow(ax, (5.0, 3.7), (8.5, 3.7))
    _arrow(ax, (7.8, 5.2), (9.3, 4.3))
    _arrow(ax, (7.8, 2.2), (8.5, 3.1))
    _arrow(ax, (10.6, 3.7), (11.2, 3.7))
    _arrow(ax, (12.2, 3.1), (11.2, 1.8))
    _arrow(ax, (9.6, 3.1), (10.0, 1.8))

    ax.set_title("System Architecture of the Security Policy Automation Prototype", fontsize=14)
    save(fig, "figure_05_system_architecture.png")


def diagram_data_flow():
    fig, ax = plt.subplots(figsize=(12, 5.5))
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 6)
    ax.axis("off")

    _box(ax, (0.5, 2.2), 2.0, 1.2, "Source repository\nor single artifact", "#DDEBFF")
    _box(ax, (3.0, 2.2), 2.0, 1.2, "File parser and\ncontent normalizer", "#E9F5DB")
    _box(ax, (5.5, 2.2), 2.0, 1.2, "Combined audit\ncontext", "#FFF3CD")
    _box(ax, (8.0, 3.8), 2.2, 1.2, "Control retrieval", "#FCE1F1")
    _box(ax, (8.0, 0.8), 2.2, 1.2, "Prompt assembly", "#FCE1F1")
    _box(ax, (10.7, 2.2), 1.8, 1.2, "Generated\nreport", "#DDEBFF")

    _arrow(ax, (2.5, 2.8), (3.0, 2.8))
    _arrow(ax, (5.0, 2.8), (5.5, 2.8))
    _arrow(ax, (7.5, 2.8), (8.0, 4.1))
    _arrow(ax, (7.5, 2.8), (8.0, 1.4))
    _arrow(ax, (10.2, 4.1), (10.7, 2.9))
    _arrow(ax, (10.2, 1.4), (10.7, 2.5))

    ax.set_title("Data Flow Diagram for Audit Generation", fontsize=14)
    save(fig, "figure_06_data_flow_diagram.png")


def diagram_class_view():
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 7)
    ax.axis("off")

    _box(ax, (0.6, 4.4), 3.0, 1.4, "SecurityAnalyzeInput\nmode, path, controls, topk,\nvector, collection, namespace", "#DDEBFF")
    _box(ax, (4.6, 4.4), 3.0, 1.4, "SecurityControl\nid, title, text, tags", "#FFF3CD")
    _box(ax, (4.6, 1.8), 3.0, 1.4, "RetrievedControl\nSecurityControl + score", "#FFF3CD")
    _box(ax, (8.6, 4.4), 3.0, 1.4, "SecurityVerification\npassed, checks, warnings,\nscore", "#E9F5DB")
    _box(ax, (8.6, 1.8), 3.0, 1.4, "SecurityAnalyzeResult\nprompt, report,\nretrieved_controls,\nverification, metadata", "#FCE1F1")

    _arrow(ax, (3.6, 5.1), (4.6, 5.1))
    _arrow(ax, (6.1, 4.4), (6.1, 3.2))
    _arrow(ax, (7.6, 5.1), (8.6, 5.1))
    _arrow(ax, (10.1, 4.4), (10.1, 3.2))
    _arrow(ax, (7.6, 2.5), (8.6, 2.5))

    ax.set_title("Conceptual Class View of Core Security-Audit Objects", fontsize=14)
    save(fig, "figure_07_class_view.png")


def main():
    setup()
    rag_scores = load_scores(RAG_RESULTS)
    baseline_scores = load_scores(BASELINE_RESULTS)
    chart_rag_distribution(rag_scores)
    chart_method_comparison(rag_scores, baseline_scores)
    chart_checkwise_pass_rates()
    chart_project_timeline()
    diagram_system_architecture()
    diagram_data_flow()
    diagram_class_view()
    print("Generated report figures in", ASSETS)


if __name__ == "__main__":
    main()
