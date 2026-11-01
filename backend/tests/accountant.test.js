/**
 * اختباراتacceptance لدور «المحاسب» (Accountant).
 *
 * التشغيل:  npm test          (من مجلد backend)
 * المتطلبات: قاعدة بيانات PostgreSQL تعمل، وحساب مدير موجود (admin/admin123).
 *
 * الاختبارات تغطي:
 *   1) عزل الصلاحيات: المحاسب لا يدير المستخدمين/الزبائن، والموظف لا يرى المالية.
 *   2) تسجيل مصروف مؤثر على الصندوق مرة واحدة فقط (لا تكرار).
 *   3) المصروف غير النقدي (بنك/آجل) لا يخنّص الصندوق.
 *   4) منع التكرار (مفتاح تفرّد + تطابق طبيعي).
 *   5) عكس العملية بدل حذفها + استرجاع نقدية الصندوق + بقاء السجل.
 *   6) تسجيل الرواتب بواسطة المحاسب + أثرها على الصندوق + كشف حساب الموظف.
 *   7) سجل التدقيق يسجّل كل عملية.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, query } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT || 4100);
const BASE = `http://localhost:${PORT}/api`;
const MANAGER = { username: 'admin', password: 'admin123' };

let server = null;
let managerToken = '';
let accountantToken = '';
let employeeToken = '';
let accountantId = 0;
let employeeId = 0;
let salary = 0;
const created = { expenses: [], salaries: [] };

const stamp = Date.now();
const ACCOUNTANT_USER = { username: `acc_test_${stamp}`, password: 'AccTest#123', full_name: 'محاسب اختبار' };

async function api(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, `login failed for ${username}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function cashInHand() {
  const r = await api('/financial/overview', { token: managerToken });
  assert.equal(r.status, 200);
  return Number(r.data.cash_box);
}

before(async () => {
  // شغّل نسخة الخادم على منفذ اختبارات مستقل
  server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  // انتظر جاهزية الخادم
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      if (r.ok) break;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }

  managerToken = await login(MANAGER.username, MANAGER.password);

  // حساب محاسب جديد (عبر واجهة المدير — لا بالكتابة المباشرة)
  const createdAcc = await api('/users', {
    method: 'POST',
    token: managerToken,
    body: { ...ACCOUNTANT_USER, role: 'accountant', salary: 0 },
  });
  assert.equal(createdAcc.status, 201, `create accountant failed: ${JSON.stringify(createdAcc.data)}`);
  accountantId = createdAcc.data.user.id;
  accountantToken = await login(ACCOUNTANT_USER.username, ACCOUNTANT_USER.password);

  // حساب موظف للاختبار
  const createdEmp = await api('/users', {
    method: 'POST',
    token: managerToken,
    body: {
      username: `emp_test_${stamp}`,
      password: 'EmpTest#123',
      full_name: 'موظف اختبار',
      role: 'employee',
      salary: 1000,
    },
  });
  assert.equal(createdEmp.status, 201, `create employee failed: ${JSON.stringify(createdEmp.data)}`);
  employeeId = createdEmp.data.user.id;
  salary = 1000;
  employeeToken = await login(`emp_test_${stamp}`, 'EmpTest#123');
});

after(async () => {
  if (server) server.kill();
  // تنظيف البيانات التي أنشأها الاختبار
  try {
    if (created.expenses.length) {
      await query('DELETE FROM general_expenses WHERE id = ANY($1::int[])', [created.expenses]);
    }
    if (created.salaries.length) {
      await query('DELETE FROM salary_transactions WHERE id = ANY($1::int[])', [created.salaries]);
    }
    await query('DELETE FROM audit_logs WHERE actor_name IN ($1, $2)', ['محاسب اختبار', 'موظف اختبار']);
    await query('DELETE FROM audit_logs WHERE entity_id IN (SELECT id::text FROM general_expenses WHERE category = $1)', ['__test__']);
    if (employeeId) await query('DELETE FROM users WHERE id = $1', [employeeId]);
    if (accountantId) await query('DELETE FROM users WHERE id = $1', [accountantId]);
  } catch (e) {
    console.error('cleanup failed:', e.message);
  }
  await pool.end();
});

// ---------------------------------------------------------------- الصلاحيات

test('المحاسب لا يدير المستخدمين ولا الزبائن', async () => {
  const users = await api('/users', { token: accountantToken });
  assert.equal(users.status, 403);

  const create = await api('/users', {
    method: 'POST',
    token: accountantToken,
    body: { username: 'x', password: 'y', full_name: 'z', role: 'manager' },
  });
  assert.equal(create.status, 403);

  // إنشاء/تعديل/حذف الزبائن للمدير فقط (قراءة الدليل متاحة للجميع في النظام)
  const createCustomer = await api('/customers', {
    method: 'POST',
    token: accountantToken,
    body: { name: 'زبون اختبار' },
  });
  assert.equal(createCustomer.status, 403);

  const customers = await api('/customers', { token: accountantToken });
  assert.equal(customers.status, 200, 'قراءة دليل الزبائن متاحة كما هيforall الأدوار');

  const debts = await api('/customers/1/statement', { token: accountantToken });
  assert.equal(debts.status, 403, 'كشف حساب الزبون (الدين) للمدير فقط');
});

test('الموظف لا يرى الوحدات المالية', async () => {
  const gen = await api('/general-expenses', { token: employeeToken });
  assert.equal(gen.status, 403);

  const sal = await api('/salary/employees', { token: employeeToken });
  assert.equal(sal.status, 403);

  const acc = await api('/accountant/dashboard', { token: employeeToken });
  assert.equal(acc.status, 403);

  const cash = await api('/financial/overview', { token: employeeToken });
  assert.equal(cash.status, 403);
});

test('المحاسب لا يستطيع تعديل الصندوق ولا رأس المال', async () => {
  const capital = await api('/financial/capital', {
    method: 'POST',
    token: accountantToken,
    body: { amount: 500, txn_date: new Date().toISOString().slice(0, 10) },
  });
  assert.equal(capital.status, 403);

  const adj = await api('/financial/adjustments', {
    method: 'POST',
    token: accountantToken,
    body: { amount: 100, adj_date: new Date().toISOString().slice(0, 10) },
  });
  assert.equal(adj.status, 403);

  const reg = await api('/financial/register/open', {
    method: 'POST',
    token: accountantToken,
    body: { opening_balance: 0 },
  });
  assert.equal(reg.status, 403);
});

test('المحاسب لا ينشئ فواتير الحاويات ولا يعدّلها', async () => {
  const inv = await api('/containers/1/invoices', {
    method: 'POST',
    token: accountantToken,
    body: { invoice_type_id: 1, entry_date: '2026-01-01', amount: 10 },
  });
  assert.equal(inv.status, 403);
});

test('المحاسب يقرأ كل الوحدات المالية', async () => {
  for (const p of ['/accountant/dashboard', '/general-expenses', '/general-expenses/summary', '/salary/employees', '/salary/transactions', '/financial/overview', '/financial/movements', '/my-expenses', '/reports/expenses', '/reports/expenses-summary', '/accountant/audit']) {
    const r = await api(p, { token: accountantToken });
    assert.equal(r.status, 200, `${p} -> ${r.status} ${JSON.stringify(r.data)}`);
  }
});

// ------------------------------------------------- المصاريف وأثرها على الصندوق

test('تسجيل مصروف نقدي يخصم الصندوق مرة واحدة فقط', async () => {
  const before = await cashInHand();
  const r = await api('/general-expenses', {
    method: 'POST',
    token: accountantToken,
    body: {
      category: '__test__ مصروف نقدي',
      description: 'اختبار',
      amount: 250,
      expense_date: '2026-02-01',
      payment_method: 'cash',
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  created.expenses.push(r.data.id);

  const after = await cashInHand();
  assert.equal(before - after, 250, 'الصندوق نقص بقيمة المصروف مرة واحدة فقط');
});

test('المصروف غير النقدي (بنك/آجل) لا يخنّص الصندوق', async () => {
  const before = await cashInHand();
  for (const method of ['bank', 'credit']) {
    const r = await api('/general-expenses', {
      method: 'POST',
      token: accountantToken,
      body: {
        category: `__test__ مصروف ${method}`,
        amount: 300,
        expense_date: '2026-02-01',
        payment_method: method,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    created.expenses.push(r.data.id);
  }
  const after = await cashInHand();
  assert.equal(before, after, 'الصندوق لم يتغير مع المصاريف غير النقدية');
});

test('منع تسجيل نفس العملية مرتين (تطابق طبيعي + مفتاح تفرّد)', async () => {
  const body = {
    category: '__test__ تكرار',
    amount: 77,
    expense_date: '2026-02-02',
    payment_method: 'cash',
  };
  const first = await api('/general-expenses', { method: 'POST', token: accountantToken, body });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  created.expenses.push(first.data.id);

  const second = await api('/general-expenses', { method: 'POST', token: accountantToken, body });
  assert.equal(second.status, 409, 'التكرار الطبيعي مرفوض');

  // إعادة إرسال بمفتاح تفرّد واحد
  const idem = `idem-${stamp}-1`;
  const a = await api('/general-expenses', {
    method: 'POST',
    token: accountantToken,
    body: { ...body, category: '__test__ تفرّد', idempotency_key: idem },
  });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  created.expenses.push(a.data.id);

  const b = await api('/general-expenses', {
    method: 'POST',
    token: accountantToken,
    body: { ...body, category: '__test__ تفرّد', idempotency_key: idem },
  });
  assert.equal(b.status, 409, 'إعادة الإرسال بنفس المفتاح مرفوضة');
});

test('عكس المصروف (بدل الحذف) يسترجع الصندوق ويُبقي السجل', async () => {
  const createdExpense = await api('/general-expenses', {
    method: 'POST',
    token: accountantToken,
    body: {
      category: '__test__ معكوس',
      amount: 120,
      expense_date: '2026-02-03',
      payment_method: 'cash',
    },
  });
  assert.equal(createdExpense.status, 201);
  const id = createdExpense.data.id;
  created.expenses.push(id);

  const before = await cashInHand();
  assert.equal(before, (await cashInHand()));

  const rev = await api(`/general-expenses/${id}/reverse`, {
    method: 'POST',
    token: accountantToken,
    body: { note: 'عكس تجريبي' },
  });
  assert.equal(rev.status, 200, JSON.stringify(rev.data));
  assert.ok(rev.data.reversed_at, 'السجل يحمل علامة العكس');

  const after = await cashInHand();
  const delta = after - before;
  assert.equal(delta, 120, 'الصندوق استُرجع بعد العكس');

  // السجل ما زال موجوداً في السجل التاريخي
  const history = await api('/general-expenses?include_reversed=1', { token: accountantToken });
  assert.equal(history.status, 200);
  assert.ok(history.data.some((r) => r.id === id), 'السجل المعكوس ما زال محفوظاً');

  // لا يمكن عكس عملية معكوسة مرتين
  const rev2 = await api(`/general-expenses/${id}/reverse`, {
    method: 'POST',
    token: accountantToken,
    body: { note: 'ثانٍ' },
  });
  assert.equal(rev2.status, 409);
});

test('المحاسب لا يستطيع تعديل مصروف مسجّل (التعديل للمدير فقط)', async () => {
  const r = await api('/general-expenses', {
    method: 'POST',
    token: accountantToken,
    body: { category: '__test__ لا تعديل', amount: 50, expense_date: '2026-02-04', payment_method: 'cash' },
  });
  assert.equal(r.status, 201);
  created.expenses.push(r.data.id);

  const upd = await api(`/general-expenses/${r.data.id}`, {
    method: 'PUT',
    token: accountantToken,
    body: { category: '__test__ لا تعديل', amount: 999, expense_date: '2026-02-04' },
  });
  assert.equal(upd.status, 403, 'التعديل مرفوض على المحاسب');
});

// ------------------------------------------------------------------ الرواتب

test('تسجيل راتب نقدي بواسطة المحاسب يخصم الصندوق ويحدّث كشف الحساب', async () => {
  const before = await cashInHand();
  const r = await api('/salary/advance', {
    method: 'POST',
    token: accountantToken,
    body: {
      user_id: employeeId,
      amount: 400,
      txn_date: '2026-02-05',
      notes: 'مقدم اختبار',
      payment_method: 'cash',
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  created.salaries.push(r.data.id);

  const after = await cashInHand();
  assert.equal(before - after, 400, 'الصندوق نقص بقيمة الراتب مرة واحدة');

  const stmt = await api(`/salary/statement/${employeeId}`, { token: accountantToken });
  assert.equal(stmt.status, 200);
  assert.equal(Number(stmt.data.period.paid), 400, 'كشف الحساب يعرض المدفوع');
});

test('راتب غير نقدي لا يخنّص الصندوق', async () => {
  const before = await cashInHand();
  const r = await api('/salary/advance', {
    method: 'POST',
    token: accountantToken,
    body: {
      user_id: employeeId,
      amount: 200,
      txn_date: '2026-02-06',
      payment_method: 'bank',
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  created.salaries.push(r.data.id);

  const after = await cashInHand();
  assert.equal(before, after, 'الصندوق لم يتغير مع الراتب غير النقدي');
});

test('عكس حركة الراتب يعيد الصندوق ولا يحذف السجل', async () => {
  const r = await api('/salary/advance', {
    method: 'POST',
    token: accountantToken,
    body: { user_id: employeeId, amount: 150, txn_date: '2026-02-07', payment_method: 'cash' },
  });
  assert.equal(r.status, 201);
  created.salaries.push(r.data.id);
  const id = r.data.id;

  const before = await cashInHand();
  const rev = await api(`/salary/transactions/${id}/reverse`, {
    method: 'POST',
    token: accountantToken,
    body: { note: 'عكس راتب' },
  });
  assert.equal(rev.status, 200, JSON.stringify(rev.data));
  const after = await cashInHand();
  assert.equal(after - before, 150, 'الصندوق استُرجع');

  const txs = await api('/salary/transactions?include_reversed=1', { token: accountantToken });
  assert.ok(txs.data.some((t) => t.id === id), 'الحركة المعكوسة ما زالت محفوظة');
});

test('المحاسب لا يستطيع حذف حركة مالية (العكس فقط)', async () => {
  const del = await api(`/salary/transactions/${created.salaries[0]}`, {
    method: 'DELETE',
    token: accountantToken,
  });
  assert.equal(del.status, 403, 'الحذف مرفوض على المحاسب');
});

// -------------------------------------------------------------- سجل التدقيق

test('سجل التدقيق يوثّق العمليات المالية', async () => {
  const r = await api('/accountant/audit?limit=200', { token: accountantToken });
  assert.equal(r.status, 200);
  const creates = r.data.filter((a) => a.action === 'create' && a.entity_type === 'general_expense');
  assert.ok(creates.length > 0, 'توجد عمليات إنشاء مسجّلة');
  assert.ok(r.data.some((a) => a.action === 'reverse'), 'توجد عمليات عكس مسجّلة');
  assert.ok(creates.every((a) => a.actor_name === 'محاسب اختبار'), 'المسجّل هو صاحب العملية');
});

test('الموظف لا يقرأ سجل التدقيق', async () => {
  const r = await api('/accountant/audit', { token: employeeToken });
  assert.equal(r.status, 403);
});
