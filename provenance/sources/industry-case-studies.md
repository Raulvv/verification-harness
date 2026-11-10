# LLM cost-reduction case studies — evidence file

Research pass: 2026-11-09. Purpose: back (or explicitly disclaim) the claim that
companies are already running cheap-tier / self-hosted / open-weight models in
production and cutting costs massively — for use in *The Trust Postmortem* and
its submission.

**Method.** Headless Chrome (rendered search + pages), Google/Bing News RSS,
HN index, direct primary-source fetches. Search tooling was partially degraded
(built-in websearch out of service); see § Limitations.

## Evidence grades

| Grade | Meaning |
|---|---|
| ★ **Primary** | First-party source (company blog / engineering post / conference case study) with method or eval numbers |
| ● **Attributed** | Company statements reported by press; no published methodology |
| ○ **Secondary** | Aggregator / analyst write-up |
| ⚠ **Unverified** | Could not verify in this pass — listed for honesty, not for citation |

## The cases

### ★ Primary (first-party, with numbers and method)

| Case | Claim / numbers | Source |
|---|---|---|
| **Character.AI** | Self-hosted small models at ~20k qps. **Serving costs reduced ≥33× since 2022; 13.5× cheaper than the most efficient commercial APIs; <$0.01 per hour of conversation.** Method published (transformer/KV-cache architecture, inter-turn caching) | blog.character.ai, *Optimizing AI Inference at Character.AI*, Jun 20, 2024 |
| **Notion** | `Auto` model router: "Across **20+ common use cases**, delivered **similar results to Opus 5.5 and Astra at about 90% lower average cost**" (credits go ~10× further). Rebuilt agent harness: Custom Agent runs cost **~30% less** in testing; "less to reread on every step means less compute per task." Also: `Review for me` mode uses a separate model as a safety check | notion.com/blog/notion-ai-more-for-less, Oct 19, 2026 (co-founder Akshay Kothari) |
| **Sword Health** | "Blade Code" LLM control plane (single gateway, model registry as runtime config, integer-micro-dollar cost accounting, team-scoped keys, budgets). **LLM costs cut 94% MoM** by routing to cheaper tiers. Full engineering method published | swordhealth.com/research/reduce-enterprise-ai-costs (Aug 2026) |
| **Ramp** | Internal model router open-sourced after 3 years in production; **100+ AI features, 2.75 trillion tokens/month through one endpoint; ~30% own LLM cost cut** — "some of the most credible routing data anyone has published" | via codingscape.com (Oct 2026), linking Ramp |
| **Uber** | 2026 AI budget blown in 4 months (COO to Fortune, May 2026). By August: **cost per AI request −34%, cost per session −52%**; total spend flat since April while weekly active users grew **7×**. Levers: weekly frontier-vs-open-weight benchmarking on real work, cheap defaults for subagents, medium reasoning effort, prompt caching | uber.com blog *Efficient software factory* (Aug 2026) |
| **AT&T** | **Coding/advanced AI costs −56% while measuring a 2% drop in output quality** (LiteLLM routing: frontier for code-gen; Nemotron/Llama/Gemma for summaries and light work) | PYMNTS (Aug 2026) |
| **Factory Router** | Holds **99% of Claude Opus 4.7's pass rate** on Terminal-Bench 2 at **20% lower cost/session**; 43% aggregate savings in production. **And the honest negative:** pushed hard toward cheap models — 44% less cost but **19% fewer tasks finished** (Terminal-Bench 2); 70% less cost, **half as many finished** (Legacy-Bench) | factory.ai + docs.factory.ai |

### ● Attributed (company statements via press)

| Case | Claim / numbers | Source |
|---|---|---|
| **Revolut** | ~2,000 engineers; self-hosted **GLM-5.1 → 5.3** on **56 NVIDIA B200s**; default flipped from Claude Code/Codex (hybrid retained). **Blended $0.30/M tokens; invoice ~1/10 (≈90% cut)**; coding time **−60%**, task-to-merge **−70%** (sample of ~2,000 eng., AI Engineer conf. Oct 2026, David Abitbol). Prior spend $1k–10k/month for some individuals. Later: +76% req/s, −88% first-response | The Register & TechRadar (Nov 3–4, 2026); TechRound (Nov 9); shattered.io teardown (Nov 8) |
| **Airbnb** | Customer-service queries via **Alibaba Qwen** (open weights; Chesky: "Airbnb isn't an Alibaba customer… Chinese companies don't receive its data"). No cost figures published | TechRound (Nov 9, 2026); US House inquiry letter (Apr 29, 2026) |
| **DoorDash** | **Moonshot Kimi** for code review. No cost figures published | TechRound (Nov 9, 2026); House letter (Jul 31, 2026) |
| **Pinterest, Stripe, Coinbase** | "Cut AI bills by moving simpler workloads off frontier models; savings cluster around **50%**" | The Pragmatic Engineer, *The Pulse*, via codingscape; Databricks interviews |
| **Lindy (+ startup wave)** | Moving to DeepSeek / Moonshot / Alibaba "as US providers' usage pricing squeezes budgets" | Crypto Briefing (Oct 6, 2026) |

### ○ Secondary / academic anchors

| Source | Number(s) |
|---|---|
| **RouteLLM** (UC Berkeley / LMSYS) | ~**85%** cost cut on MT-Bench, ~45% MMLU, ~35% GSM8K at **~95% of GPT-4 performance** (GPT-4 ↔ Mixtral routing) |
| **FrugalGPT** (cascade) | 50–98% depending on dataset |
| **AgentRouter** (ICML 2026) | RouteLLM/FrugalGPT on *agent* workflows: 31%/44%; trajectory-aware router **72% at <3% task-completion degradation** |
| **Amazon Bedrock Intelligent Prompt Routing** | "up to 30%" |
| **Databricks AI Gateway Smart Router** | ">30%"; after interviewing Stripe/Uber/Ramp: *"The single greatest cost lever is moving coding spend to more efficient models as they are released."* |
| **vLLM Session-Aware Agentic Routing** | model switches **−79%** over 21,600 deterministic turns |
| **FT** (Sep 27, 2026) | "Corporate America embraces cheaper 'open' AI models" |
| **PYMNTS** (Nov 6, 2026) | "Tech Giants Ration Premium AI as Company Budgets Hold" (Apple rationing) |

## The verification gap — the article's thesis, said by others

- shattered.io (Nov 8, 2026), auditing the Revolut claims: *"The table says nothing about which model writes better code, since the reports give **no head-to-head quality benchmark**."* … *"Revolut has not published a full methodology. Until it does, the sensible reading is that the direction is credible and the exact multiple is a company-reported figure."* … the 10× excludes hardware, staff, monitoring, ops.
- codingscape: *"No published percentage is credible for your stack and workloads."* … *"Cheap routing looks like a win on your billing dashboard within hours. The cost lands days later in support tickets, and never on a cost report. That's why routing needs an eval gate."*
- The counter-example that proves the rule: **AT&T measured the quality cost (2%) alongside the savings (56%)** — almost nobody else does.

## Standard disclaimer block (for citing in the article)

> Cost and productivity figures in this section are **company-reported and unaudited** unless noted. AT&T is the only case here that measured **production** quality alongside the savings (−56% cost, −2% output quality); Factory reports **benchmark** quality alongside cost (99% of Opus 4.7's pass rate at −20% cost per session — and 19–50% fewer tasks finished when pushed toward cheap models). The rest report cost, and assert quality.

## Suggested citations for the article

- **Lesson 2 (industry made the same bet):** "The industry made the same bet this year: Revolut reported a tenfold cut in AI coding costs by making a self-hosted GLM-class model the default for ~2,000 engineers; Notion's router reports frontier-class results at ~90% lower cost across 20+ use cases; AT&T cut coding costs 56% — while measuring the 2% quality drop almost nobody else publishes (company-reported figures; AT&T 2026)."
- **What remains open (the gap):** "Every one of these teams still routes its hardest work to a frontier model — and almost none of them publish how they verified that the cheap model was still right. That verification is the missing component, and it is the subject of this article."
- **Submission letter hook:** "Revolut's cost story broke this month; the quality question it leaves open is exactly what this article answers — with receipts."

## ⚠ Not verified in this pass

- **Nubank, Mercado Libre** (in-house/Llama cost-per-query claims) — not surfaced by available search tooling.
- **37signals / DHH local-models stance** — not verified this pass (directional, no clean number found).
- **Klarna** — the famous "$40M / 700 agents" story is frontier-AI labor substitution, a different mechanism; the "in-house models" angle was not verified.

## Limitations of this pass

- Built-in websearch was unavailable; research ran on headless Chrome + news RSS + HN index. Fine for the 2026 wave, weaker for older engineering-blog claims (2023–24 cases like Notion's earlier autocomplete work, Ramp's fine-tuning posts, Nubank's talks were not directly reachable — the Oct 2026 Notion post supersedes them for our purpose).
- All company figures are as reported; nothing here is independently audited except where the source itself published method/eval detail (★ rows).
