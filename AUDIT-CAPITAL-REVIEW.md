# Review: Capital / Cash Box / Cash logic

**Scope:** analysis only — no code or database changes made.
**Live data snapshot (2026-09-16):** `capital_transactions`: 0 rows · `cashbox_adjustments`: 0 rows · cash box current = **7,552** (payments 270,000 + old-debt collected 31,250 − invoices 278,698 − salary 15,000).

---

## 1. Current logic

Every money figure is **derived at query time**, never stored as a fixed balance:

| Concept | Where defined | Formula |
|---|---|---|
| Cash box / cash / capital | `financial.js:21-29` | `Σcapital_transactions + Σcashbox_adjustments + Σpayments + Σold_debt_collections − Σinvoices − Σgeneral_expenses + Σsalary_transactions` |
| Reports `cash_box` | `reports.js:61-69` | identical formula |
| Movements ledger | `financial.js:93-130` | a UNION of all 7 streams above (the authoritative transaction list) |
| Monthly box report | `Financial.jsx:116-129` | running in/out per month, derived from all movements |

Key docstring, `financial.js:9-15`: *"إجمالي رأس المال = النقدية الفعلية في الصندوق فقط"* (capital = actual cash in box). Enforced at `financial.js:55,66-69`: `capital = cash_capital = cash_box = cashTotal` — **three named figures that are exactly one computed number.**

- Contributions are stored as free-text rows: `capital_transactions(amount, txn_date, notes)` — multiple rows are already allowed (no single-figure column, no UNIQUE constraint, only `CHECK (amount <> 0)`, schema.sql:132-140).
- `cashbox_adjustments` (schema.sql:143-151) is a structurally identical channel used for opening seed or manual corrections.
- No code anywhere caps a withdrawal, rejects a negative box, or limits capital (grep for capital/cash validations found none — salary advance and old-debt collection are the only capped operations).

## 2. Problems found

**P1 — Conceptual collision (the core issue).** The headline "رأس المال" is defined as and display-equal to the net liquidity of *all* transactions. So the "capital" number moves with every customer payment, every expense, and every salary. It is really the **cumulative operating cash position**, not invested capital. Today it's 7,552 with **zero capital contributions ever recorded** — i.e. the UI is calling the operating cash residue "capital".

**P2 — Owner contributions are indistinguishable from operating flows.** A deposit can be booked through *either* `capital_transactions` *or* `cashbox_adjustments` — same effect, two separate ledgers and two lists in the UI (`Financial.jsx:381-430`). There is no `source`/`contributor` dimension, so "how much did each partner put in, from which source" cannot be answered or reported; sources exist only as free-text notes.

**P3 — No reconciliation identity.** Because capital is a residue, not a tracked quantity, the accounts cannot be reconciled to anything real (physical drawer count, invested amounts). The UI still renders red for negative `cash_box` (`Dashboard.jsx:42`, `Financial.jsx:227`), implying an expectation of a non-negative balance that nothing in the code actually guards — a signal with no underlying control.

**P4 — Two overlapping "deposit" mechanisms.** `capital_transactions` and `cashbox_adjustments` duplicate each other's purpose; there is no rule about which one represents owner money vs. cash-in-hand reconciliation. This makes entries ambiguous and prevents unified source reporting.

## 3. Effect on expenses, debts, profits

Good news: these are **already independent of capital** — they must remain so:

- **Expenses** — container costs (Σinvoices), general expenses, and salaries are deducted inside the box formula but their own tracking (pricing `total_costs`, `general_expenses` list, salary ledger) does not read the capital figure. Independent. ✅ preserved.
- **Debts** — `customer_debt = billed − paid` (`financial.js:63`), and old debts are tracked as separate receivables that only enter the box when collected (`financial.js:242-273`). Independent of capital. ✅
- **Profits** — `pricing.profit = final_price − total_costs`, dashboard net = profit − general expenses. Domestic figure, independent. ✅

The only entanglement is the **headline number**: labeling the cumulative transaction residue as "capital" misstates everything else. Profits/debts/expenses are unaffected by the fix below.

## 4. Proposed solution (awaiting approval)

### Recommended: Option A — decouple concepts; add a source axis (medium effort)
1. **Do not store capital as a balance** — keep all figures derived from actual recorded transactions (already true; the formula stays).
2. **Split the concept, not the data:** return three figures
   - `cash_box` — transaction-derived liquidity (unchanged formula). The movements ledger is the supporting detail.
   - `capital_invested` — `Σ capital_transactions` only (owner deposit/withdrawal net), presented as "رأس المال المستثمر (مساهمات المالك)".
   - `operational_cash_result` — `cash_box − capital_invested` (≈ cumulative operating result = profit realized in cash + receivables timing).
3. **Add a `source` dimension to owner money:** `ALTER TABLE capital_transactions ADD COLUMN source VARCHAR(120)` (null = "أموال شخصية غير مصنفة"). Optionally a small `capital_sources` lookup later if partners are formalized.
4. **Redelegate `cashbox_adjustments`** to pure cash reconciliation (physical count / opening cash in hand), no longer as an owner-investment channel; adjust UI wording.
5. **Update UI wording only** (`Financial.jsx:7,136,227-229,265-280`, `Dashboard.jsx:42-43`): label the residue card "نقدية الصندوق (محصلة الحركات المسجلة)" and keep "رأس المال المستثمر" as its own card fed by `Σ capital_transactions`.

### Alternative B — unified money journal (larger effort)
Merge all 7 streams into one `money_ledger(stream_type, direction, source, date, amount, ref)` written going forward; the box becomes a pure `SUM` over that journal; capital sources become `source` rows. Cleanest long-term but a full migration of the ledger + all list endpoints + UI.

### Alternative C — relabel only (cheapest)
Keep everything, just stop calling the residue "capital" (rename cards/no change to math). Leaves P2/P4 (two overlapping deposit channels, no source dimension) unsolved.

**Recommendation:** Option A — it directly realizes the requested direction (multi-source capital with no fixed total + cash box derived only from recorded transactions) without a risky rewrite, and preserves expenses/debts/profits exactly as they are.

## 5. Impact on existing data & migration plan

- **Current live data makes migration trivial:** `capital_transactions` and `cashbox_adjustments` are both empty (0 rows). No capital figure exists to migrate, and `cash_box` = 7,552 is purely operating residue.
- **Schema change:** add nullable column (Option A) — zero effect on existing rows; no backfill needed (future entries with no source show as unclassified).
- **Numbers:** `cash_box` stays 7,552 (formula untouched). New `capital_invested` = 0 until the first owner contribution is recorded — which finally matches reality.
- **No data deleted, no feature removed.** Old "capital" API fields (`capital`, `cash_capital`) can be kept as aliases during transition, then dropped.
- **Rollout:** (1) schema column → (2) backend overview adds `capital_invested` + `operational_cash_result` → (3) Financial.jsx/Dashboard wording & cards → (4) re-verify 3-way consistency (overview = summary = ledger). Backward compatible at each step.

---

*Deliverable for the requested review. Awaiting your approval before any implementation.*