import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Layer from 'express/lib/router/layer.js';

// Express 4 does not route rejected promises from async handlers to the error middleware,
// so any DB error would leave the client waiting forever. Patch Layer so async rejections
// are forwarded to `next(err)` and the global error handler responds with a clean 500.
const originalHandleRequest = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) {
    // error-handling middleware (err, req, res, next)
    return originalHandleRequest.call(this, req, res, next);
  }
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
  } catch (err) {
    next(err);
  }
};

import { runMigrations } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import customerRoutes from './routes/customers.js';
import invoiceTypeRoutes from './routes/invoice-types.js';
import containerRoutes from './routes/containers.js';
import invoiceRoutes from './routes/invoices.js';
import myExpenseRoutes from './routes/my-expenses.js';
import pricingRoutes from './routes/pricing.js';
import paymentRoutes from './routes/payments.js';
import generalExpenseRoutes from './routes/general-expenses.js';
import financialRoutes from './routes/financial.js';
import salaryRoutes from './routes/salary.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

// Express 4 does not catch rejected promises from async route handlers.
// Log the error instead of letting it kill the whole process (the server is run manually).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET غير مضبوط — يُستخدم المفتاح الافتراضي. اضبطه في backend/.env');
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoice-types', invoiceTypeRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/containers', invoiceRoutes);
app.use('/api/containers', pricingRoutes);
app.use('/api/my-expenses', myExpenseRoutes);
app.use('/api/customers', paymentRoutes);
app.use('/api/general-expenses', generalExpenseRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/reports', reportRoutes);

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  const msg = String(err && err.message || '');
  // preserve the useful validation-style messages from our routes, hide DB internals
  const friendly =
    /invalid input syntax|duplicate key|cannot insert|null value|violates|column|relation|current transaction is aborted/i.test(msg)
      ? 'حدث خطأ داخلي في قاعدة البيانات'
      : (msg || 'خطأ غير متوقع');
  res.status(500).json({ error: 'خطأ في الخادم: ' + friendly });
});

const PORT = Number(process.env.PORT || 4000);

async function start() {
  try {
    await runMigrations();
    console.log('Database migrations checked.');
  } catch (e) {
    console.error('Could not connect/init database:', e.message);
    console.error('Make sure PostgreSQL is running (docker compose up -d)');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Customs accounting API listening on http://localhost:${PORT}`);
  });
}

start();