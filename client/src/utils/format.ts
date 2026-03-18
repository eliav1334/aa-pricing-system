export const fmt = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 });
};

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('he-IL'); }
  catch { return d; }
};

export const today = (): string => new Date().toISOString().split('T')[0];

export const catInfo = (id: string, cats: readonly { id: string; name: string; color: string }[]) =>
  cats.find(c => c.id === id) || { id: 'other', name: 'אחר', color: '#6B7280' };
