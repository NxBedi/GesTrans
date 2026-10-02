import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCompany } from './company.js';
import { logoUrl, logoFallback } from './logo.js';
import { fmt } from './format.js';

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
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ---- PDF export (RTL friendly: arabic titles, LTR numbers) ----
export function exportPdf(title, headers, rows, sub = '') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('ar-MA');
  const c = getCompany();

  // company header
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(c.nameAr, pageW / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${c.form} — ${c.nameFr}`, pageW / 2, 20, { align: 'center' });
  doc.setDrawColor(200);
  doc.line(12, 24, pageW - 12, 24);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageW / 2, 33, { align: 'center' });
  if (sub) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(sub, pageW / 2, 39, { align: 'center' });
  }

  autoTable(doc, {
    startY: sub ? 44 : 40,
    head: [headers.map((h) => h.header)],
    body: rows.map((r) => headers.map((h) => (r[h.key] == null ? '' : String(r[h.key])))),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, halign: 'right' },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    margin: { left: 12, right: 12 },
  });

  const endY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`تاريخ الإصدار: ${dateStr}`, 12, endY);
  doc.text(`Tel : ${c.tel} — NIF : ${c.nifRcAgrement}`, pageW - 12, endY, { align: 'ltr' });
  doc.text(`أُنشئ بواسطة نظام المحاسبة الجمركية ${c.form}`, pageW / 2, endY + 25, { align: 'center' });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

// ---- Account statement PDF (كشف حساب) ----
// customer: { name }, entries: [{ date, description, debit, credit, balance }], period: { from, to, opening }, totals: { balance }
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
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('ar-MA');
  const c = getCompany();

  const logoData = await loadCompanyLogo();

  if (logoData) doc.addImage(logoData, 'PNG', pageW / 2 - 10, 6, 20, 20);
  const topY = logoData ? 30 : 12;

  // company header
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(c.nameAr, pageW / 2, topY, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${c.form} — ${c.nameFr}`, pageW / 2, topY + 6, { align: 'center' });
  doc.setDrawColor(200);
  doc.line(12, topY + 11, pageW - 12, topY + 11);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('كشف حساب', pageW / 2, topY + 19, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`الزبون: ${customer.name}`, 12, topY + 27);
  const periodLabel = period?.from
    ? `الفترة: ${period.from}  إلى  ${period.to || 'الآن'}`
    : 'الفترة: كامل الفترة';
  doc.text(periodLabel, 12, topY + 33);

  const rows = entries.map((e) => [
    e.date,
    e.description || '',
    e.debit == null ? '—' : fmt(e.debit),
    e.credit == null ? '—' : fmt(e.credit),
    fmt(e.balance),
  ]);

  autoTable(doc, {
    startY: topY + 40,
    head: [['التاريخ', 'البيان', 'مَدين', 'دائن', 'الرصيد']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, halign: 'right' },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    columnStyles: { 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'left' } },
    margin: { left: 12, right: 12 },
  });

  const endY = doc.lastAutoTable.finalY;
  const periodEnd = entries.length ? entries[entries.length - 1].balance : (period?.opening ?? totals.balance);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`الرصيد النهائي للفترة: ${fmt(periodEnd)} MRU`, 12, endY + 8);
  doc.text(`الرصيد الحالي الكلي: ${fmt(totals.balance)} MRU`, pageW - 12, endY + 8, { align: 'right' });

  // signature area (the agency stamp is applied manually after printing)
  const sigY = endY + 18;
  doc.setDrawColor(110);
  doc.setLineWidth(0.4);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.rect(pageW - 92, sigY, 80, 34);
  doc.text('توقيع إدارة النظام', pageW - 52, sigY + 8, { align: 'center' });
  doc.line(pageW - 78, sigY + 24, pageW - 34, sigY + 24);

  // footer
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`تاريخ الإصدار: ${dateStr}`, 12, 285);
  doc.text(`Tel : ${c.tel} — NIF : ${c.nifRcAgrement}`, pageW - 12, 285, { align: 'ltr' });
  doc.text(`أُنشئ بواسطة نظام المحاسبة الجمركية ${c.form}`, pageW / 2, 292, { align: 'center' });

  doc.save(`كشف_حساب_${customer.name}.pdf`);
}