# I made AI review its own code the way humans reviewed it in 1976

*Draft for dev.to / Medium / personal blog — Kiroween 2026 blog bonus. Publish publicly, then link it in the Devpost submission.*

In 1976, Michael Fagan published a paper at IBM that quietly outperformed everything we've tried since: *Design and Code Inspections to Reduce Errors in Program Development*. Formal code inspection — with defined roles, checklists, and a moderator who is not the author — found defects at rates testing teams only dreamed of. Then the industry collectively forgot about it, because inspections are expensive and humans are slow.

Here's the thing: AI-generated code has made inspections cheap to run and terrifyingly necessary at the same time.

## The problem nobody talks about

When an agent writes your diff, the usual review loop degrades into rubber-stamping. The PR looks plausible. The author is a machine that doesn't get tired, doesn't get embarrassed, and — critically — doesn't actually know what it intended. Traditional inspection assumed the author could answer the question "what did you mean here?" With AI-written code, there is no authorial intent to interrogate. There is only what the code does.

So I built Fagan's Ghost: a resurrection of formal code inspection where the inspection *team* is a panel of AI roles — Moderator, Reader, Tester — and the human is the final authority. The machine-written change gets machine-speed scrutiny, but the verdict stays human.

## How it works

Every PR becomes an inspection meeting:

1. The **Reader** paraphrases the diff — not what it claims to do, what it actually does, in plain language. Paraphrasing is the heart of Fagan inspection: you cannot paraphrase code you don't understand, and mismatches between intent and paraphrase are where defects live.
2. The **Tester** role hunts for concrete defects with a checklist derived from the inspection literature.
3. The **Moderator** keeps the meeting honest — no defect gets fixed quietly, everything is logged, and findings are verified against ground truth (like git history) before they can block.
4. The human reviews the inspection record and makes the call: defect or waiver. Waivers are explicit, permanent, and visible — you can't sweep a finding under the rug by ignoring it.

One of my favorite moments from the real inspection that ships with the repo: the Tester flagged a "defect" — a function that looked wrong. The verification step checked it against the actual repository history and proved it a *false positive*. In a human inspection, that's an embarrassment. In Fagan's Ghost, it's a recorded, inspectable data point that made the system better.

## What building it with Kiro was like

The `.kiro` directory is in the repo because the project is a Kiro artifact as much as a product: specs, steering documents, agent hooks. The commit-gate hook was my favorite experiment — Kiro refusing to let me commit code that hadn't passed inspection. (Yes, I tested it in a scratch repository first. No, I will not tell you how many attempts it took.)

## Why this matters now

We are about to drown in machine-written code. The industry's answer so far has been "have another machine glance at it" — one agent, one pass, one opinion. Fagan's insight was that *structured disagreement* finds what individual review misses. Roles that must paraphrase, must verify, must justify — that structure is what inspection means, and it turns out agents can hold those roles just fine.

The ghost of a 1976 IBM process, it turns out, is exactly the reviewer your AI-written PR needs.

---

*Fagan's Ghost is open source (MIT) and entered in Kiroween 2026 (Resurrection category). Repo: https://github.com/himanshu748/fagans-ghost — inspection viewer: https://himanshu748.github.io/fagans-ghost/*
