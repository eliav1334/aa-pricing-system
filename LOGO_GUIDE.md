# 🎨 הוספת לוגו חברה להצעות מחיר

## סטטוס נוכחי
המערכת כוללת לוגו SVG מוטמע שמייצג את פעילות החברה (קידוח, בניין, מים).
ניתן להחליף אותו בלוגו האמיתי של החברה בקלות.

## איך להוסיף את הלוגו האמיתי

### שלב 1: הכנת קובץ הלוגו
1. ודא שיש לך קובץ לוגו בפורמט PNG או JPG
2. גודל מומלץ: לפחות 200x80 פיקסלים (יחס רוחב-גובה 2.5:1)
3. רקע שקוף מומלץ (PNG)

### שלב 2: העתקת הקובץ
העתק את קובץ הלוגו לתיקיית הפרויקט:

```bash
# מהמחשב המקומי למערכת:
cp /path/to/your/logo.png /workspace/client/public/assets/logo.png

# או אם הקובץ כבר במערכת:
cp aa-kiduchim-logo.png /workspace/client/public/assets/logo.png
```

### שלב 3: עדכון הקוד
ערוך את הקובץ `/workspace/server/routes/export.ts` ושנה את ה-data URI בשורה ~355:

**לפני:**
```html
<img src="data:image/svg+xml;base64,..." 
     alt="א.א קידוחים ופיתוח" 
     class="company-logo"
     onerror="this.style.display='none'"/>
```

**אחרי:**
```html
<img src="/assets/logo.png" 
     alt="א.א קידוחים ופיתוח" 
     class="company-logo"
     onerror="this.style.display='none'"/>
```

### שלב 4 (אופציונלי): הטמעת הלוגו
אם אתה רוצה שהלוגו יוטמע ישירות ב-HTML (ללא תלות בקובץ חיצוני), המר את הלוגו ל-base64:

```bash
# המרת הקובץ ל-base64
base64 -w 0 client/public/assets/logo.png > /tmp/logo-base64.txt

# הצג את התוצאה
cat /tmp/logo-base64.txt
```

ואז שנה ב-`export.ts`:
```html
<img src="data:image/png;base64,iVBORw0KGg..." 
     alt="א.א קידוחים ופיתוח" 
     class="company-logo"/>
```

## עיצוב הלוגו

ה-CSS של הלוגו ב-`export.ts`:

```css
.company-logo {
  height: 80px;           /* גובה הלוגו */
  width: auto;            /* רוחב אוטומטי */
  object-fit: contain;    /* שמירה על יחס גובה-רוחב */
  filter: brightness(0) invert(1);  /* הפיכה ללבן (רקע כחול כהה) */
}
```

### התאמות אפשריות:

1. **שינוי גודל:**
   ```css
   height: 100px;  /* לוגו גדול יותר */
   ```

2. **ללא פילטר צבע (אם הלוגו כבר לבן):**
   ```css
   /* הסר את השורה: */
   filter: brightness(0) invert(1);
   ```

3. **רקע ללוגו:**
   ```css
   background: rgba(255,255,255,0.1);
   padding: 10px;
   border-radius: 8px;
   ```

## בדיקה
לאחר השינויים:

1. הפעל מחדש את השרת:
   ```bash
   # במסוף:
   cd /workspace/server
   npx tsx index.ts
   ```

2. פתח הצעת מחיר בדפדפן:
   ```
   http://localhost:3002/api/export/quote/<PROJECT_ID>
   ```

3. בדוק שהלוגו מוצג כראוי

## פתרון בעיות

### הלוגו לא מוצג
- בדוק שהקובץ קיים ב-`client/public/assets/logo.png`
- בדוק את ה-console של הדפדפן לשגיאות
- ודא שהנתיב נכון (עם או בלי `/` בהתחלה)

### הלוגו חתוך או מעוות
- שנה את `object-fit` ל-`cover` במקום `contain`
- התאם את ה-`height` בהתאם לגודל הלוגו

### הלוגו בצבע לא נכון
- הסר את `filter: brightness(0) invert(1);` אם הלוגו כבר בצבע לבן
- השתמש ב-`opacity: 0.9;` לשקיפות חלקית

---

**עדכון אחרון:** 5 בספטמבר 2026
