import { Router } from 'express';
import db from '../db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Load logo once at startup and convert to base64 data URI
let logoDataUri: string;
try {
  const logoPath = join(__dirname, '..', 'assets', 'logo.png');
  const logoBuffer = readFileSync(logoPath);
  logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (e) {
  console.warn('Failed to load logo, using fallback');
  logoDataUri = ''; // Will use onerror fallback in HTML
}

/**
 * GET /api/export/quote/:projectId
 * ייצוא הצעת מחיר בפורמט HTML להדפסה/PDF
 */
router.get('/quote/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    
    // שליפת פרטי פרויקט
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      return res.status(404).json({ error: 'פרויקט לא נמצא' });
    }

    // שליפת סעיפי עלות
    const costItems = db.prepare(
      'SELECT * FROM cost_items WHERE project_id = ? ORDER BY category, sort_order, created_at'
    ).all(projectId) as any[];

    // חישוב סכומים
    const subtotal = costItems.reduce((sum, item) => sum + item.total, 0);
    const overhead = subtotal * (project.overhead_percent / 100);
    const insurance = subtotal * (project.insurance_percent / 100);
    const margin = (subtotal + overhead + insurance) * (project.margin_percent / 100);
    const beforeVat = subtotal + overhead + insurance + margin;
    const vat = project.vat_included ? beforeVat * 0.17 : 0;
    const finalPrice = beforeVat + vat;

    // קיבוץ לפי קטגוריות
    const categories = [
      { id: 'labor', name: 'עבודה', color: '#2563EB' },
      { id: 'equipment', name: 'ציוד', color: '#EA580C' },
      { id: 'materials', name: 'חומרים', color: '#059669' },
      { id: 'transport', name: 'הובלה', color: '#7C3AED' },
      { id: 'sub', name: 'קבלני משנה', color: '#DB2777' },
      { id: 'permits', name: 'היתרים', color: '#0891B2' },
      { id: 'other', name: 'אחר', color: '#6B7280' },
    ];

    const itemsByCategory = categories.map(cat => ({
      ...cat,
      items: costItems.filter(item => item.category === cat.id)
    })).filter(cat => cat.items.length > 0);

    // בניית HTML
    const html = generateQuoteHTML({
      project,
      itemsByCategory,
      costItems,
      subtotal,
      overhead,
      insurance,
      margin,
      vat,
      finalPrice,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e: any) {
    console.error('שגיאה בייצוא הצעת מחיר:', e);
    res.status(500).json({ error: 'שגיאה בייצוא: ' + e.message });
  }
});

function fmt(num: number): string {
  return new Intl.NumberFormat('he-IL', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(num);
}

interface QuoteData {
  project: any;
  itemsByCategory: Array<{ id: string; name: string; color: string; items: any[] }>;
  costItems: any[];
  subtotal: number;
  overhead: number;
  insurance: number;
  margin: number;
  vat: number;
  finalPrice: number;
}

function generateQuoteHTML(data: QuoteData): string {
  const { project, itemsByCategory, subtotal, overhead, insurance, margin, vat, finalPrice } = data;
  const today = new Intl.DateTimeFormat('he-IL', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }).format(new Date());

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הצעת מחיר - ${project.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f8f9fa;
      padding: 20mm;
      direction: rtl;
    }
    
    .container {
      max-width: 210mm;
      margin: 0 auto;
      background: white;
      box-shadow: 0 0 10mm rgba(0,0,0,0.1);
    }
    
    /* Header */
    .header {
      background: linear-gradient(135deg, #1B4F8A 0%, #0073a8 100%);
      color: white;
      padding: 30px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo-section {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 20px;
    }
    
    .company-logo {
      height: 56px;
      width: auto;
      object-fit: contain;
      max-width: 200px;
    }
    
    .company-text {
      flex: 1;
    }
    
    .company-name {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 8px;
      color: white;
    }
    
    .company-tagline {
      font-size: 14px;
      opacity: 0.9;
      font-weight: 500;
    }
    
    .header-info {
      text-align: left;
      font-size: 13px;
      opacity: 0.95;
      line-height: 1.8;
    }
    
    /* Document title */
    .doc-title {
      background: #F97316;
      color: white;
      padding: 20px 40px;
      font-size: 24px;
      font-weight: 700;
      text-align: center;
    }
    
    /* Content */
    .content {
      padding: 40px;
    }
    
    .project-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      border-right: 4px solid #0073a8;
    }
    
    .info-row {
      display: grid;
      grid-template-columns: 150px 1fr;
      padding: 8px 0;
      font-size: 14px;
    }
    
    .info-label {
      font-weight: 700;
      color: #495057;
    }
    
    .info-value {
      color: #212529;
    }
    
    /* Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
      font-size: 13px;
    }
    
    .items-table thead {
      background: #0073a8;
      color: white;
    }
    
    .items-table th {
      padding: 12px 10px;
      text-align: right;
      font-weight: 700;
      font-size: 12px;
    }
    
    .items-table td {
      padding: 10px;
      border-bottom: 1px solid #e9ecef;
    }
    
    .items-table tbody tr:hover {
      background: #f8f9fa;
    }
    
    .category-header {
      background: #f1f3f5 !important;
      font-weight: 700;
      color: #212529;
      padding: 14px 10px !important;
    }
    
    .category-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-left: 8px;
    }
    
    .text-center {
      text-align: center;
    }
    
    .text-left {
      text-align: left;
    }
    
    .font-bold {
      font-weight: 700;
    }
    
    /* Summary */
    .summary-box {
      background: linear-gradient(135deg, #1e1e2d 0%, #2d2d44 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin: 30px 0;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 15px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .summary-row:last-child {
      border-bottom: none;
      padding-top: 20px;
      margin-top: 10px;
      border-top: 2px solid rgba(255,255,255,0.2);
      font-size: 22px;
      font-weight: 800;
    }
    
    .summary-label {
      color: #d1d5db;
    }
    
    .summary-value {
      font-weight: 700;
      color: white;
    }
    
    /* Footer */
    .footer {
      background: #f8f9fa;
      padding: 30px 40px;
      margin-top: 40px;
      border-top: 3px solid #F97316;
    }
    
    .footer-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
    }
    
    .footer-section {
      flex: 1;
    }
    
    .footer-title {
      font-size: 13px;
      font-weight: 700;
      color: #495057;
      margin-bottom: 8px;
    }
    
    .footer-content {
      font-size: 12px;
      color: #6c757d;
      line-height: 1.8;
    }
    
    .validity-note {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 6px;
      padding: 15px;
      margin-top: 20px;
      font-size: 13px;
      color: #856404;
    }
    
    /* Print styles */
    @media print {
      body {
        padding: 0;
        background: white;
      }
      
      .container {
        box-shadow: none;
        max-width: 100%;
      }
      
      @page {
        size: A4;
        margin: 15mm;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <img src="${logoDataUri}" 
             alt="א.א קידוחים ופיתוח" 
             class="company-logo"
             onerror="this.style.display='none'"/>
        <div class="company-text">
          <div class="company-name">א.א קידוחים ופיתוח</div>
          <div class="company-tagline">עבודות קידוחים, פיתוח ועבודות עפר</div>
        </div>
      </div>
      <div class="header-info">
        <div>טל: 052-9556123</div>
        <div>מייל: eliav1334@gmail.com</div>
        <div>אתר: eliavafar.co.il</div>
        <div>רישיון קבלן: 36281</div>
      </div>
    </div>
    
    <!-- Document Title -->
    <div class="doc-title">הצעת מחיר</div>
    
    <!-- Content -->
    <div class="content">
      <!-- Project Info -->
      <div class="project-info">
        <div class="info-row">
          <div class="info-label">שם הפרויקט:</div>
          <div class="info-value">${project.name}</div>
        </div>
        <div class="info-row">
          <div class="info-label">לקוח:</div>
          <div class="info-value">${project.client || 'לא צוין'}</div>
        </div>
        ${project.address ? `
        <div class="info-row">
          <div class="info-label">כתובת:</div>
          <div class="info-value">${project.address}</div>
        </div>
        ` : ''}
        <div class="info-row">
          <div class="info-label">סוג עבודה:</div>
          <div class="info-value">${project.type || 'לא צוין'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">תאריך:</div>
          <div class="info-value">${today}</div>
        </div>
      </div>
      
      <!-- Items Table -->
      <h3 style="margin-bottom: 15px; color: #212529; font-size: 18px;">פירוט עבודות וחומרים</h3>
      
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>תיאור</th>
            <th class="text-center" style="width: 80px;">יחידה</th>
            <th class="text-center" style="width: 80px;">כמות</th>
            <th class="text-center" style="width: 100px;">מחיר ליח'</th>
            <th class="text-center" style="width: 110px;">סה"כ</th>
          </tr>
        </thead>
        <tbody>
          ${itemsByCategory.map(cat => `
            <tr>
              <td colspan="6" class="category-header">
                <span class="category-dot" style="background: ${cat.color};"></span>
                ${cat.name}
              </td>
            </tr>
            ${cat.items.map((item, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${item.description}</td>
                <td class="text-center">${item.unit}</td>
                <td class="text-center">${fmt(item.quantity)}</td>
                <td class="text-center">${fmt(item.unit_price)} ₪</td>
                <td class="text-center font-bold">${fmt(item.total)} ₪</td>
              </tr>
            `).join('')}
          `).join('')}
          <tr style="background: #f8f9fa;">
            <td colspan="5" class="font-bold" style="text-align: left; padding: 15px 10px;">סיכום ביניים:</td>
            <td class="text-center font-bold" style="color: #059669; font-size: 16px;">${fmt(subtotal)} ₪</td>
          </tr>
        </tbody>
      </table>
      
      <!-- Summary Box -->
      <div class="summary-box">
        <div class="summary-row">
          <span class="summary-label">סיכום ביניים</span>
          <span class="summary-value">${fmt(subtotal)} ₪</span>
        </div>
        ${overhead > 0 ? `
        <div class="summary-row">
          <span class="summary-label">תקורות (${project.overhead_percent}%)</span>
          <span class="summary-value">${fmt(overhead)} ₪</span>
        </div>
        ` : ''}
        ${insurance > 0 ? `
        <div class="summary-row">
          <span class="summary-label">ביטוח (${project.insurance_percent}%)</span>
          <span class="summary-value">${fmt(insurance)} ₪</span>
        </div>
        ` : ''}
        <div class="summary-row">
          <span class="summary-label">רווח קבלני (${project.margin_percent}%)</span>
          <span class="summary-value">${fmt(margin)} ₪</span>
        </div>
        ${project.vat_included ? `
        <div class="summary-row">
          <span class="summary-label">מע"מ (17%)</span>
          <span class="summary-value">${fmt(vat)} ₪</span>
        </div>
        ` : ''}
        <div class="summary-row">
          <span class="summary-label">מחיר סופי</span>
          <span class="summary-value">${fmt(finalPrice)} ₪</span>
        </div>
      </div>
      
      <!-- Validity Note -->
      <div class="validity-note">
        <strong>תוקף ההצעה:</strong> הצעה זו תקפה ל-30 יום מתאריך הנפקתה. המחירים כוללים ${project.vat_included ? 'מע"מ' : 'אינם כוללים מע"מ'}.
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-row">
        <div class="footer-section">
          <div class="footer-title">פרטי קשר</div>
          <div class="footer-content">
            אליאב אהרון<br>
            טלפון: 052-9556123<br>
            דוא"ל: eliav1334@gmail.com
          </div>
        </div>
        <div class="footer-section">
          <div class="footer-title">פרטי החברה</div>
          <div class="footer-content">
            א.א קידוחים ופיתוח<br>
            רישיון קבלן: 36281<br>
            אזור: אליכין
          </div>
        </div>
        <div class="footer-section">
          <div class="footer-title">תנאי תשלום</div>
          <div class="footer-content">
            50% מקדמה<br>
            50% עם סיום העבודה<br>
            תשלום בהעברה בנקאית
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 11px; color: #868e96;">
        מסמך זה הופק באמצעות מערכת ניהול תמחור א.א קידוחים ופיתוח
      </div>
    </div>
  </div>
  
  <script>
    // Auto-print on load (optional - can be removed if not desired)
    // window.onload = function() { 
    //   setTimeout(() => window.print(), 500); 
    // };
  </script>
</body>
</html>`;
}

export default router;
