import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCompany } from './company.js';
import { logoUrl, logoFallback } from './logo.js';
import { fmt, getLang, translate as t, dlong, dmy } from '../i18n/runtime.js';
import { shapeArabic } from './arabic.js';

const isRtl = () => getLang() === 'ar';

// jsPDF 4.x applies bidi reordering but does not join Arabic letters, so the
// text is shaped into contextual presentation forms first (logical order) and
// jsPDF then draws it right-to-left. Latin text is left untouched by the shaper.
// Invisible direction marks (inserted by Intl for some locales) would make
// jsPDF reverse date/number runs, so they are dropped first.
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const tt = (value) => shapeArabic(String(value ?? '').replace(BIDI_MARKS, ''));

// Amounts on printed documents always carry two decimals (12 345,50 MRU).
const money2 = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return fmt(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// In RTL the first column of a table belongs to the right edge, so the column
// order is mirrored to keep the reading order (date → description → amounts).
const columnsFor = (cols, rtl) => (rtl ? [...cols].reverse() : cols);

const FONT_FAMILY = 'Amiri';
const FONT_FILES = {
  normal: 'Amiri-Regular.ttf',
  bold: 'Amiri-Bold.ttf',
};

let fontCache = null;

function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts() {
  if (fontCache) return fontCache;
  const base = `${import.meta.env.BASE_URL || '/'}fonts/`;
  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([style, file]) => {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
      return [style, toBase64(await res.arrayBuffer())];
    })
  );
  fontCache = Object.fromEntries(entries);
  return fontCache;
}

async function registerFonts(doc) {
  const fonts = await loadFonts();
  Object.entries(FONT_FILES).forEach(([style, file]) => {
    doc.addFileToVFS(file, fonts[style]);
    doc.addFont(file, FONT_FAMILY, style);
  });
}

// jsPDF + autoTable with the embedded font and the active direction.
async function createDoc(options = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', ...options });
  await registerFonts(doc);
  doc.setFont(FONT_FAMILY, 'normal');
  return doc;
}

// company.nifRcAgrement already starts with "NIF :" for legacy data
const nifOf = (company) => String(company.nifRcAgrement || '').replace(/^\s*NIF\s*:\s*/i, '');

// ---- Excel export ----
// rows: array of objects, columns: [{ key, header }]
export function exportExcel(filename, columns, rows) {
  const data = rows.map((r) => {
    const o = {};
    columns.forEach((c) => { o[c.header] = r[c.key] ?? ''; });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('pdf.reportSheet'));
  wb.Workbook = { Views: [{ RTL: isRtl() }] };
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ---- Generic report PDF ----
export async function exportPdf(title, headers, rows, sub = '') {
  const doc = await createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const c = getCompany();
  const rtl = isRtl();
  const align = rtl ? 'right' : 'center';

  // company header
  doc.setFontSize(15);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.text(tt(rtl ? c.nameAr : c.nameFr || c.nameAr), pageW / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'normal');
  doc.text(tt(`${c.form} — ${rtl ? c.nameFr : c.nameAr}`), pageW / 2, 20, { align: 'center' });
  doc.setDrawColor(200);
  doc.line(12, 24, pageW - 12, 24);

  doc.setFontSize(13);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.text(tt(title), pageW / 2, 33, { align });
  if (sub) {
    doc.setFontSize(9);
    doc.setFont(FONT_FAMILY, 'normal');
    doc.text(tt(sub), pageW / 2, 39, { align });
  }

  autoTable(doc, {
    startY: sub ? 44 : 40,
    head: [columnsFor(headers.map((h) => tt(h.header)), rtl)],
    body: rows.map((r) => columnsFor(headers.map((h) => tt(r[h.key] == null ? '' : String(r[h.key]))), rtl)),
    styles: {
      font: FONT_FAMILY,
      fontSize: 8.5,
      cellPadding: 2.2,
      halign: rtl ? 'right' : 'left',
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontStyle: 'bold',
      font: FONT_FAMILY,
      halign: rtl ? 'right' : 'left',
    },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    margin: { left: 12, right: 12 },
  });

  const endY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'bold');
  const issued = t('pdf.issuedOn', { date: dlong(new Date()) });
  doc.text(tt(issued), rtl ? pageW - 12 : 12, endY, { align: rtl ? 'right' : 'left' });
  const contact = t('pdf.tel', { tel: c.tel, nif: nifOf(c) });
  doc.text(tt(contact), rtl ? 12 : pageW - 12, endY, { align: rtl ? 'left' : 'right' });
  const generated = t('pdf.generatedBy', { app: t('common.appName'), form: c.form });
  doc.text(tt(generated), pageW / 2, endY + 25, { align: 'center' });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

// ---- Account statement PDF ----
// customer: { name }, entries: [{ date, description, debit, credit, balance }],
// period: { from, to, opening }, totals: { balance }
function loadLogoData(url) {
  return fetch(url)
    .then((r) => { if (!r.ok) throw new Error('no logo'); return r.blob(); })
    .then((blob) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }));
}

async function loadCompanyLogo() {
  try { return await loadLogoData(logoUrl()); } catch { /* no custom logo */ }
  try { return await loadLogoData(logoFallback); } catch { return null; }
}

export async function exportStatementPdf(customer, entries, period, totals) {
  const doc = await createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const c = getCompany();
  const rtl = isRtl();
  const align = rtl ? 'right' : 'left';

  const logoData = await loadCompanyLogo();

  if (logoData) doc.addImage(logoData, 'PNG', pageW / 2 - 10, 6, 20, 20);
  const topY = logoData ? 30 : 12;

  // company header
  doc.setFontSize(15);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.text(tt(rtl ? c.nameAr : c.nameFr || c.nameAr), pageW / 2, topY, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'normal');
  doc.text(tt(`${c.form} — ${rtl ? c.nameFr : c.nameAr}`), pageW / 2, topY + 6, { align: 'center' });
  doc.setDrawColor(200);
  doc.line(12, topY + 11, pageW - 12, topY + 11);

  doc.setFontSize(13);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.text(tt(t('pdf.statement')), pageW / 2, topY + 19, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont(FONT_FAMILY, 'normal');
  doc.text(tt(t('pdf.customer', { name: customer.name })), rtl ? pageW - 12 : 12, topY + 27, { align });
  const periodLabel = period?.from
    ? t('pdf.period', { from: dmy(period.from), to: period.to ? dmy(period.to) : t('common.now') })
    : t('pdf.periodAll');
  doc.text(tt(periodLabel), rtl ? pageW - 12 : 12, topY + 33, { align });

  // columns are defined in reading order then mirrored for RTL
  const cols = [
    { head: t('common.date'), numeric: false, cell: (e) => tt(e.date) },
    { head: t('common.description'), numeric: false, cell: (e) => tt(e.description || '') },
    { head: t('common.debit'), numeric: true, cell: (e) => (e.debit == null ? '—' : money2(e.debit)) },
    { head: t('common.credit'), numeric: true, cell: (e) => (e.credit == null ? '—' : money2(e.credit)) },
    { head: t('common.balance'), numeric: true, cell: (e) => money2(e.balance) },
  ];
  const ordered = columnsFor(cols, rtl);

  const columnStyles = {};
  ordered.forEach((col, i) => {
    if (col.numeric) columnStyles[i] = { halign: rtl ? 'left' : 'right' };
  });

  autoTable(doc, {
    startY: topY + 40,
    head: [ordered.map((col) => tt(col.head))],
    body: entries.map((e) => ordered.map((col) => col.cell(e))),
    styles: {
      font: FONT_FAMILY,
      fontSize: 8.5,
      cellPadding: 2.2,
      halign: rtl ? 'right' : 'left',
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontStyle: 'bold',
      font: FONT_FAMILY,
      halign: rtl ? 'right' : 'left',
    },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    columnStyles,
    margin: { left: 12, right: 12 },
  });

  const endY = doc.lastAutoTable.finalY;
  const periodEnd = entries.length ? entries[entries.length - 1].balance : (period?.opening ?? totals.balance);
  const currency = t('common.currency');

  doc.setFontSize(10);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.text(
    tt(t('pdf.finalBalance', { amount: `${money2(periodEnd)} ${currency}` })),
    rtl ? pageW - 12 : 12,
    endY + 8,
    { align }
  );
  doc.text(
    tt(t('pdf.currentBalance', { amount: `${money2(totals.balance)} ${currency}` })),
    rtl ? 12 : pageW - 12,
    endY + 8,
    { align: rtl ? 'left' : 'right' }
  );

  // signature area (the agency stamp is applied manually after printing)
  const sigY = endY + 18;
  doc.setDrawColor(110);
  doc.setLineWidth(0.4);
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.rect(pageW - 92, sigY, 80, 34);
  doc.text(tt(t('common.companyStamp')), pageW - 52, sigY + 8, { align: 'center' });
  doc.line(pageW - 78, sigY + 24, pageW - 34, sigY + 24);

  // footer
  doc.setFontSize(9);
  doc.setFont(FONT_FAMILY, 'normal');
  const issued = t('pdf.issuedOn', { date: dlong(new Date()) });
  doc.text(tt(issued), rtl ? pageW - 12 : 12, 285, { align });
  doc.text(tt(t('pdf.tel', { tel: c.tel, nif: nifOf(c) })), rtl ? 12 : pageW - 12, 285, {
    align: rtl ? 'left' : 'right',
  });
  doc.text(tt(t('pdf.generatedBy', { app: t('common.appName'), form: c.form })), pageW / 2, 292, {
    align: 'center',
  });

  doc.save(`${t('pdf.statementFile', { name: customer.name })}.pdf`);
}
