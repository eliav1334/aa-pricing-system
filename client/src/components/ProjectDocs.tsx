import { useEffect, useState, useRef } from 'react';
import { api } from '../utils/api';
import { showToast } from '../hooks/useToast';

interface Doc {
  id: string;
  project_id: string;
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  category: string;
  notes: string;
  created_at: string;
}

const T = {
  card: '#FFFFFF', border: '#E4E4EE', bg: '#F7F7FC',
  text1: '#1E1E2D', text2: '#6E7191', text3: '#A0A3BD',
  accent: '#5B6CFF', accentBg: '#EEEEFF',
  cta: '#F97316', green: '#00BA88', greenBg: '#E6F9F1',
  red: '#FF6B6B', redBg: '#FFF0F0',
  f: "'Inter','Heebo',sans-serif",
};

const DOC_CATS = [
  { id: 'general', label: 'כללי', ico: '📄' },
  { id: 'spec', label: 'מפרט טכני', ico: '📐' },
  { id: 'drawing', label: 'תכנית/פרט', ico: '📋' },
  { id: 'quote', label: 'הצעת מחיר', ico: '💰' },
  { id: 'contract', label: 'חוזה', ico: '📝' },
  { id: 'photo', label: 'תמונה', ico: '📷' },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(mime: string, name: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (name.endsWith('.pdf')) return '📕';
  if (name.match(/\.xlsx?|\.csv/)) return '📊';
  if (name.match(/\.docx?/)) return '📘';
  if (name.match(/\.dwg|\.dxf/)) return '📐';
  return '📄';
}

export default function ProjectDocs({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [category, setCategory] = useState('general');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get<Doc[]>(`/documents/project/${projectId}`).then(setDocs);
  };
  useEffect(() => { load(); }, [projectId]);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('category', category);

      const res = await fetch(`/api/documents/upload/${projectId}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`✅ ${data.count} קבצים הועלו בהצלחה`);
      load();
    } catch (e: any) {
      showToast('❌ שגיאה: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (doc: Doc) => {
    if (!confirm(`למחוק את "${doc.original_name}"?`)) return;
    await api.del(`/documents/${doc.id}`);
    showToast('נמחק');
    load();
    if (preview?.id === doc.id) setPreview(null);
  };

  const openFile = (doc: Doc) => {
    if (doc.mime_type.startsWith('image/') || doc.original_name.endsWith('.pdf')) {
      setPreview(doc);
    } else {
      window.open(`/api/documents/file/${doc.name}`, '_blank');
    }
  };

  const grouped = DOC_CATS.map(cat => ({
    ...cat,
    docs: docs.filter(d => d.category === cat.id),
  })).filter(g => g.docs.length > 0);

  return (
    <div>
      {/* Upload area */}
      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? T.accent : T.border}`,
          borderRadius: 16, padding: '20px 24px', marginBottom: 16,
          background: dragOver ? T.accentBg : T.bg, transition: 'all .2s',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📎</span>
          <div>
            <div style={{ fontFamily: T.f, fontSize: 14, fontWeight: 700, color: T.text1 }}>
              {uploading ? 'מעלה...' : 'גרור קבצים או לחץ להעלאה'}
            </div>
            <div style={{ fontFamily: T.f, fontSize: 12, color: T.text3, marginTop: 2 }}>
              מפרטים, תכניות, תמונות, הצעות מחיר · עד 50MB
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`,
              fontFamily: T.f, fontSize: 12, background: T.card, color: T.text1, cursor: 'pointer',
            }}
          >
            {DOC_CATS.map(c => <option key={c.id} value={c.id}>{c.ico} {c.label}</option>)}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              fontFamily: T.f, padding: '8px 20px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(249,115,22,.2)',
            }}
          >📂 בחר קבצים</button>
        </div>
        <input ref={fileRef} type="file" multiple
          accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.dwg,.dxf"
          onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
          style={{ display: 'none' }} />
      </div>

      {/* Documents list */}
      {docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: T.text3 }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: .4 }}>📁</div>
          <div style={{ fontFamily: T.f, fontSize: 14, fontWeight: 500 }}>אין מסמכים מצורפים</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grouped.map(group => (
            <div key={group.id}>
              <div style={{ fontFamily: T.f, fontSize: 13, fontWeight: 700, color: T.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {group.ico} {group.label} ({group.docs.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {group.docs.map(doc => (
                  <div key={doc.id} style={{
                    background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`,
                    padding: '14px 16px', cursor: 'pointer', transition: 'all .15s',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                    onClick={() => openFile(doc)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + '44'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = ''; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>{fileIcon(doc.mime_type, doc.original_name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.f, fontSize: 13, fontWeight: 600, color: T.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.original_name}
                        </div>
                        <div style={{ fontFamily: T.f, fontSize: 11, color: T.text3 }}>
                          {formatSize(doc.size)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: T.f, fontSize: 10, color: T.text3 }}>
                        {new Date(doc.created_at).toLocaleDateString('he-IL')}
                      </span>
                      <button onClick={e => { e.stopPropagation(); deleteDoc(doc); }} style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                        color: T.text3, padding: '2px 6px', borderRadius: 6,
                      }}
                        onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redBg; }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = ''; }}
                      >🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview overlay */}
      {preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(30,30,45,.5)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
        }} onClick={() => setPreview(null)}>
          <div style={{
            background: T.card, borderRadius: 20, maxWidth: '90vw', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(30,30,60,.2)', width: preview.mime_type.startsWith('image/') ? 'auto' : 900,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 24px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: T.f, fontSize: 15, fontWeight: 700, color: T.text1 }}>{preview.original_name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`/api/documents/file/${preview.name}`} download={preview.original_name}
                  style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 12, fontWeight: 600, color: T.text2, textDecoration: 'none' }}>
                  📥 הורד
                </a>
                <button onClick={() => setPreview(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: T.bg, cursor: 'pointer', fontSize: 16, color: T.text3 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F0F5', minHeight: 400 }}>
              {preview.mime_type.startsWith('image/') ? (
                <img src={`/api/documents/file/${preview.name}`} alt={preview.original_name} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
              ) : preview.original_name.endsWith('.pdf') ? (
                <iframe src={`/api/documents/file/${preview.name}`} style={{ width: '100%', height: '80vh', border: 'none' }} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>{fileIcon(preview.mime_type, preview.original_name)}</div>
                  <div style={{ fontFamily: T.f, fontSize: 14, fontWeight: 500 }}>אין תצוגה מקדימה לסוג קובץ זה</div>
                  <a href={`/api/documents/file/${preview.name}`} download={preview.original_name}
                    style={{ fontFamily: T.f, display: 'inline-block', marginTop: 16, padding: '10px 24px', borderRadius: 12, background: T.cta, color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
                    📥 הורד קובץ
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
