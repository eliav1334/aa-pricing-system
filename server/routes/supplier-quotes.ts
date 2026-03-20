import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// Get all supplier quotes for a project (with items)
router.get('/project/:projectId', (req, res) => {
  try {
    const quotes = db.prepare(
      'SELECT * FROM supplier_quotes WHERE project_id = ? ORDER BY created_at DESC'
    ).all(req.params.projectId) as any[];

    // Attach items to each quote
    const getItems = db.prepare(
      'SELECT * FROM supplier_quote_items WHERE quote_id = ? ORDER BY created_at'
    );
    for (const q of quotes) {
      q.items = getItems.all(q.id);
    }

    res.json(quotes);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בטעינת הצעות ספק: ' + e.message });
  }
});

// Get all supplier quote items linked to cost items in a project (flat list for BOQ display)
router.get('/items/:projectId', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT qi.*, sq.supplier_name
      FROM supplier_quote_items qi
      JOIN supplier_quotes sq ON qi.quote_id = sq.id
      WHERE sq.project_id = ?
      ORDER BY sq.supplier_name, qi.created_at
    `).all(req.params.projectId);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Create supplier quote with items (from SmartImport)
router.post('/', (req, res) => {
  try {
    const { project_id, supplier_name, supplier_id, quote_number, quote_date, items } = req.body;
    if (!project_id || !supplier_name || !items?.length) {
      return res.status(400).json({ error: 'חסרים נתונים (project_id, supplier_name, items)' });
    }

    const quoteId = randomUUID();

    const insertQuote = db.prepare(`
      INSERT INTO supplier_quotes (id, project_id, supplier_name, supplier_id, quote_number, quote_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO supplier_quote_items (id, quote_id, catalog_number, description, unit, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertQuote.run(quoteId, project_id, supplier_name, supplier_id || '', quote_number || '', quote_date || '');
      for (const item of items) {
        const total = Math.round((item.quantity || 0) * (item.unit_price || 0) * 100) / 100;
        insertItem.run(
          randomUUID(), quoteId,
          item.catalog_number || '', item.description || '',
          item.unit || '', item.quantity || 0, item.unit_price || 0, total
        );
      }
    });

    tx();
    res.json({ ok: true, id: quoteId, count: items.length });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בשמירת הצעת ספק: ' + e.message });
  }
});

// Link a supplier quote item to a cost item + learn the mapping for future use
router.put('/link/:itemId', (req, res) => {
  try {
    const { cost_item_id } = req.body;
    db.prepare('UPDATE supplier_quote_items SET cost_item_id = ? WHERE id = ?')
      .run(cost_item_id || '', req.params.itemId);

    // Learn: save this mapping to term_mappings for future auto-match
    if (cost_item_id) {
      const qi = db.prepare('SELECT description FROM supplier_quote_items WHERE id = ?').get(req.params.itemId) as any;
      const ci = db.prepare('SELECT description FROM cost_items WHERE id = ?').get(cost_item_id) as any;
      if (qi && ci) {
        // Extract key words from supplier item → map to cost item description
        const supplierTerm = qi.description.replace(/\([\d]+\)/g, '').replace(/\s+/g, ' ').trim();
        const costTerm = ci.description.replace(/\([\d]+\)/g, '').replace(/\s+/g, ' ').trim();
        // Check if mapping already exists
        const exists = db.prepare(
          'SELECT id FROM term_mappings WHERE term = ? AND canonical = ?'
        ).get(supplierTerm.toLowerCase(), costTerm.toLowerCase());
        if (!exists) {
          db.prepare(
            'INSERT INTO term_mappings (id, term, canonical, category, source) VALUES (?, ?, ?, ?, ?)'
          ).run(randomUUID(), supplierTerm.toLowerCase(), costTerm.toLowerCase(), 'learned', 'user');
        }
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בקישור: ' + e.message });
  }
});

// Auto-match supplier items to cost items using term ontology + keyword matching
router.post('/auto-match/:projectId', (req, res) => {
  try {
    const projectId = req.params.projectId;

    // Get all cost items
    const costItems = db.prepare(
      'SELECT id, description FROM cost_items WHERE project_id = ?'
    ).all(projectId) as { id: string; description: string }[];

    // Get all unlinked supplier quote items
    const quoteItems = db.prepare(`
      SELECT qi.id, qi.description, qi.catalog_number
      FROM supplier_quote_items qi
      JOIN supplier_quotes sq ON qi.quote_id = sq.id
      WHERE sq.project_id = ? AND (qi.cost_item_id IS NULL OR qi.cost_item_id = '')
    `).all(projectId) as { id: string; description: string; catalog_number: string }[];

    if (quoteItems.length === 0 || costItems.length === 0) {
      return res.json({ ok: true, matched: 0 });
    }

    // Load term ontology
    const allTerms = db.prepare('SELECT term, canonical, category FROM term_mappings').all() as
      { term: string; canonical: string; category: string }[];

    // Build lookup: term → canonical(s)
    const termToCanonical = new Map<string, string[]>();
    for (const t of allTerms) {
      const key = t.term.toLowerCase();
      if (!termToCanonical.has(key)) termToCanonical.set(key, []);
      termToCanonical.get(key)!.push(t.canonical.toLowerCase());
    }

    const normalize = (s: string) => s
      .replace(/["\u05F4\u05F3'()]/g, '')
      .replace(/\/\//g, ' ')
      .replace(/\d+[\/x]\d+[\/x]?\d*/g, '')   // remove dimensions like 100/17/25
      .replace(/\s+/g, ' ').trim().toLowerCase();

    const STOP = new Set(['לפי', 'כולל', 'עם', 'של', 'גם', 'או', 'את', 'על', 'פרט', 'סוג', 'דגם', 'כמות', 'אפור', 'שחור', 'לבן', 'צהוב', 'אדום', 'זהוב']);

    // Strip Hebrew prefixes: ל, ה, ב, מ, ו, כ, ש — but ONLY for specific prefix patterns
    // to avoid breaking real words like שפה, בלימה, משתלבת, הפרדה, כורכרי
    const KNOWN_WORDS = new Set([
      'שפה', 'שפות', 'בלימה', 'בלוק', 'בטון', 'ביוב', 'בור', 'ברז',
      'משתלבת', 'משושית', 'מדרגה', 'מרצפת', 'מעצור', 'מלט', 'מצע', 'מילוי',
      'הפרדה', 'הריסה', 'הובלה', 'הידוק',
      'כורכרי', 'כביש', 'כלונס',
      'שוחה', 'שרוול', 'שביל', 'שלח',
      'ביצוע', 'בניה', 'בנייה', 'ברזל',
      'מדברי', 'מסותת', 'מסיבית',
      'סימון', 'סלע', 'סימוני',
    ]);
    const stripPrefix = (w: string): string => {
      if (w.length <= 2) return w;
      if (KNOWN_WORDS.has(w)) return w; // Don't strip known words
      const prefixes = ['ל', 'ה', 'ב', 'מ', 'ו', 'כ', 'ש'];
      if (prefixes.includes(w[0])) {
        const stripped = w.substring(1);
        if (stripped.length >= 2) return stripped;
      }
      return w;
    };

    const getWords = (s: string) => normalize(s).split(' ')
      .filter(w => w.length > 1 && !STOP.has(w))
      .filter(w => !/^\d+$/.test(w))  // Remove pure numbers (catalog numbers, dimensions)
      .map(w => stripPrefix(w));

    // CONFLICT GROUPS: words that indicate completely different product categories.
    // If supplier has word from group A and cost item has word from group B → penalize heavily.
    const CONFLICT_GROUPS: string[][] = [
      ['טיח', 'ציפוי', 'שליכט'],  // plaster/coating
      ['אבן', 'גן', 'בלימה', 'שפה', 'גדורה', 'משושית', 'מישושית', 'ריצוף', 'משתלבת', 'מרצפת', 'סימון', 'תעלה', 'ניקוז', 'נטורה'], // stone/paving
      ['בטון', 'יציקה', 'רדימקס'], // concrete
      ['חשמל', 'תאורה', 'כבלים'], // electrical
      ['אינסטלציה', 'צנרת', 'ברז'], // plumbing
    ];

    // Check if two word sets have a conflict (one from group A, other from group B)
    const hasConflict = (words1: string[], words2: string[]): boolean => {
      for (const group of CONFLICT_GROUPS) {
        for (const otherGroup of CONFLICT_GROUPS) {
          if (group === otherGroup) continue;
          const in1 = words1.some(w => group.includes(w));
          const in2 = words2.some(w => otherGroup.includes(w));
          const in1other = words1.some(w => otherGroup.includes(w));
          const in2other = words2.some(w => group.includes(w));
          // Conflict: one set has a word from group A, the other from group B
          if ((in1 && in2 && !in1other && !in2other)) return true;
        }
      }
      return false;
    };

    // Resolve a word/phrase to its canonical forms using the ontology
    const resolveCanonicals = (words: string[]): Set<string> => {
      const canonicals = new Set<string>();
      const text = words.join(' ');

      for (const [term, cans] of termToCanonical) {
        // 1. Exact full-term match in text
        if (text.includes(term)) {
          for (const c of cans) canonicals.add(c);
          continue;
        }

        // 2. Fuzzy multi-word match: all words of the term appear in the text (in any order)
        const termWords = term.split(' ').filter(w => w.length > 1);
        if (termWords.length >= 2) {
          const allFound = termWords.every(tw =>
            words.some(w => w === tw || (w.length >= 3 && tw.length >= 3 && tw.startsWith(w.substring(0, 3))))
          );
          if (allFound) {
            for (const c of cans) canonicals.add(c);
          }
        }
      }

      // 3. Try single words (with prefix stripping)
      for (const w of words) {
        if (termToCanonical.has(w)) {
          for (const c of termToCanonical.get(w)!) canonicals.add(c);
        }
        // Also try with common prefixes stripped
        const stripped = stripPrefix(w);
        if (stripped !== w && termToCanonical.has(stripped)) {
          for (const c of termToCanonical.get(stripped)!) canonicals.add(c);
        }
      }

      return canonicals;
    };

    const update = db.prepare('UPDATE supplier_quote_items SET cost_item_id = ? WHERE id = ?');
    // Allow linking one supplier item to multiple cost items via duplicated rows
    const insertDup = db.prepare(`
      INSERT INTO supplier_quote_items (id, quote_id, catalog_number, description, unit, quantity, unit_price, total_price, cost_item_id)
      SELECT ?, quote_id, catalog_number, description, unit, quantity, unit_price, total_price, ?
      FROM supplier_quote_items WHERE id = ?
    `);
    let matched = 0;

    console.log(`[auto-match] ${quoteItems.length} supplier items, ${costItems.length} cost items, ${allTerms.length} term mappings`);

    const tx = db.transaction(() => {
      for (const qi of quoteItems) {
        const qiWords = getWords(qi.description);
        if (qiWords.length === 0) continue;

        // Get canonical concepts for this supplier item
        const qiCanonicals = resolveCanonicals(qiWords);
        console.log(`[auto-match] Supplier: "${qi.description}" → words: [${qiWords}] → canonicals: [${[...qiCanonicals]}]`);

        // Find ALL matching cost items above threshold (not just the best one)
        const matches: { id: string; score: number }[] = [];

        for (const ci of costItems) {
          const ciWords = getWords(ci.description);
          if (ciWords.length === 0) continue;

          // CONFLICT CHECK: skip if products are from different categories
          // e.g., "טיח כורכרי" (plaster) vs "אבן גן כורכרי" (stone) — "כורכרי" is shared but they're different things
          if (hasConflict(qiWords, ciWords)) continue;

          const ciCanonicals = resolveCanonicals(ciWords);

          let score = 0;

          // 1. Ontology match: shared canonical concepts (high value = 5 points each)
          for (const canon of qiCanonicals) {
            if (ciCanonicals.has(canon)) score += 5;
          }

          // 2. Direct word match (exact = 2 pts, stem match = 1.5 pts)
          // Stem match: "חניה"↔"חניית", "סימון"↔"סימון", "נכים"↔"נכים"
          for (const qw of qiWords) {
            for (const cw of ciWords) {
              if (qw === cw) {
                score += 2;
              } else {
                // Stem match: share at least 3 chars from start (Hebrew root approximation)
                const minLen = Math.min(qw.length, cw.length);
                if (minLen >= 3) {
                  let shared = 0;
                  for (let c = 0; c < minLen; c++) {
                    if (qw[c] === cw[c]) shared++; else break;
                  }
                  if (shared >= 3 && shared >= minLen * 0.7) score += 1.5;
                }
              }
            }
          }

          if (score >= 4) {
            console.log(`  ✓ match: "${ci.description}" score=${score}`);
            matches.push({ id: ci.id, score });
          } else if (score > 0) {
            console.log(`  ✗ below threshold: "${ci.description}" score=${score}`);
          }
        }

        if (matches.length === 0) continue;

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        // Link first match to original row
        update.run(matches[0].id, qi.id);
        matched++;

        // Link additional matches by duplicating the supplier_quote_item row
        // Use absolute threshold (>= 4) instead of relative — relative threshold
        // was too restrictive: items with score 14 blocked matches scoring 7
        // (e.g., "כורכרי מסותת" matched "ריצוף חניות כורכרי מסותת" at 14
        //  but blocked valid match to "אבן גן כורכרי" at 7 because 7 < 14*0.6=8.4)
        for (let m = 1; m < matches.length; m++) {
          if (matches[m].score >= 4) {
            insertDup.run(randomUUID(), matches[m].id, qi.id);
            matched++;
          }
        }
      }
    });

    tx();
    res.json({ ok: true, matched, total: quoteItems.length });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בהתאמה: ' + e.message });
  }
});

// DEBUG: analyze auto-match without making changes
router.get('/debug-match/:projectId', (req, res) => {
  try {
    const projectId = req.params.projectId;
    const costItems = db.prepare('SELECT id, description FROM cost_items WHERE project_id = ?').all(projectId) as any[];
    const quoteItems = db.prepare(`
      SELECT qi.id, qi.description, qi.catalog_number
      FROM supplier_quote_items qi JOIN supplier_quotes sq ON qi.quote_id = sq.id
      WHERE sq.project_id = ? AND (qi.cost_item_id IS NULL OR qi.cost_item_id = '')
    `).all(projectId) as any[];
    const allTerms = db.prepare('SELECT term, canonical, category FROM term_mappings').all() as any[];

    const termToCanonical = new Map<string, string[]>();
    for (const t of allTerms) {
      const key = t.term.toLowerCase();
      if (!termToCanonical.has(key)) termToCanonical.set(key, []);
      termToCanonical.get(key)!.push(t.canonical.toLowerCase());
    }

    const normalize = (s: string) => s.replace(/["\u05F4\u05F3'()]/g, '').replace(/\/\//g, ' ').replace(/\d+[\/x]\d+[\/x]?\d*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const STOP = new Set(['לפי', 'כולל', 'עם', 'של', 'גם', 'או', 'את', 'על', 'פרט', 'סוג', 'דגם', 'כמות', 'אפור', 'שחור', 'לבן', 'צהוב', 'אדום', 'זהוב']);
    const KW = new Set(['שפה','שפות','בלימה','בלוק','בטון','ביוב','בור','ברז','משתלבת','משושית','מדרגה','מרצפת','מעצור','מלט','מצע','מילוי','הפרדה','הריסה','הובלה','הידוק','כורכרי','כביש','כלונס','שוחה','שרוול','שביל','שלח','ביצוע','בניה','בנייה','ברזל','מדברי','מסותת','מסיבית','סימון','סלע','סימוני']);
    const stripPfx = (w: string): string => { if (w.length <= 2 || KW.has(w)) return w; if (['ל','ה','ב','מ','ו','כ','ש'].includes(w[0]) && w.substring(1).length >= 2) return w.substring(1); return w; };
    const getWords = (s: string) => normalize(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(w => stripPfx(w));

    const resolveCanonicals = (words: string[]): string[] => {
      const canonicals: string[] = [];
      const text = words.join(' ');
      for (const [term, cans] of termToCanonical) {
        if (text.includes(term)) { canonicals.push(...cans.map(c => `${c} (via "${term}")`)); continue; }
        const tw = term.split(' ').filter(w => w.length > 1);
        if (tw.length >= 2 && tw.every(t => words.some(w => w === t || (w.length >= 3 && t.length >= 3 && t.startsWith(w.substring(0, 3)))))) {
          canonicals.push(...cans.map(c => `${c} (fuzzy "${term}")`));
        }
      }
      for (const w of words) {
        if (termToCanonical.has(w)) canonicals.push(...termToCanonical.get(w)!.map(c => `${c} (word "${w}")`));
        const s = stripPfx(w);
        if (s !== w && termToCanonical.has(s)) canonicals.push(...termToCanonical.get(s)!.map(c => `${c} (stripped "${s}")`));
      }
      return canonicals;
    };

    const debug = quoteItems.map((qi: any) => {
      const words = getWords(qi.description);
      const canonicals = resolveCanonicals(words);
      return { supplier_item: qi.description, words, canonicals };
    });

    res.json({ unlinked: quoteItems.length, cost_items: costItems.length, terms: allTerms.length, debug });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Suggest which suppliers to contact for uncovered BOQ items.
// Uses past quotes (across ALL projects) to match suppliers to item types.
router.get('/suggest-suppliers/:projectId', (req, res) => {
  try {
    const projectId = req.params.projectId;

    // 1. Get BOQ items that have NO supplier quote in this project
    const allCostItems = db.prepare(
      'SELECT id, description, unit, quantity FROM cost_items WHERE project_id = ?'
    ).all(projectId) as { id: string; description: string; unit: string; quantity: number }[];

    const coveredIds = new Set(
      (db.prepare(`
        SELECT DISTINCT qi.cost_item_id
        FROM supplier_quote_items qi
        JOIN supplier_quotes sq ON qi.quote_id = sq.id
        WHERE sq.project_id = ? AND qi.cost_item_id IS NOT NULL AND qi.cost_item_id != ''
      `).all(projectId) as { cost_item_id: string }[]).map(r => r.cost_item_id)
    );

    const uncoveredItems = allCostItems.filter(c => !coveredIds.has(c.id));
    if (uncoveredItems.length === 0) {
      return res.json({ suggestions: [], message: 'כל הסעיפים מכוסים' });
    }

    // 2. Get all suppliers with their past quote items (across ALL projects)
    const suppliers = db.prepare('SELECT id, name, contact_person, phone, mobile, email FROM suppliers').all() as any[];
    const supplierProducts = db.prepare(`
      SELECT DISTINCT s.id as supplier_id, s.name as supplier_name, qi.description as product_desc
      FROM suppliers s
      JOIN supplier_quotes sq ON sq.supplier_id = s.id
      JOIN supplier_quote_items qi ON qi.quote_id = sq.id
      WHERE qi.description != ''
    `).all() as { supplier_id: string; supplier_name: string; product_desc: string }[];

    // 3. Build supplier → product keywords map
    const allTerms = db.prepare('SELECT term, canonical FROM term_mappings').all() as { term: string; canonical: string }[];
    const termToCanonical = new Map<string, Set<string>>();
    for (const t of allTerms) {
      const key = t.term.toLowerCase();
      if (!termToCanonical.has(key)) termToCanonical.set(key, new Set());
      termToCanonical.get(key)!.add(t.canonical.toLowerCase());
    }

    const normalize = (s: string) => s.replace(/["\u05F4\u05F3'()]/g, '').replace(/\d+[\/x]\d+[\/x]?\d*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const STOP = new Set(['לפי','כולל','עם','של','גם','או','את','על','פרט','סוג','דגם','כמות','אפור','שחור','לבן','צהוב','אדום','זהוב']);
    const getCanonicals = (text: string): Set<string> => {
      const words = normalize(text).split(' ').filter(w => w.length > 1 && !STOP.has(w));
      const result = new Set<string>();
      const joined = words.join(' ');
      for (const [term, cans] of termToCanonical) {
        if (joined.includes(term)) for (const c of cans) result.add(c);
      }
      for (const w of words) {
        if (termToCanonical.has(w)) for (const c of termToCanonical.get(w)!) result.add(c);
      }
      return result;
    };

    // Build supplier → canonical concepts they supply
    const supplierConcepts = new Map<string, { id: string; name: string; concepts: Set<string>; info: any }>();
    for (const sp of supplierProducts) {
      if (!supplierConcepts.has(sp.supplier_id)) {
        const s = suppliers.find((s: any) => s.id === sp.supplier_id);
        supplierConcepts.set(sp.supplier_id, { id: sp.supplier_id, name: sp.supplier_name, concepts: new Set(), info: s });
      }
      const entry = supplierConcepts.get(sp.supplier_id)!;
      for (const c of getCanonicals(sp.product_desc)) entry.concepts.add(c);
    }

    // 4. Match uncovered BOQ items to suppliers
    const suggestions: { supplier_id: string; supplier_name: string; contact: any; items: typeof uncoveredItems }[] = [];

    for (const [supplierId, supplierData] of supplierConcepts) {
      const matchedItems = uncoveredItems.filter(ci => {
        const ciConcepts = getCanonicals(ci.description);
        // Check if any concept overlaps
        for (const c of ciConcepts) {
          if (supplierData.concepts.has(c)) return true;
        }
        return false;
      });

      if (matchedItems.length > 0) {
        suggestions.push({
          supplier_id: supplierId,
          supplier_name: supplierData.name,
          contact: supplierData.info,
          items: matchedItems,
        });
      }
    }

    // Sort: most matched items first
    suggestions.sort((a, b) => b.items.length - a.items.length);

    res.json({
      suggestions,
      uncovered_total: uncoveredItems.length,
      covered_total: coveredIds.size,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Delete a supplier quote (cascade deletes items)
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM supplier_quote_items WHERE quote_id = ?').run(req.params.id);
    db.prepare('DELETE FROM supplier_quotes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה במחיקה: ' + e.message });
  }
});

export default router;
