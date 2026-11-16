# Odoo reference — research index

This folder is AfriCore's persistent research memory for the official Odoo
Community Edition source tree. It records what we study, what we conclude, and
what we decide as a result. It is **not** a mirror of Odoo documentation and it
is **not** an AfriCore implementation backlog.

## Where things live

| What | Absolute path |
| --- | --- |
| AfriCore project (implementation) | `C:\Users\cypri\OneDrive\Desktop\AfriScore\afriscore` |
| Odoo Community Edition (read-only reference) | `C:\Users\cypri\OneDrive\Desktop\AfriScore\odoo-reference` |
| Odoo research memory (this folder) | `C:\Users\cypri\OneDrive\Desktop\AfriScore\afriscore\docs\odoo-reference` |
| Multi-root VS Code workspace | `C:\Users\cypri\OneDrive\Desktop\AfriScore\AfriCore-Odoo-Reference.code-workspace` |

The two Git repositories are independent siblings. Neither one is a submodule,
worktree, or remote of the other. Do not add `odoo-reference` to AfriCore's
Git index and do not add AfriCore to any Odoo index.

## Pinned reference state

- Repository: https://github.com/odoo/odoo
- Branch: `20.0` (single-branch clone)
- Pinned commit: see [SETUP.md](SETUP.md) — it is the authority; this file is
  not kept in lockstep with the clone.
- Update procedure and read-only enforcement: see [SETUP.md](SETUP.md).

## Files in this folder

| File | Purpose |
| --- | --- |
| [SETUP.md](SETUP.md) | Provenance of the clone: URL, branch, commit, host, clone command, read-only enforcement, how to refresh it. |
| [RESEARCH_LOG.md](RESEARCH_LOG.md) | Append-only dated log of what was read and what was learned. One entry per investigation session. |
| [MODULES.md](MODULES.md) | Index of Odoo modules actually studied, each linked to its notes file. Starts empty on purpose. |
| [GLOSSARY.md](GLOSSARY.md) | Odoo concept/model name → AfriCore concept mapping, populated only after verification in source. |
| [PATTERNS.md](PATTERNS.md) | Reusable engineering patterns observed in Odoo, each with the file that proves it and the AfriCore applicability verdict. |
| [DECISIONS.md](DECISIONS.md) | Decisions AfriCore took (or rejected) because of Odoo evidence, with rationale and the note that triggered it. |

Per-module deep dives, when they happen, go in `notes/` as
`notes/<module_name>.md` and are registered in [MODULES.md](MODULES.md).

## Rules of engagement

1. **Odoo source is read-only.** Read it, grep it, `git log`/`git blame` it.
   Never edit, format, patch, reformat, or check out another branch in it. See
   the enforcement section in [SETUP.md](SETUP.md).
2. **Study on demand, never in bulk.** There is no "analyze all of Odoo"
   task. Every investigation starts from a concrete AfriCore question, and
   notes record the question first.
3. **Cite the evidence.** Every claim in a note names the file path inside
   `odoo-reference` (for example `odoo/addons/account/models/account_move.py`)
   and, where it matters, the function. A claim without a path is a hypothesis,
   and must be labelled as one.
4. **Separate observation from decision.** `RESEARCH_LOG.md` and module notes
   record what Odoo does. `DECISIONS.md` records what AfriCore chose. Never
   blend them in one bullet.
5. **Odoo is prior art, not authority.** Odoo's behaviour does not override
   AfriCore's own constraints in `AGENTS.md`, the security register, or the
   financial/provenance rules. Where the two conflict, AfriCore wins and the
   conflict is written down.
6. **No code copying without a licence review.** Odoo Community is licensed
   LGPL-3.0. Copying source into AfriCore changes AfriCore's licensing
   obligations. Record the intent in `DECISIONS.md` and flag it for owner
   approval before any code is transcribed; prefer re-implementing the idea.
7. **Do not touch AfriCore application code from a research task.** A research
   pass produces notes and, at most, a proposal.

## Working loop

1. Write the question at the top of a new `RESEARCH_LOG.md` entry.
2. Read the minimum set of Odoo files that answer it.
3. Record findings with exact paths in the log, or in `notes/<module>.md` if the
   dive was substantial.
4. If a reusable pattern emerged, add a row to `PATTERNS.md` with an
   applicability verdict (`adopt` / `adapt` / `reject`).
5. If a decision was made, add an entry to `DECISIONS.md` and, when it changes
   AfriCore's plan, update the relevant AfriCore doc.
