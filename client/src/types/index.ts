export interface Project {
  id: string;
  name: string;
  client: string;
  type: string;
  address: string;
  date: string;
  status: string;
  notes: string;
  margin_percent: number;
  overhead_percent: number;
  insurance_percent: number;
  vat_included: number;
  created_at: string;
}

export interface CostItem {
  id: string;
  project_id: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  is_actual: number;
  dekel_ref: string;
  sort_order: number;
  created_at: string;
}

export interface PriceItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  price: number;
  supplier: string;
  dekel_id: string;
  chapter: string;
  updated_at: string;
}

export interface Stats {
  projects: number;
  quotes: number;
  active: number;
  done: number;
  prices: number;
  totalVal: number;
}

export const CATEGORIES = [
  { id: 'labor', name: 'עבודה', color: '#2563EB' },
  { id: 'equipment', name: 'ציוד', color: '#EA580C' },
  { id: 'materials', name: 'חומרים', color: '#059669' },
  { id: 'transport', name: 'הובלה', color: '#7C3AED' },
  { id: 'sub', name: 'קבלני משנה', color: '#DB2777' },
  { id: 'permits', name: 'היתרים', color: '#0891B2' },
  { id: 'other', name: 'אחר', color: '#6B7280' },
] as const;

export const TYPES = ['קידוח בנטונייט', 'בורות חלחול', 'עבודות עפר', 'פיתוח שטח', 'הריסה', 'השכרת ציוד', 'אחר'];

export const STATUSES = [
  { id: 'הצעה', cls: 'badge-quote' },
  { id: 'אושר', cls: 'badge-approved' },
  { id: 'בביצוע', cls: 'badge-active' },
  { id: 'הושלם', cls: 'badge-done' },
  { id: 'בוטל', cls: 'badge-cancelled' },
];

export const UNITS = ["מ\"א", "מ\"ק", "מ\"ר", "יח'", 'שעה', 'יום', 'טון', 'פאושל', 'נסיעה', 'מכולה', "י\"ע"];
