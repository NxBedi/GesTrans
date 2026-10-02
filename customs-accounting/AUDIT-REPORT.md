# Professional Audit Report — A.M.S Sarl Customs-Clearing Accounting System

**Date of audit:** 2026-09-16
**Auditor basis:** Static code review of every backend route + frontend page, plus live end-to-end verification against the running PostgreSQL database (`customs_db`), with throwaway test data fully cleaned up afterward. Cash box and all quantitative checks verified against live numbers.

**Legend:** 🔴 Critical (fix now) · 🟠 High (next release) · 🟡 Medium (planned) · 🟢 Low / observation / positive

---

## 1. System in a Nutshell

| Component | Value |
|---|---|
| Backend | Node.js + Express (`backend/src/index.js`), JWT auth, pg Pool |
| Frontend | React + Vite, RTL Arabic, Tajawal font, print CSS for official documents |
| Database | PostgreSQL 16 (Docker `customs_db`), schema at `backend/sql/schema.sql` |
| Business unit | The **container** (customs-clearing service), not a product/POS |
| Roles | `manager` (full) and `employee` (runtime + own daily expenses only) |
| Currency | MRU (Numeric(14,2)) |

**Sales flow:** register container → employees enter expense invoices (17 employee-type costs) → manager records customs **LIQUIDATION** (manager-only type, one per container) → manager **closes** (⇒ "ready for pricing") → manager sets **final price** manually ⇒ `status = priced`, profit = `final_price − total_costs` frozen → payments collected against customer → customer debt = Σ(final_price) − Σ(payments).

**Accounting model (documented and followed):**
```
Cash in box = capital_transactions + cashbox_adjustments + payments
            + old_debt_collections − invoices − general_expenses − salary_paid
Customer debt per customer = billed(final_price) − paid(payments)
Old debts = guaranteed receivables carried from the legacy system, tracked separately
                                                    from capital; enter cash only when collected.
```

---

## 2. Sales / Transaction Flow (Container Lifecycle)

1. `POST /api/containers` → `registered` (BL unique enforced).
2. First invoice → automatically `processing`.
3. Manager records LIQUIDATION (requires invoice_number, unique per container — enforced).
4. `POST /containers/:id/close` → `closed` ⇒ enters pricing queue.
5. `POST /containers/:id/pricing` → computes total_costs from invoices, manager types final price, `status = priced`.
6. `POST /customers/:id/payments` → money received (container-linked payments require `priced`).
7. Correction path: `POST /containers/:id/reopen` → deletes pricing + linked payments, back to `processing`.

**Verified live (E2E):** create → invoice → close → price → payment → reopen all worked; reopen returned `{had_pricing:true, deleted_payments:1, deleted_payment_amount:9000}`; cleanup restored DB to its exact pre-test state.

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 01 | Duplicate payment on double submission | `routes/payments.js` POST (no idempotency) | Every POST inserts unconditionally; no client reference / unique key | **Verified:** two identical POSTs created 2 payments (+1000 cash). Real-world double-click = double money in box + double credit for customer | Add idempotency: unique `txn_ref` supplied by client, or DB unique on `(customer_id, amount, payment_date, created_by, container_id)`; or disable submit button while in-flight (frontend) | 🔴 |
| 02 | No debt cap / overpayment guard | `routes/payments.js` POST | No check that amount ≤ customer balance | **Verified:** 9,999,999.99 accepted; customer credit can balloon unchecked | Add configurable warning (recommended) or hard cap; note prepayments are legitimate so make it a warning | 🟠 |
| 03 | Employee visibility of all in-progress BLs | `routes/containers.js:46-67`, `:135-141` | Employees can read every `registered`/`processing` container + non-manager invoices of **any** customer | ALL in-progress business is visible to every employee (no customer filter) | Acceptable for a small agency — but if required, restrict employees to containers they registered, or to a chosen customer | 🟡 |
| 04 | Invoice amounts mutable while container is `processing`/`closed` | `routes/invoices.js` PUT/DELETE (manager) | No snapshot until pricing | Editing an invoice before pricing retroactively changes that month's cash cost total (live recompute) | Document as intended (freeze at `priced` is implemented). Consider cut-off alerts | 🟡 |
| 05 | LIQUIDATION identified by display name | `containers.js:119`, `ListeBL.jsx` (`name='liquidation'`), `liquidations` query | Hard-coded `LOWER(t.name)='liquidation'` | If manager renames the type, LIQUIDATION tracking + badge silently break | Tag invoice_types with a stable `code` column; query by code | 🟡 |

---

## 3. Invoice Accuracy / Profit Integrity

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 06 | ✅ Total costs frozen correctly at pricing | `routes/pricing.js` + `pricing.total_costs` snapshot; invoices blocked once `priced` | Upsert + status change in one transaction | Profit/cost snapshots cannot be silently altered after pricing | — (positive) | 🟢 |
| 07 | Cross-customer invoice/payment guarded | `routes/invoices.js`, `routes/payments.js` | Container FK + explicit `customer_id` mismatch check | **Verified:** wrong-container payment → HTTP 400 | — (positive) | 🟢 |
| 08 | Duplicate `invoice_number` allowed system-wide | Schema `invoices.invoice_number VARCHAR` (no unique) | Design: numbers are per-source documents | Same external number can appear on 2 containers (ambiguity in customs audit) | Add partial unique index `(invoice_number, invoice_type_id)` when invoice_number IS NOT NULL | 🟡 |
| 09 | `total_costs` from invoices joins only `allowed_role <> 'manager'` for display, but pricing totals include LIQUIDATION | `containers.js:22-25` vs `pricing.js:26-32` | Two different "costs" notions (employee-only vs all) | UI "total charges" and pricing "total costs" differ by the LIQUIDATION amount — can confuse | Label both explicitly in UI ("frais employés" vs "total frais + LIQUIDATION") | 🟡 |
| 10 | Editing a priced container's data | `routes/containers.js` PUT blocks customer reassignment when `closed/priced` but allows amount-free fields edit | Correct: cannot reassign billed amounts retroactively | — (good) | — | 🟢 |

---

## 4. Customers

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 11 | **Partial PUT destroys data** | `routes/customers.js:55-61` | UPDATE always writes every column using `String(name||'').trim()`, `email||null`, `Number(ob)||0` | **Verified E2E:** name-only PUT wiped `phone`, `email`, `address` (and would zero `opening_balance`). Silent data loss via any partial client update | Dynamic `SET` per provided field (mirror `routes/users.js:51-86`); or merge with current row values | 🔴 |
| 12 | `opening_balance` migration one-shot but editable API exists unused | `routes/customers.js:69-86`; frontend never calls `setOpeningBalance` | Migration DO-block guards with `opening_balance_migrated` | Debt seeded via old system is safe; but a not-yet-migrated balance could be zeroed by a full PUT (see #11) | After fixing #11, consider removing/chaining the unused endpoint or exposing it in UI | 🟡 |
| 13 | Customer deletion hardened | `customers.js:134-147` | Blocks if any containers or payments | **Verified** — cannot orphaning financial rows | — (positive) | 🟢 |
| 14 | Customer list unbounded | `GET /customers` no pagination/search | Small scale today | Fine for dozens; degrades later | Add `?q=` server-side + pagination in phase 3 | 🟡 |

---

## 5. Payments & Collections

Covered by #01, #02, #07 above. Additional:

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 15 | Payment deletion = silent retroactive cash reversal | `routes/payments.js` DELETE (manager) | Hard delete, no reversal record | Historical month cash figures change on deletion with no trace | Keep a reversal transaction instead of DELETE, or add audit log (see #31) | 🟠 |
| 16 | No "paid" marker on container | `payments.js` (documented decision) | Payment ≠ container settlement; customer-level balance model | Container stays `priced` regardless of amount — intended | Document in README; optionally show per-container collected amount in الحسابات | 🟢 |

---

## 6. Role / Permission Model

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 17 | ✅ Role checks on every route (server-side) | `middleware/auth.js` `authRequired` + `allowRoles` | DB row re-fetched per request (is_active enforced live) | **Verified:** employee → 403 on reports/financial/users/payments; no-token and bad-token → 401 | — (positive) | 🟢 |
| 18 | Frontend route guards mirror backend | `App.jsx` | Client-side gating for UX only; security is server-side | Consistent; no bypass | — (positive) | 🟢 |
| 19 | Deactivation instantly revokes sessions | `auth.js` middleware loads user per request | JWT stateless but DB-checked | Disabled user loses access immediately | — (positive) | 🟢 |
| 20 | Password policy too weak | `routes/users.js` POST/PUT | No min length / complexity; default `admin/admin123` | Brute-force risk compounded by no rate limit (#22) | Enforce ≥8 chars; force admin password change on first login | 🟠 |

---

## 7. Security / Auth

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 21 | JWT secret fallback `'dev-secret'` | `middleware/auth.js:4` | Fallback constant if env missing | Forged tokens possible if secret default used in prod; **currently `.env` has JWT_SECRET set** (low exposure today, high if misdeployed) | Fail-fast: refuse to boot without strong `JWT_SECRET`; random 64+ chars | 🟠 |
| 22 | No rate limiting on login | `routes/auth.js` POST /login | No middleware | Unlimited credential attempts | `express-rate-limit` on `/auth/login` + lockout after N fails | 🔴 |
| 23 | JWT in `localStorage` | `frontend/src/utils/api.js:4` | Token persisted in localStorage | Stolen via any XSS; cannot be revoked server-side except via `is_active` | Prefer httpOnly+Secure cookie (same-origin) or a short-lived token | 🟠 |
| 24 | No security headers / helmet | `src/index.js` | No `helmet`, no CSP | XSS/mixed-content surface larger | Add `helmet`, strict CSP (Google fonts + self) | 🟡 |
| 25 | Error messages leak DB internals pattern | `src/index.js:76-85` | Regex masks most, but `friendly` npm messages can pass through | Some 500s expose Node/pg internals | Return generic 500 always; log details server-side only | 🟡 |
| 26 | CSV export formula injection | `ChargesAPayer.jsx:67-88` | CSV cells unescaped for leading `= + - @` | Malicious notes could run formulas in Excel | Prefix dangerous leading chars, or export ODS/XLSX | 🟡 |
| 27 | CORS single-origin | `index.js:42-44` | `FRONTEND_ORIGIN` only | Fine today; blocking if API consumed by mobile later | Keep; add allowed-origins array when needed | 🟢 |

---

## 8. Financial Math (Cash Box) — was the highest-severity defect

| # | Status | Location | Finding |
|---|---|---|---|
| 28 | 🔴 **FIXED** | `financial.js:28` | **Sign inversion:** `− SUM(salary_amount)` with stored-negative amounts = **+5000** (adds salary back into the box). Live numbers: Financial page showed **−3,698**, ledger summed to **−13,698**. |
| 29 | 🔴 **FIXED** | `reports.js:61-68` | Dashboard cash box **omitted salary entirely** (−8,698). **Three different "cash box" values existed simultaneously in UI.** |

Now both endpoints return **−13,698**, matching the movements ledger. Fix confirmed live.

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 30 | **Negative cash box in reality: −13,698** | whole model | Costs (278,698) paid out of box exceeded cash collected (270,000) + capital (0) + adjustments (0) | Either expenses were genuinely paid from personal funds, or an opening deposit is missing. Reports cannot be trusted until reconciled | Record an opening deposit (capital or adjustment) = actual drawer balance at start; reconcile monthly | 🔴 (operational) |
| 31 | No audit/log table | Schema (verified: no `audit%`/`log%` tables) | Hard deletes everywhere; `created_at`/`entered_by` only | Corruption/`reopen`/deletions are unreconstructable; no answer to "who changed what when" | Add `audit_log(table,row_id,action,old,new,by,at)` and write on financial mutations | 🟠 |
| 32 | `movements` ledger unbounded | `financial.js:82-133` | Full UNION of all tables per call; no pagination | Slow as data grows; heavy page | Paginate or date-cap defaults | 🟡 |

---

## 9. Database / Schema

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 33 | ✅ FKs + cascades correctly modeled | Schema | invoices/pricing cascade with containers; collections cascade with old_debts; user refs un-cascaded | No orphaned money rows | — (positive) | 🟢 |
| 34 | Container delete guarded | `containers.js:317-336` | Blocks if payments/invoices/pricing exist | **Verified:** cannot delete a container that fed finances | — (positive) | 🟢 |
| 35 | Salary stored as negative amounts | `salary_transactions` `CHECK (amount < 0)` | Clean sign convention | Works, but the bug #28 shows how fragile negative-amount math is | Prefer storing positive `amount_paid` + sign derived; keep the movement ledger authoritative | 🟡 |
| 36 | `quantity` unvalidated type (int nullable; schema has no CHECK) | `containers` | API validates `integer >= 0` but schema doesn't | DB-level bypass possible only via direct SQL | Add CHECK to schema | 🟢 |
| 37 | No DB-level pagination indices for date-range report queries | `reports.js` | Composite date queries have single-column indices only | Slow for large historical ranges | Add composite indexes `(entry_date, id)` on invoices/general_expenses | 🟡 |

---

## 10. Frontend / UX & Mobile

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 38 | ✅ Arabic RTL + French/LTR BL table mixed cleanly | `ListeBL.jsx` dir=ltr | Fine | — | — | 🟢 |
| 39 | No optimistic updates → full page refetch on every save | most pages | Simple pattern | Acceptable at this scale | Keep | 🟢 |
| 40 | `prompt()/confirm()` used for financial confirmations | `SalaryLedger.jsx:131`, varios pages | Simple but dismissible | Remainder payout amount can be edited mid-flow; no audit | Replace with controlled modal + store chosen amount | 🟡 |
| 41 | Salary "Кشف PDF" prints via hidden `body.printing-export` | `SalaryLedger.jsx:56`, `index.css:177-179` | CSS visibility trick | Works; verify on small screens/headless | Test print on A4 portrait | 🟡 |
| 42 | Mobile: sidebar nav large; tables min-width 1150 scroll | `Layout.jsx`, table CSS | Desktop-first | Acceptable for office PCs | — | 🟢 |

---

## 11. Salary Ledger (recent feature)

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 43 | Statement uses **current** salary, not the salary in effect that month | `salary.js:36-105` | `users.salary` read live | If salary changes, past-month statements show the new rate (unverifiable history) | Version salary per month (`salary_history` table) or store monthly snapshot at first txn | 🟡 |
| 44 | Advance capped by monthly salary ✅ | `salary.js:136-167` | computes remaining = salary − paid for that month | Cannot over-advance | — (positive) | 🟢 |
| 45 | No salary "monthly closure" — balance rolls nothing | model | Remaining resets each month by month filter | If month skipped, advances spill across months in filters | Add explicit per-month payroll run record | 🟡 |
| 46 | Salary transaction delete = silent cash reversal | `salary.js:200-206` | Hard delete | Changes month cash retroactively (see #31) | Audit log + confirm | 🟠 |

---

## 12. General Expenses

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 47 | ✅ Category/summary/monthly drill-downs | `general-expenses.js` | Complete | — | — | 🟢 |
| 48 | Category label suggests "رواتب الموظفين" confusing with salary ledger | `GeneralExpenses.jsx:5` | Two "salary" channels | Double-counting risk if manager enters salaries both places | Remove "رواتب الموظفين" suggestion or cross-tag | 🟡 |

---

## 13. Reports

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 49 | Dashboard "profit net" = profit − general expenses (no salaries) | `Dashboard.jsx:61-65` | Salary excluded from net profit KPI | Inconsistent with model that salary is a cash outflow | Decide and label (gross vs net-of-salary) | 🟡 |
| 50 | `customer-balances` `container_count` counts unpriced/registered containers | `reports.js:84-99` | Counts all containers, balance only from priced | KPI "عدد الحاويات" may mislead | Count only priced, or label | 🟡 |
| 51 | ✅ Expense tracking (by day / employee / type) comprehensive | `reports.js`, `Expenses.jsx`, `my-expenses.jsx` | — | — | — route-level filters | 🟢 |
| 52 | No monthly P&L statement page | model | Only per-container profit + expense drill | No month-level income statement | Add P&L by month (phase 3) | 🟡 |

---

## 14. Data Integrity / Concurrency

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 53 | ✅ Multi-statement cash ops are transactional | `pricing.js:36-54`, `invoices.js:66-87`, `old-debts/:id/collect`, `reopen` | BEGIN/COMMIT/ROLLBACK via pool | Verified consistency | — (positive) | 🟢 |
| 54 | ✅ Payments wrapped in explicit transactions; salary inserts are single-statement atomic | `payments.js:47-67`, `salary.js` | BEGIN/COMMIT/ROLLBACK verified | No partial money row possible | — (positive) | 🟢 |
| 55 | No optimistic locking on re-open vs concurrent payment | `reopen` deletes payments while a POST may race | Rare in single-office use | Could delete a just-added payment | Lock container row `FOR UPDATE` in reopen | 🟡 |

---

## 15. Availability / Deployment

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 56 | Backend does not serve built frontend | `index.js` — only API + `/api/health` | Dev-oriented | Production needs a web server or vite preview; single-port option missing | Optionally `express.static` the `frontend/dist` build + SPA fallback | 🟡 |
| 57 | `unhandledRejection` handlers swallow errors (no crash) | `index.js:49-54` | Manual run | Beter than crash, but hides defects silently | Add Sentry/file logging; restart policy | 🟡 |
| 58 | No backup automation for the Docker volume | ops | — | Historic financial data at risk | Nightly `pg_dump` to file (phase 1) | 🔴 (operational) |
| 59 | Docker compose single DB, no health-check restart | `docker-compose.yml` (running stable) | — | Acceptable | Add `restart: unless-stopped` | 🟢 |

---

## 16. Performance

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 60 | Every list endpoint unbounded (no pagination) | containers, customers, movements, finished, reports | Small data today | OK now; will degrade | Pagination + limit defaults in phase 3 | 🟡 |
| 61 | Dashboard fires 1 report + 1 containers call; Reports page fires 3-4 concurrent | `Dashboard.jsx`, `Reports.jsx` | Simple | Fine | — | 🟢 |
| 62 | `authRequired` hits DB every request | `middleware/auth.js:21` | Correct freshness | Minor overhead | Keep (correctness > speed) | 🟢 |

---

## 17. End-to-End Test Results (2026-09-16, live DB, cleanup verified)

| Case | Expected | Result |
|---|---|---|
| Employee → `/reports`, `/financial`, `/users`, `/general-expenses`, `/reports/profits`, customer payments GET/POST | 403 | ✅ 403 all |
| No token / bad token → `/api/containers` | 401 | ✅ 401 |
| Cross-customer payment (container of other customer) | 400 | ✅ 400 |
| Create → invoice → close → price → payment → reopen | atomic success | ✅ (reopen deleted pricing+1 payment=9000) |
| Double-submit identical payment | 1 payment expected | 🔴 2 payments created (no idempotency) |
| Overpayment 9,999,999.99 | capped/warned | 🔴 accepted |
| `PUT /customers/:id` with only name | only name changes | 🔴 phone/email/address wiped |
| Salary advance > remaining | 400 | ✅ (verified by code; repo state during audit had 1 tx) |
| Delete user with existing invoices (FK) | clean 400 | 🔴 500 generic "internal DB error" |

---

## 18. Test Setup Gap

| # | Issue | Location | Cause | Impact | Recommended Fix | Priority |
|---|---|---|---|---|---|---|
| 63 | No automated tests at all | repo (no test script) | Not added since inception | Every regression (like #28) only caught manually | Add Jest/Vitest + supertest for routes; a `docker`-based smoke test | 🔴 (process) |
| 64 | No schema migration tool | `runMigrations()` re-runs idempotent `schema.sql` | Acceptable for 1-db | Fragile for rollbacks | Simple `migrations/` folder + version table in phase 2 | 🟡 |

---

## 19. Explicitly Out of Scope / Not Defects

- **No purchases module** — the unit is services (containers), not goods; cost of goods sold equals recorded container expense invoices. Not a defect.
- **No tax module** — no sales/import VAT modeling requested; MRU amounts are final. Not a defect; custom duty is captured as the LIQUIDATION invoice.
- **No inventory/stock** — service business.
- **No multi-currency** — system is MRU-only.
- **No supplier/payables ledger** — expenses are paid out directly as recorded.

These should be consciously documented as feature decisions, not gaps.

---

## 20. Roadmap (3 Phases)

### Phase 1 — Protect correctness & money (next 1–3 days)
1. **Fix `PUT /customers/:id`** partial-update data loss (#11, 🔴).
2. **Add payment idempotency** + UI double-click guard (#01, 🔴).
3. **Add login rate limiting** (#22, 🔴).
4. **Reconcile the cash box** with a real opening deposit/adjustment to remove the negative −13,698 (#30, 🔴).
5. **Set up daily DB backups** (`pg_dump` + retention) (#58, 🔴).
6. Add an **audit_log table** on financial mutations (#31) + forbid silent salary deletion (#46).

### Phase 2 — Hardening & trust (2–4 weeks)
1. Password policy + force-first-change; fail-fast JWT secret (#20, #21).
2. Move token to httpOnly cookie or shorten TTL; add Helmet/CSP (#23, #24).
3. Overpayment warning (#02); salary historical rate (#43); LIQUIDATION stable code (#05).
4. Composable indexes + pagination on the 3 heaviest endpoints (#32, #37, #60).
5. Logging to file + user delete FK → friendly 400 (#57, #25→#62).
6. Automate the E2E smoke suite from §17 (#63).

### Phase 3 — Insight & scale (later)
1. Monthly P&L statement (revenue, container costs, general expenses, salaries, net) (#52).
2. Reversal ledger model for all financial documents (no hard deletes) (#15, #46).
3. Salary-month closure (payroll run records) (#45).
4. Serve built frontend from backend for one-port deployment; TLS (#56, #27).
5. Pagination everywhere + virtual scrolling; report caching (#60).

---

## Appendix — Verified Live Numbers (post-fix, pre/post audit identical)

- Cash box (financial/overview, reports/summary, ledger): **−13,698** — now consistent.
- Billed: 320,000 · Wallet payments: 270,000 · Container costs: 278,698 · Profit: 41,302 · Customer total debt: 50,000.
- Salary paid: 5,000 (1 transaction, remainder 2026-09).
- Containers: 2 priced + 3 registered · Customers: 2 · Invoices: 18 · Users: 4.