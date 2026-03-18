# CLAUDE.md — מערכת תמחור א.א קידוחים ופיתוח

## חזון
מערכת ייעודית לקבלני קידוחים ופיתוח בישראל — כלי שמאפשר לבנות הצעות מחיר מדויקות, ללמוד מפרויקטים קודמים, לנתח קבצים, ולנהל שיח חכם עם המערכת.

## מבנה פרויקט
```
aa-pricing-system/
├── client/                  # React + Vite (פורט 5175)
│   ├── src/
│   │   ├── components/      # קומפוננטות UI
│   │   │   ├── Modal.tsx
│   │   │   ├── ProjectDocs.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── SmartImport.tsx
│   │   ├── hooks/
│   │   │   └── useToast.ts
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Prices.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── Projects.tsx
│   │   │   └── Settings.tsx
│   │   ├── types/index.ts   # טיפוסים משותפים
│   │   ├── utils/
│   │   │   ├── api.ts       # wrapper ל-fetch
│   │   │   └── format.ts    # עיצוב מספרים/תאריכים
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/                  # Express + SQLite (פורט 3002)
│   ├── routes/
│   │   ├── costs.ts         # CRUD סעיפי עלות
│   │   ├── documents.ts     # העלאת/הורדת מסמכים
│   │   ├── prices.ts        # מחירון (9,409 פריטים)
│   │   ├── projects.ts      # CRUD פרויקטים
│   │   └── stats.ts         # סטטיסטיקות
│   ├── db.ts                # SQLite init + schema
│   ├── index.ts             # Express app setup
│   └── package.json
├── data/
│   └── pricing.db           # SQLite DB (9,409 מחירון, 9 פרויקטים, 492 סעיפים)
├── import-all.py
├── import-data.py
└── package.json             # root — concurrently מריץ client+server
```

## הרצה
```bash
npm run dev          # מפעיל client + server
npm run dev:client   # רק client (Vite, פורט 5175)
npm run dev:server   # רק server (tsx watch, פורט 3002)
```

## מחסנית טכנולוגית
- **Frontend:** React 19.1 + TypeScript 5.9 + Vite 7.0 + React Router 7.6
- **Backend:** Express 4.21 + better-sqlite3 + TypeScript
- **DB:** SQLite עם WAL mode + foreign keys
- **כלי עזר:** mammoth (Word), xlsx (Excel), multer (קבצים), helmet (אבטחה)

## סכמת DB
```sql
projects (id, name, client, type, address, date, status, notes, margin_percent, overhead_percent, insurance_percent, vat_included)
cost_items (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, dekel_ref, sort_order)
price_db (id, category, name, unit, price, supplier, dekel_id, chapter, updated_at)
documents (id, project_id, name, original_name, mime_type, size, category, notes)
```

## סטטוסים
טיוטה → הצעה → נשלח → בביצוע → הושלם → בוטל

## קטגוריות סעיפים
עבודה, ציוד, חומרים, הובלה, קבלני משנה, היתרים, אחר

## כללי פיתוח
1. **עברית** — כל ה-UI בעברית, RTL, locale he-IL
2. **TypeScript strict** — אין any, הגדרת interfaces לכל מבנה נתונים
3. **קומפוננטות קטנות** — מקסימום 150 שורות לקומפוננטה, פיצול אם גדל
4. **API wrapper** — כל קריאות API דרך api.ts, לא fetch ישיר
5. **Error handling** — try/catch בכל route בשרת, הודעות שגיאה בעברית
6. **Validation** — Zod לכל input בשרת
7. **בדיקות** — Vitest ל-unit tests
8. **אין hardcoded values** — פורטים, כתובות, הגדרות → .env

## מבנה הצעת מחיר
subtotal (סה"כ סעיפים) → + overhead% → + insurance% → + margin% → + VAT 17% = מחיר סופי
