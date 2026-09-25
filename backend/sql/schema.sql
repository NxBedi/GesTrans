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
-- flag: this customer's opening balance was already migrated into old_debts (prevents re-running on every boot)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_migrated BOOLEAN NOT NULL DEFAULT FALSE;
-- تاريخ الاستحقاق: تاريخ واجب السداد لكل زبون (خاضع للديون الحالية) لإظهار حالة دين (مستحق/متأخر)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS due_date DATE;

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

-- ---------- old debts (ديون قديمة مضمونة مُرحَّلة من النظام السابق — منفصلة عن رأس المال؛ تُحتسب عند تحصيلها فتدخل نقداً إلى الصندوق) ----------
CREATE TABLE IF NOT EXISTS old_debts (
  id          SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  entered_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_old_debts_created ON old_debts(created_at);

-- ---------- old debt collections (تحصيل دين قديم → يدخل نقداً إلى الصندوق ولا يغيّر إجمالي رأس المال) ----------
CREATE TABLE IF NOT EXISTS old_debt_collections (
  id              SERIAL PRIMARY KEY,
  old_debt_id     INT NOT NULL REFERENCES old_debts(id) ON DELETE CASCADE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  entered_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_old_debt_collections_debt ON old_debt_collections(old_debt_id);
CREATE INDEX IF NOT EXISTS idx_old_debt_collections_date ON old_debt_collections(collection_date);

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

-- migration (مرة واحدة فقط لكل زبون): نقل ديون الزبائن القديمة (رصيد النظام السابق) إلى وعاء الديون القديمة
-- ثم تصفير opening_balance لدى الزبائن حتى لا تُحتسب مرتين في «ديون الزبناء».
-- يُرحَّل فقط الجزء غير المسدَّد من الرصيد الافتتاحي:
--   رصيد قديم غير مسدد = opening_balance − (المدفوعات − القيمة المفوترة)، إذا كان موجباً.
-- محمي بعلم opening_balance_migrated حتى لا يُعاد تشغيله عند كل إقلاع.
DO $$
BEGIN
  INSERT INTO old_debts (description, amount)
  SELECT 'دين سابق — ' || c.name, ok.old_debt_left
  FROM customers c
  JOIN (
    SELECT cu.id,
           GREATEST(0, cu.opening_balance
                      - GREATEST(0, COALESCE(pay.paid, 0) - COALESCE(bil.billed, 0))) AS old_debt_left
    FROM customers cu
    LEFT JOIN (
      SELECT customer_id, SUM(amount)::numeric AS paid
      FROM payments GROUP BY customer_id
    ) pay ON pay.customer_id = cu.id
    LEFT JOIN (
      SELECT ct.customer_id, SUM(pr.final_price)::numeric AS billed
      FROM containers ct
      JOIN pricing pr ON pr.container_id = ct.id
      GROUP BY ct.customer_id
    ) bil ON bil.customer_id = cu.id
  ) ok ON ok.id = c.id
  WHERE ok.old_debt_left > 0
    AND c.opening_balance_migrated = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM old_debts d WHERE d.description = 'دين سابق — ' || c.name
    );

  -- تصفير الرصيد الافتتاحي ووضع علامة الترحيل لمن لم يُرحَّل بعد
  UPDATE customers
     SET opening_balance = 0, opening_balance_migrated = TRUE
   WHERE opening_balance_migrated = FALSE AND opening_balance <> 0;
END $$;