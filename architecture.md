# ResearchX: AI Agent for Research & Paper Writing

**4-Layer Architecture**

---

## ARCHITECTURE DIAGRAM (text version)

```
+--------------------------+    +------------------------------------------------------------------------------------------+
|          INPUTS          |    | 1. RESEARCH LAYER                                                                           |
| Research Question / Idea |    |                                                                                          |
| Paper / ArXiv Link       |    |  [Paper Search & Ranking] --> [Literature Review Synthesis] --> [Code-vs-Paper Audit]    |
| GitHub Repo (Code)       |    |                                                                                          |
| Datasets / Data Sources  |    |   Paper Search & Ranking: arXiv API; Semantic Scholar; OpenAlex                          |
+--------------------------+    |   Literature Review Synthesis: summarize; compare; source-per-claim tagging              |
              |                 |   Code-vs-Paper Audit: compare claims vs code; flag mismatches; evidence links           |
              |                 +------------------------------------------------------------------------------------------+
              |                    <--> EXTERNAL FREE APIS: arXiv | Semantic Scholar | OpenAlex | Crossref
              |                                                   |
              |                                                   v
              |                 +------------------------------------------------------------------------------------------+
              |                 | 2. EXPERIMENT LAYER                                                                        |
              |                 |                                                                                          |
              |                 |  [Git Branch per Hypothesis] --> [Execute Experiments (Free-tier Compute)]               |
              +---------------->|                                                    |                                     |
                                |                                                    v                                     |
                                |  [Doom-loop Detector] <--- [Findings Memory (Ledger)]                                    |
                                |                                                                                          |
                                |   Git Branch per Hypothesis: one repo; one branch per experiment                         |
                                |   Execute Experiments (Free-tier Compute): Colab Notebook; Kaggle Kernel API;            |
                                |       Local Docker                                                                       |
                                |   Findings Memory (Ledger): JSON/SQLite; what tried; what failed & why;                  |
                                |       results/metrics                                                                    |
                                |   Doom-loop Detector: detect repeated failures; kill stuck runs; save resources          |
                                +------------------------------------------------------------------------------------------+
                                   <--> COMPUTE (FREE TIER): Google Colab | Kaggle Kernels | Local Docker
                                                                            |
                                                                            v
                                +------------------------------------------------------------------------------------------+
                                | 3. INTEGRITY LAYER (Non-Negotiable)                                                       |
                                |                                                                                          |
                                |  [Citation Integrity] --> [Claim-to-Evidence Integrity] --> [Human Checkpoint (*)]       |
                                |                                                                                          |
                                |   Citation Integrity: verify every citation; no fabricated refs;                         |
                                |       checks: Semantic Scholar / OpenAlex / Crossref                                     |
                                |   Claim-to-Evidence Integrity: every claim links to a logged result                      |
                                |       stored in Findings Memory                                                          |
                                |   Human Checkpoint (MANDATORY): human review & approval before final;                    |
                                |       never fully autonomous                                                             |
                                +------------------------------------------------------------------------------------------+
                                   <--> VERIFICATION SOURCES: Semantic Scholar | OpenAlex | Crossref
                                                                            |
                                                                            v
                                +------------------------------------------------------------------------------------------+
                                | 4. WRITING LAYER                                                                           |
                                |                                                                                          |
                                |  [Draft Paper Sections] --> [Skeptic Pass (Review)] --> [Ready for Human Review]         |
                                |                                                                                          |
                                |   Draft Paper Sections: Intro; Related Work; Method; Experiments;                        |
                                |       Results; Discussion; Conclusion; verified findings only                            |
                                |   Skeptic Pass (Single-Pass Review): every claim traces to a citation                    |
                                |       or logged experiment; flags gaps / weak claims                                     |
                                |   Ready for Human Review: draft complete; all claims traceable;                          |
                                |       human approval required                                                            |
                                +------------------------------------------------------------------------------------------+
                                   --> FINAL OUTPUT: Research Paper (Draft) --> Human Approval (Final Step)

                                +------------------------------------------------------------------------------------------+
                                | FOUNDATION & ORCHESTRATION                                                               |
                                |  [Agent Orchestrator]  [Tool Manager]  [Memory Manager]                                  |
                                |  [Prompt & Context Manager]  [Logging & Monitoring]                                      |
                                +------------------------------------------------------------------------------------------+
```

---

## INPUTS

- 📝 Research Question / Idea
- 📄 Paper / ArXiv Link
- 🐙 GitHub Repo (Code)
- 🗄️ Datasets / Data Sources

---

## 1. RESEARCH LAYER

### 🔍 Paper Search & Ranking
- arXiv API
- Semantic Scholar
- OpenAlex

➡️

### 📄 Literature Review Synthesis
- Summarize
- Compare
- Source-per-claim tagging

➡️

### ⚖️ Code-vs-Paper Audit
- Compare claims vs code
- Flag mismatches
- Evidence links

**Connections:** ⬇️ to Experiment Layer | ↔️ External Free APIs

---

## 2. EXPERIMENT LAYER

### 🔀 Git Branch per Hypothesis
- One repo
- One branch per experiment

➡️

### 💻 Execute Experiments (Free-tier Compute)
- Colab Notebook
- Kaggle Kernel API
- Local Docker

➡️

### 🗄️ Findings Memory (Ledger)
- JSON / SQLite
- What tried
- What failed & why
- Results / Metrics

➡️

### ⚠️ Doom-loop Detector
- Detect repeated failures
- Kill stuck runs
- Save resources

**Connections:** ⬅️ Inputs | ⬇️ to Integrity Layer | ↔️ Compute Options (Free Tier)

---

## 3. INTEGRITY LAYER (Non-Negotiable)

### 🛡️ Citation Integrity
- Verify every citation
- Semantic Scholar / OpenAlex / Crossref check
- No fabricated refs

➡️

### 📋 Claim-to-Evidence Integrity
- Every experimental claim must link to a logged result
- Must exist in Findings Memory

➡️

### 👤 Human Checkpoint **(Mandatory)**
- Human review & approval before finalization
- Never fully autonomous

**Connections:** ⬇️ to Writing Layer | ↔️ Verification Sources

---

## 4. WRITING LAYER

### ✏️ Draft Paper Sections
- Intro, Related Work, Method, Experiments, Results, Discussion, Conclusion
- Uses verified findings only

➡️

### 📄 Skeptic Pass (Single-Pass Review)
- Does every claim trace to a citation or logged experiment?
- Flag gaps / weak claims

➡️

### 📑 Ready for Human Review
- Draft complete
- All claims traceable
- Human approval required

**Connections:** ➡️ to Final Output

---

## EXTERNAL FREE APIS

- 📕 arXiv API
- 🎓 Semantic Scholar API
- 🌐 OpenAlex API
- 📚 Crossref API

## COMPUTE OPTIONS (FREE TIER)

- 🟠 Google Colab
- 🔵 Kaggle Kernels
- 🐳 Local Docker

## VERIFICATION SOURCES

- 🎓 Semantic Scholar API
- 🌐 OpenAlex API
- 📚 Crossref API

---

## FINAL OUTPUT

- 📄 Research Paper (Draft)
- - - - - - - - - -
- 👤 Human Approval (Final Step)

---

## FOUNDATION & ORCHESTRATION

- 🤖 Agent Orchestrator
- 🛠️ Tool Manager
- 🧠 Memory Manager
- 💬 Prompt & Context Manager
- 📊 Logging & Monitoring

---

## DATA FLOW SUMMARY

```
INPUTS --> Layer 2
Layer 1 --> Layer 2 --> Layer 3 --> Layer 4 --> FINAL OUTPUT
Layer 1 <--> External Free APIs
Layer 2 <--> Compute Options (Free Tier)
Layer 3 <--> Verification Sources
Foundation & Orchestration underlies all layers
```
