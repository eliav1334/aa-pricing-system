import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';
import { showToast } from '../hooks/useToast';

const T = {
  card: '#FFFFFF', border: '#E4E4EE', bg: '#F7F7FC',
  text1: '#1E1E2D', text2: '#6E7191', text3: '#A0A3BD',
  accent: '#5B6CFF', accentBg: '#EEEEFF',
  cta: '#F97316', green: '#00BA88', greenBg: '#E6F9F1',
  red: '#FF6B6B', redBg: '#FFF0F0', orange: '#FFAA33', orangeBg: '#FFF5E6',
  purple: '#7B61FF', purpleBg: '#F0EDFF',
  f: "'Inter','Heebo',sans-serif",
};

const CAT_LABELS: Record<string, string> = {
  'חומר': '🧱 חומר',
  'עבודה': '👷 עבודה',
  'ציוד': '🚜 ציוד',
  'הובלה': '🚛 הובלה',
  'כללי': '📋 כללי',
};

const CAT_COLORS: Record<string, string> = {
  'חומר': '#F97316',
  'עבודה': '#5B6CFF',
  'ציוד': '#7B61FF',
  'הובלה': '#00BA88',
  'כללי': '#A0A3BD',
};

interface ScanFile {
  path: string;
  fileName: string;
  folder: string;
  fileType: string;
  docType: string;
  supplier?: string;
  date?: string;
  items: {
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
    category: string;
    _status?: string;
  }[];
}

interface ScanReport {
  scanDate: string;
  totalFiles: number;
  totalItems: number;
  files: ScanFile[];
}

export default function Knowledge() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFolder, setFilterFolder] = useState('');
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [tab, setTab] = useState<'review' | 'approved'>('review');
  const [approvedItems, setApprovedItems] = useState<any[]>([]);
  const [stats, setStats] = useState<{ total: number; byCategory: any[]; bySupplier: any[] } | null>(null);

  useEffect(() => { loadReport(); loadStats(); }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await api.get<ScanReport>('/knowledge/scan-report');
      setReport(data);
    } catch { showToast('שגיאה בטעינת דוח'); }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const s = await api.get<any>('/knowledge/stats');
      setStats(s);
      if (s.total > 0) {
        const items = await api.get<any[]>('/knowledge/items');
        setApprovedItems(items);
      }
    } catch { }
  };

  // Unique folders
  const folders = useMemo(() => {
    if (!report) return [];
    return [...new Set(report.files.map(f => f.folder))].sort();
  }, [report]);

  // Filtered files
  const filtered = useMemo(() => {
    if (!report) return [];
    return report.files.filter(f => {
      if (filterFolder && f.folder !== filterFolder) return false;
      if (filterCat) {
        if (!f.items.some(it => it.category === filterCat)) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!f.fileName.toLowerCase().includes(s) &&
            !f.folder.toLowerCase().includes(s) &&
            !f.items.some(it => it.description.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [report, search, filterCat, filterFolder]);

  const totalFilteredItems = useMemo(() => filtered.reduce((s, f) => s + f.items.length, 0), [filtered]);

  // Toggle selection
  const itemKey = (fileName: string, desc: string) => `${fileName}::${desc}`;

  const toggleItem = (key: string) => {
    setSelectedItems(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const selectAllInFile = (file: ScanFile) => {
    setSelectedItems(prev => {
      const n = new Set(prev);
      const allSelected = file.items.every(it => n.has(itemKey(file.fileName, it.description)));
      for (const it of file.items) {
        const k = itemKey(file.fileName, it.description);
        if (allSelected) n.delete(k); else n.add(k);
      }
      return n;
    });
  };

  // Approve selected
  const approveSelected = async () => {
    if (selectedItems.size === 0) { showToast('לא נבחרו פריטים'); return; }
    setApproving(true);
    try {
      const items: any[] = [];
      for (const file of (report?.files || [])) {
        for (const it of file.items) {
          if (selectedItems.has(itemKey(file.fileName, it.description))) {
            items.push({
              description: it.description,
              unit: it.unit,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: it.total,
              category: it.category,
              sourceFile: file.fileName,
              folder: file.folder,
              docType: file.docType,
              supplier: file.supplier || '',
              date: file.date || '',
            });
          }
        }
      }
      const result = await api.post<{ ok: boolean; added: number }>('/knowledge/approve', { items });
      showToast(`${result.added} פריטים אושרו ונשמרו`);
      setSelectedItems(new Set());
      loadReport();
      loadStats();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setApproving(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>טוען...</div>;

  return (
    <div style={{ fontFamily: T.f, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text1, marginBottom: 4 }}>🧠 בסיס ידע תמחור</h1>
        <p style={{ fontSize: 14, color: T.text3 }}>סקירה ואישור מחירים מקבצי הצעות מחיר קודמים</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: T.greenBg, borderRadius: 14, padding: '14px 18px', border: '1.5px solid #00BA8825' }}>
            <div style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>אושרו</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.green }}>{stats.total}</div>
          </div>
          <div style={{ background: T.orangeBg, borderRadius: 14, padding: '14px 18px', border: '1.5px solid #FFAA3325' }}>
            <div style={{ fontSize: 11, color: T.orange, fontWeight: 700 }}>ממתינים</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.orange }}>{report?.totalItems || 0}</div>
          </div>
          <div style={{ background: T.accentBg, borderRadius: 14, padding: '14px 18px', border: '1.5px solid #5B6CFF25' }}>
            <div style={{ fontSize: 11, color: T.accent, fontWeight: 700 }}>קבצים</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{report?.files.length || 0}</div>
          </div>
          <div style={{ background: T.purpleBg, borderRadius: 14, padding: '14px 18px', border: '1.5px solid #7B61FF25' }}>
            <div style={{ fontSize: 11, color: T.purple, fontWeight: 700 }}>נבחרו</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.purple }}>{selectedItems.size}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab('review')} style={{ fontFamily: T.f, padding: '8px 20px', borderRadius: '10px 10px 0 0', border: `1.5px solid ${T.border}`, borderBottom: tab === 'review' ? '2px solid #fff' : `1.5px solid ${T.border}`, background: tab === 'review' ? '#fff' : T.bg, fontSize: 13, fontWeight: 700, color: tab === 'review' ? T.accent : T.text3, cursor: 'pointer' }}>
          📋 סקירת קבצים ({filtered.length})
        </button>
        <button onClick={() => setTab('approved')} style={{ fontFamily: T.f, padding: '8px 20px', borderRadius: '10px 10px 0 0', border: `1.5px solid ${T.border}`, borderBottom: tab === 'approved' ? '2px solid #fff' : `1.5px solid ${T.border}`, background: tab === 'approved' ? '#fff' : T.bg, fontSize: 13, fontWeight: 700, color: tab === 'approved' ? T.green : T.text3, cursor: 'pointer' }}>
          ✅ מאושרים ({stats?.total || 0})
        </button>
      </div>

      {tab === 'review' && (
        <>
          {/* Filters + Approve button */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." style={{ fontFamily: T.f, padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 13, flex: 1, minWidth: 180 }} />
            <select value={filterFolder} onChange={e => setFilterFolder(e.target.value)} style={{ fontFamily: T.f, padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 13 }}>
              <option value="">כל התיקיות</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ fontFamily: T.f, padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 13 }}>
              <option value="">כל הקטגוריות</option>
              {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {selectedItems.size > 0 && (
              <button onClick={approveSelected} disabled={approving} style={{ fontFamily: T.f, padding: '8px 18px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${T.green}, #00A070)`, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                {approving ? '⏳ שומר...' : `✅ אשר ${selectedItems.size} פריטים`}
              </button>
            )}
          </div>

          {/* Files list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(file => {
              const isExpanded = expandedFile === file.path;
              const fileSelectedCount = file.items.filter(it => selectedItems.has(itemKey(file.fileName, it.description))).length;

              return (
                <div key={file.path} style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, overflow: 'hidden' }}>
                  {/* File header */}
                  <div onClick={() => setExpandedFile(isExpanded ? null : file.path)} style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: isExpanded ? T.bg : 'transparent' }}>
                    <span style={{ fontSize: 16 }}>{isExpanded ? '▼' : '◀'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>{file.fileName}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                        {file.folder} · {file.docType} · {file.items.length} פריטים
                        {file.supplier && <span style={{ color: T.purple }}> · {file.supplier}</span>}
                        {file.date && <span> · {file.date}</span>}
                      </div>
                    </div>
                    {fileSelectedCount > 0 && (
                      <span style={{ background: T.green, color: '#fff', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                        {fileSelectedCount} נבחרו
                      </span>
                    )}
                    <span style={{ background: T.accentBg, color: T.accent, borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{file.items.length}</span>
                  </div>

                  {/* Items table */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 18px' }}>
                      <div style={{ marginBottom: 8 }}>
                        <button onClick={() => selectAllInFile(file)} style={{ fontFamily: T.f, fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, cursor: 'pointer', color: T.text2 }}>
                          {file.items.every(it => selectedItems.has(itemKey(file.fileName, it.description))) ? '❌ בטל הכל' : '☑ בחר הכל'}
                        </button>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: `1.5px solid ${T.border}` }}>
                            <th style={{ width: 30, padding: '6px 4px' }}></th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: T.text3, fontWeight: 600 }}>תיאור</th>
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: T.text3, fontWeight: 600, width: 60 }}>קטגוריה</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: T.text3, fontWeight: 600, width: 60 }}>יחידה</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: T.text3, fontWeight: 600, width: 70 }}>כמות</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: T.text3, fontWeight: 600, width: 80 }}>מחיר</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: T.text3, fontWeight: 600, width: 90 }}>סה"כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {file.items.map((item, idx) => {
                            const key = itemKey(file.fileName, item.description);
                            const isSelected = selectedItems.has(key);
                            const isApproved = item._status === 'approved';
                            return (
                              <tr key={idx} onClick={() => !isApproved && toggleItem(key)} style={{ borderBottom: `1px solid ${T.border}`, cursor: isApproved ? 'default' : 'pointer', background: isApproved ? T.greenBg : isSelected ? '#F0F0FF' : 'transparent' }}>
                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                  {isApproved ? '✅' : <input type="checkbox" checked={isSelected} readOnly />}
                                </td>
                                <td style={{ padding: '6px 8px', fontWeight: 500, color: T.text1, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description}>{item.description}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: (CAT_COLORS[item.category] || '#ccc') + '20', color: CAT_COLORS[item.category] || '#666', fontWeight: 700 }}>{item.category}</span>
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'left', color: T.text2 }}>{item.unit}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'left', color: T.text2 }}>{fmt(item.quantity)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: T.text1 }}>{item.unitPrice > 0 ? `${fmt(item.unitPrice)} ₪` : '-'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: T.cta }}>{item.total > 0 ? `${fmt(item.total)} ₪` : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: T.text3 }}>
              {report?.files.length === 0 ? 'אין נתוני סריקה. הרץ את סקריפט הסריקה תחילה.' : 'לא נמצאו תוצאות לחיפוש.'}
            </div>
          )}
        </>
      )}

      {tab === 'approved' && (
        <div style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, overflow: 'hidden' }}>
          {approvedItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>אין פריטים מאושרים עדיין. עבור לטאב "סקירת קבצים" כדי לאשר.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1.5px solid ${T.border}`, background: T.bg }}>
                  <th style={{ textAlign: 'right', padding: '10px 14px', color: T.text3, fontWeight: 600 }}>תיאור</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', color: T.text3, fontWeight: 600, width: 70 }}>קטגוריה</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: T.text3, fontWeight: 600, width: 60 }}>יחידה</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: T.text3, fontWeight: 600, width: 80 }}>מחיר</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: T.text3, fontWeight: 600, width: 120 }}>מקור</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: T.text3, fontWeight: 600, width: 80 }}>ספק</th>
                </tr>
              </thead>
              <tbody>
                {approvedItems.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500, color: T.text1 }}>{item.description}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: (CAT_COLORS[item.category] || '#ccc') + '20', color: CAT_COLORS[item.category] || '#666', fontWeight: 700 }}>{item.category}</span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'left', color: T.text2 }}>{item.unit}</td>
                    <td style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: T.text1 }}>{item.unit_price > 0 ? `${fmt(item.unit_price)} ₪` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: 10, color: T.text3 }}>{item.source_file}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: 10, color: T.purple }}>{item.supplier || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
