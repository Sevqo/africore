# Bank reconciliation checkpoint

AfriCore baseline d70e55b3292211f50048e47fc188f167c2086554. Odoo 20 Community baseline 4968b8772ab96e25471ebbcdcbe32f6049e5b728.

## Source and implementation choices

| Odoo source | Behavior | AfriCore implementation |
|---|---|---|
| addons/account/models/account_bank_statement.py, `_compute_balance_end`, `_compute_is_complete`, `_compute_is_valid` | Compare opening plus movement with reported close, and check continuity | Require the exact reported close during import. Opening balances are entered explicitly for each import. |
| addons/account/models/account_bank_statement_line.py, `_get_default_amls_matching_domain`, `_get_statement_line_residual_amounts`, `_seek_for_lines` | Select eligible move lines and measure remaining value in the appropriate currency | Use scoped, same-currency and same-direction posted bank-account lines. Subtract active links on both sides. |
| addons/account/models/account_reconcile_model.py, matching rule validation and partner mapping | Apply known rules to candidates | Rank existing evidence by reference, amount and date. Use the canonical journal contact as an optional filter. A score never approves a match. |
| addons/account/models/account_partial_reconcile.py, account_full_reconcile.py, account_move_line.py | Match underlying move-line residuals and account for exchange differences | Apply exact or partial statement links. A same-currency match only consumes the bank evidence capacity of an existing posted line. |
| addons/account/models/account_bank_statement_line.py, `action_undo_reconciliation`, and wizard/account_unreconcile_view.xml | Check review rights before undoing the match | Require a reversal request, separate current owner/admin review and apply. Append the history and release the link's capacity. |
| addons/account/models/account_journal.py, account_move.py, and security/ir.access.csv | Bank journal, posted move and company scope | Reuse AfriCore's accounting journals, accounts, journal approval and tenant rules. |
| addons/account/views/account_bank_statement_views.xml, views/account_reconcile_model_views.xml, and tests/test_account_bank_statement.py and test_account_move_reconcile.py | Journal-scoped register, search, details and reconciliation operations | Use AfriCore's Accounting shell with bank selection, register, unmatched report, candidate list, decisions and line history. |

REA MCP inspected a scratch compilation of the pinned statement-line module. Evidence ev_a2c2c33195009e9565d4c7a1535641e1a9f3b5d945c7c7401085911ce299d489 identified the matching domain, residual and undo methods. The source importer remains subject to the Windows limitation recorded in checkpoint 1.

Python in `python/africore_accounting/bank.py` adapts the domain behavior using the standard library. The Odoo ORM models depend on move-line relationships, recordsets and company context. AfriCore retains the journal and payment authorities. The CSV schema is an AfriCore contract. No standalone Community bank statement import addon or account_accountant addon is present in this pinned checkout.

## Workflow and API

In **Accounting → Bank and Cash**, create a journal under **Configuration → Journals** if needed. Set it up as a bank journal by selecting an active asset account and currency. Import a UTF-8 CSV with columns `date,reference,description,amount,currency`. Negative amounts are money out. The opening balance plus signed transactions must equal the closing balance. Duplicate files return the original statement. Repeated references within or across files are rejected for the same bank journal.

Open a statement or a row in the unmatched report. Inspect a candidate's posted journal entry, remaining amount and reasons. Submit an exact or partial proposal. A different owner or administrator approves or rejects it. Apply the approved decision explicitly. Reversal follows the same separate-person approval model. The posted entry keeps its original amount and version. Entries with active bank links must be unlinked before a journal reversal can post.

All paths below are relative to `/api/v1/organizations/{org}/accounting`:

| Method | Path | Result |
|---|---|---|
| GET, POST | /bank-journals | List or configure a journal/account/currency link |
| GET | /bank-journals/{id}/unmatched | Page unmatched and partially matched lines across statements |
| GET, POST | /bank-statements | Page the register or import a file |
| GET | /bank-statements/{id} | Statement balances, count/amount summary, and paged searchable lines |
| GET | /bank-lines/{id} | Statement row, posted candidates, decisions and paged history |
| POST | /bank-lines/{id}/matches | Submit an amount and target journal line for review |
| POST | /bank-matches/{id}/decision | Approve, reject, apply, request reversal or withdraw |

The TypeScript API remains the authorization and persistence boundary. It uses existing encrypted ERP objects for bank journals, statement headers, lines and match links. History and idempotency use the existing ERP store. Writes serialize under the current workspace lock. Capacity and reviewer authority are rechecked at application. There is no migration. Render schema verification remains enabled. Hosted migration ledger and backup readiness are still separate deployment prerequisites.

## Performance and acceptance

A single Python subprocess parses up to 200 transactions per import. The register and report read stored records. A line review ranks at most 100 candidates in one subprocess. The process receives only the selected journal scope's candidate data and uses an eight-second timeout and bounded output. Local medians over five child process invocations were 259 ms for a 200-line CSV and 295 ms for 100 candidate scores, including Windows process startup. These are local measurements of Python calls, without database or HTTP overhead.

The synthetic journey creates a bank journal, verifies exact CSV balances and duplicate detection, finds a canonical posted payment candidate and same-currency journal entries, rejects an incorrect match, approves and applies partial and exact links, inspects the unmatched report and history, and reverses an approved link. It verifies that the original posting remains unchanged. The extended fixture also exercises workspaces and concurrent attempts to consume the same capacity.

- SQLite: 18 focused Accounting tests passed.
- PostgreSQL 17: 18 focused Accounting tests passed against a fresh local database. The test server was stopped afterward.
- Python: all 9 unit tests passed, including the bank parser and ranking tests.
- The backend build and platform contract check passed with 569 operations.
- The website production build and all 149 website checks passed. Lint, architecture and fixture isolation checks passed.

## Visual acceptance

The Odoo 20 reference documents journal-level navigation, a transaction list, a partner filter and access to the underlying journal entry. The AfriCore view keeps the existing app shell and adds a journal selector, a statement register, a separate candidate and decision area, and an unmatched report. Its apply step follows a separate reviewer decision. See the [Odoo 20 documentation source](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/bank/reconciliation.rst), [Bank Matching reference screenshot](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/bank/reconciliation/user-interface.png), and [bank journal navigation screenshot](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/bank/reconciliation/bank-card.png).

The in-app browser timed out opening the local synthetic sign-in page. There is no authenticated UI capture or comparison at matched dimensions for this checkpoint. The browser timeout also leaves mobile rendering and interactive validation open.

## Remaining coverage

The implemented workflow reconciles bank evidence to existing posted entries. Unposted or unallocated payments require their normal Finance and Accounting steps first. FX gains/losses, suspense posting, automatic creation of payment records, tax cash basis corrections, and cross-statement opening-balance continuity require separate workflows. Each import accepts up to 200 transactions and candidate search covers a 31-day window on either side of the transaction date.
