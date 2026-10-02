-- ============================================================
-- Customs clearance accounting system - PostgreSQL schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'employee', -- 'manager' | 'employee'
  salary        NUMERIC(14,2) NOT NULL DEFAULT 0, -- الراتب الشهري الثابت (مرجع أساسي في كشف الحساب)
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ---------- customers ----------
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  phone      VARCHAR(50),
  email      VARCHAR(100),
  address    TEXT,
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0, -- debts carried from the previous system
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migration for databases created before opening_balance existed
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
-- الدين القديم يبقى داخل حساب كل زبون (opening_balance) ويُسدد بالإيداع مثل بقية الحسابات
ALTER TABLE customers DROP COLUMN IF EXISTS opening_balance_migrated;
-- تاريخ الاستحقاق: تاريخ واجب السداد لكل زبون (خاضع للديون الحالية) لإظهار حالة دين (مستحق/متأخر)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS due_date DATE;

-- ---------- customer old debts (دين قديم / رصيد سابق لكل زبون) ----------
-- رصيد سابق يُسجَّل داخل حساب الزبون بتاريخه الأصلي؛ يظهر في كشف الحساب،
-- يرفع رصيد الدين لدى الزبون، ولا يؤثر أبداً على الصندوق أو رأس المال (ليس حركة نقدية).
CREATE TABLE IF NOT EXISTS customer_old_debts (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'old_debt', -- علامة توضح نوع القيد: "old_debt" (رصيد سابق)
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  debt_date   DATE NOT NULL,
  notes       TEXT,
  entered_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_old_debts_customer ON customer_old_debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_old_debts_date ON customer_old_debts(debt_date);

-- ---------- containers ----------
CREATE TABLE IF NOT EXISTS containers (
  id                SERIAL PRIMARY KEY,
  bl_number         VARCHAR(50) NOT NULL UNIQUE,
  registration_date DATE NOT NULL,
  customer_id       INT NOT NULL REFERENCES customers(id),
  container_number  VARCHAR(50) NOT NULL,
  contents          TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'processing', -- registered | processing | closed | priced
  registered_by     INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE containers ADD COLUMN IF NOT EXISTS container_type VARCHAR(10) NOT NULL DEFAULT '40';
ALTER TABLE containers ADD COLUMN IF NOT EXISTS quantity INT;
-- Free Storage (Free Franchise): أيام التخزين المجاني منذ «تاريخ الوصول» (registration_date)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS free_storage_days INTEGER NOT NULL DEFAULT 15;
-- الحقل القديم ND أصبح days مجانية (الجدول أُفرغ في تنظيف البيانات، لذا الحذف آمن)
ALTER TABLE containers DROP COLUMN IF EXISTS nd;
ALTER TABLE containers DROP COLUMN IF EXISTS port;
ALTER TABLE containers DROP COLUMN IF EXISTS ship_date;
ALTER TABLE containers DROP COLUMN IF EXISTS expected_arrival;
ALTER TABLE containers DROP COLUMN IF EXISTS actual_arrival;
ALTER TABLE containers DROP COLUMN IF EXISTS shipping_status;
ALTER TABLE containers DROP COLUMN IF EXISTS container_value;
-- عمود قديم ميت من نسخ سابقة من النظام — لا يُستخدم في أي كود
ALTER TABLE containers DROP COLUMN IF EXISTS liquidation_paid_amount;
ALTER TABLE containers DROP COLUMN IF EXISTS liquidation_paid;
ALTER TABLE containers DROP COLUMN IF EXISTS liquidation_paid_at;

-- ---------- invoice types ----------
CREATE TABLE IF NOT EXISTS invoice_types (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  allowed_role VARCHAR(20) NOT NULL DEFAULT 'employee', -- 'employee' | 'manager'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- invoices ----------
CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  container_id    INT NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  invoice_type_id INT NOT NULL REFERENCES invoice_types(id),
  invoice_number  VARCHAR(100),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_by      INT REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_container ON invoices(container_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type_id);
CREATE INDEX IF NOT EXISTS idx_invoices_entered_created ON invoices(entered_by, created_at);

-- ---------- pricing (final price set manually by manager) ----------
CREATE TABLE IF NOT EXISTS pricing (
  id           SERIAL PRIMARY KEY,
  container_id INT NOT NULL UNIQUE REFERENCES containers(id) ON DELETE CASCADE,
  total_costs  NUMERIC(14,2) NOT NULL DEFAULT 0,
  final_price  NUMERIC(14,2) NOT NULL,
  profit       NUMERIC(14,2) GENERATED ALWAYS AS (final_price - total_costs) STORED,
  notes        TEXT,
  set_by       INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- payments (money received from customers) ----------
CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  customer_id   INT NOT NULL REFERENCES customers(id),
  container_id  INT REFERENCES containers(id),
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- ---------- general expenses (rent, salaries, etc. - institution overhead) ----------
CREATE TABLE IF NOT EXISTS general_expenses (
  id           SERIAL PRIMARY KEY,
  category     VARCHAR(100) NOT NULL,
  description  TEXT,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_general_expenses_date ON general_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_general_expenses_category ON general_expenses(category);

-- ---------- capital transactions (رأس المال: إيداعات وسحوبات المالك) ----------
-- source: منبع المساهمة (مثال: شريك، قرض مالك، بيع عين…) — رأس المال غير محدود سلفاً؛
-- تُتتبَّع المساهمات المتعددة حسب المصدر بلا إجمالٍ ثابت.
CREATE TABLE IF NOT EXISTS capital_transactions (
  id          SERIAL PRIMARY KEY,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
  txn_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  source      VARCHAR(120) NOT NULL DEFAULT 'أموال المالك',
  notes       TEXT,
  entered_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS source VARCHAR(120) NOT NULL DEFAULT 'أموال المالك';
CREATE INDEX IF NOT EXISTS idx_capital_transactions_date ON capital_transactions(txn_date);

-- ---------- cashbox adjustments (رصيد بداية الصندوق أو تسوية يدوية للنقدية) ----------
CREATE TABLE IF NOT EXISTS cashbox_adjustments (
  id          SERIAL PRIMARY KEY,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
  adj_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  entered_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashbox_adjustments_date ON cashbox_adjustments(adj_date);

-- ---------- salary transactions (سجل رواتب الموظفين — دفتر حسابات الأجور) ----------
-- كل حركة = دفع نقدي للموظف (amount سالب) يُخصم تلقائياً من نقدية الصندوق.
--   kind = 'advance'   → دفع مقدم من الراتب (مبلغ جزئي قبل استحقاق الراتب)
--   kind = 'remainder' → دفع بقية الراتب بعد خصم المقدمات (يساوي الراتب − المقدمات)
-- رصيد الشهر = الراتب (users.salary) − إجمالي مدفوعات الشهر
CREATE TABLE IF NOT EXISTS salary_transactions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount < 0),
  kind        VARCHAR(20) NOT NULL DEFAULT 'advance', -- 'advance' | 'remainder'
  txn_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE salary_transactions ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'advance';
CREATE INDEX IF NOT EXISTS idx_salary_user_date ON salary_transactions(user_id, txn_date);

-- ---------- old debts (ديون قديمة) — يُحتفظ بها داخل حساب كل زبون (customers.opening_balance)
-- وتُسدَّد بالإيداع مثل بقية الحسابات؛ وعاء الديون القديمة المنفصل أُزيل.
DROP TABLE IF EXISTS old_debt_collections;
DROP TABLE IF EXISTS old_debts;

-- ---------- cash register sessions (فتح/إغلاق الصندوق يومياً + المطابقة) ----------
-- opening_balance  = الرصيد الافتتاحي لليوم (عند الفتح)
-- expected_closing = الرصيد المتوقع عند الإغلاق = opening + صافي الحركات من يوم الفتح حتى الإغلاق
-- actual_closing   = الرصيد الفعلي المُدقّق عند الإغلاق (عدّ نقدي)
-- difference       = الفرق بين المتوقع والفعلي (يُسجَّل لتسوية المطابقة، لا يُعدّل النقدية تلقائياً)
CREATE TABLE IF NOT EXISTS cash_register_sessions (
  id               SERIAL PRIMARY KEY,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  opening_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_closing NUMERIC(14,2),
  actual_closing   NUMERIC(14,2),
  difference       NUMERIC(14,2),
  status           VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  notes            TEXT,
  opened_by        INT REFERENCES users(id),
  closed_by        INT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_cash_register_status ON cash_register_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_register_opened ON cash_register_sessions(opened_at);

-- ---------- app settings (بيانات المؤسسة + الشعار) ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('company_nameAr', 'مؤسسة التوبة للتخليص الجمركي'),
  ('company_nameFr', 'Établissement TEWBA'),
  ('company_form', 'ETS TEWBA'),
  ('company_tel', '+222 22 43 50 99 - 49 94 69 11'),
  ('company_email', 'etstewba@gmail.com'),
  ('company_nifRcAgrement', 'NIF : 00792648 - Agrément N°104/TRASSA/1999')
ON CONFLICT (key) DO NOTHING;