import matplotlib.pyplot as plt
import numpy as np
import os
from datetime import date, timedelta

# Create output directories if they don't exist
os.makedirs('report_assets', exist_ok=True)
os.makedirs('reportassets', exist_ok=True)

# ---------------------------------------------------------
# Figure 1: RAG Headline Score Distribution (Histogram-like)
# ---------------------------------------------------------
def generate_fig1():
    bins = ['0–0.55', '0.55–0.65', '0.65–0.75', '0.75–0.85', '0.85–0.95', '0.95–1.00']
    counts = [0, 0, 17, 32, 0, 1]

    plt.figure(figsize=(8, 5))
    bars = plt.bar(bins, counts, color='#9999ff', edgecolor='blue', width=0.6)

    # Add count labels on top of bars
    for bar in bars:
        yval = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2, yval + 0.5, int(yval), ha='center', va='bottom', color='blue')

    plt.ylim(0, 35)
    plt.yticks([0, 10, 20, 30])
    plt.xlabel('Score Range')
    plt.ylabel('Runs')
    plt.title('RAG Headline Score Distribution')
    
    plt.tight_layout()
    plt.savefig('report_assets/figure_1_score_distribution.png', dpi=300)
    plt.close()

# ---------------------------------------------------------
# Figure 2: Method Comparison
# ---------------------------------------------------------
def generate_fig2():
    labels = ['OpenCode+RAG', 'GPT Direct']
    mean_scores = [0.73, 0.91]
    full_pass_rates = [0.24, 0.62]

    x = np.arange(len(labels))
    width = 0.15

    fig, ax = plt.subplots(figsize=(8, 5))
    rects1 = ax.bar(x - width/2, mean_scores, width, label='Mean Score', color='blue')
    rects2 = ax.bar(x + width/2, full_pass_rates, width, label='Full Pass Rate', color='red')

    ax.set_ylabel('Score (0–1)')
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 1.0)
    
    # Grid lines
    ax.yaxis.grid(True, linestyle='--', which='major', color='grey', alpha=.25)

    # Add text labels
    for rect in rects1:
        height = rect.get_height()
        ax.annotate(f'{height:.2f}', xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', color='blue')
    for rect in rects2:
        height = rect.get_height()
        ax.annotate(f'{height:.2f}', xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', color='red')

    # Legend at bottom center
    ax.legend(loc='lower center', bbox_to_anchor=(0.5, -0.2), ncol=2, frameon=True)

    plt.tight_layout()
    plt.savefig('report_assets/figure_2_method_comparison.png', dpi=300, bbox_inches='tight')
    plt.close()

# ---------------------------------------------------------
# Figure 3: Check-wise pass rates
# ---------------------------------------------------------
def generate_fig3():
    criteria = [
        'structural-completeness',
        'evidence-grounding',
        'empty-generic-detection',
        'control-grounding',
        'consistency'
    ]
    rates = [64, 60, 66, 78, 100]

    plt.figure(figsize=(8, 5))
    bars = plt.barh(criteria, rates, color='#c2c2ff', edgecolor='blue', height=0.6)

    # Grid lines
    plt.gca().xaxis.grid(True, linestyle='--', which='major', color='grey', alpha=.25)

    # Add text labels inside or outside bars
    for bar in bars:
        width = bar.get_width()
        plt.text(width + 2, bar.get_y() + bar.get_height()/2, f'{int(width)}', 
                 va='center', ha='left', color='blue')

    plt.xlim(0, 110)
    plt.xlabel('Pass Rate (%)')
    plt.tight_layout()
    plt.savefig('report_assets/figure_3_checkwise_pass_rates.png', dpi=300)
    plt.close()

# ---------------------------------------------------------
# Figure 4: Project Timeline Gantt Chart
# ---------------------------------------------------------
def generate_fig4():
    # Aligned with section 2.5 milestones in Final_Project_Report.md
    project_start = date(2026, 1, 5)

    phases = [
        ("Requirement Analysis & Literature", 1, 2),
        ("System Design & OpenCode API Review", 3, 5),
        ("Model Integration & Vector Setup", 5, 7),
        ("Pipeline Implementation (direct/baseline/rag)", 7, 11),
        ("Testing & Verification (50 repositories)", 11, 13),
        ("Results Analysis & Report Preparation", 13, 15),
    ]

    colors = ["#2563EB", "#0EA5E9", "#14B8A6", "#10B981", "#84CC16", "#F59E0B"]

    fig, ax = plt.subplots(figsize=(12, 5.4))

    def week_range_to_dates(start_week, end_week):
        start_day = project_start + timedelta(weeks=start_week - 1)
        end_day = project_start + timedelta(weeks=end_week) - timedelta(days=1)
        return f"{start_day.strftime('%b %d')} - {end_day.strftime('%b %d')}"

    y_pos = np.arange(len(phases))
    for i, ((label, start, end), color) in enumerate(zip(phases, colors)):
        duration = end - start + 1
        ax.barh(
            y_pos[i],
            duration,
            left=start - 0.5,
            height=0.62,
            color=color,
            edgecolor="#1F2937",
            linewidth=0.8,
            alpha=0.92,
        )
        ax.text(
            end + 0.65,
            y_pos[i],
            f"W{start}-W{end}",
            va="center",
            ha="left",
            fontsize=9,
            color="#1F2937",
            fontweight="bold",
        )
        ax.text(
            end + 2.0,
            y_pos[i],
            week_range_to_dates(start, end),
            va="center",
            ha="left",
            fontsize=8.5,
            color="#475569",
        )

    ax.set_yticks(y_pos)
    ax.set_yticklabels([row[0] for row in phases], fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(0.5, 19.2)
    ax.set_xticks(np.arange(1, 16))
    ax.set_xticklabels(
        [
            f"W{wk}\n{(project_start + timedelta(weeks=wk - 1)).strftime('%b %d')}"
            for wk in range(1, 16)
        ],
        fontsize=8,
    )
    ax.set_xlabel("Project Timeline (Weeks)")
    ax.set_title("Project Timeline (Gantt Chart)\nStart Date: Jan 05, 2026")
    ax.grid(axis="x", linestyle="--", alpha=0.35, linewidth=0.8)
    ax.set_axisbelow(True)

    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)

    plt.tight_layout()
    plt.savefig('report_assets/figure_4_project_timeline.png', dpi=300)
    plt.savefig('reportassets/figure4projecttimeline.png', dpi=300)
    plt.close()

if __name__ == "__main__":
    print("Generating charts...")
    generate_fig1()
    generate_fig2()
    generate_fig3()
    generate_fig4()
    print("Finished generating charts in report_assets/")
