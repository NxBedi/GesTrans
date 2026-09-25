import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COMPANY } from './company.js';

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

  // company header
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY.nameAr, pageW / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY.form} — ${COMPANY.nameFr}`, pageW / 2, 20, { align: 'center' });
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
  doc.text(`Tel : ${COMPANY.tel} — NIF : ${COMPANY.nifRcAgrement}`, pageW - 12, endY, { align: 'ltr' });
  doc.text('أُنشئ بواسطة نظام المحاسبة الجمركية A.M.S', pageW / 2, endY + 25, { align: 'center' });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}