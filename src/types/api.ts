export type Role = "admin" | "staff";
export type StockStatus = "ok" | "low" | "out";
export type MovementType = "IN" | "OUT";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category_id: number;
  category_name: string;
  low_stock_threshold: number;
  stock_qty: number;
  stock_status: StockStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Movement = {
  id: number;
  product_id: number;
  product_sku: string;
  product_name: string;
  movement_type: MovementType;
  quantity: number;
  note: string | null;
  created_by: number;
  created_by_name: string;
  created_by_email: string;
  created_at: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};

export type TrendPoint = { date: string; in_qty: number; out_qty: number };

export type DashboardSummary = {
  generated_at: string;
  products: { total: number; active: number; archived: number };
  stock_status: { ok: number; low: number; out: number };
  movements: {
    window_days: number;
    in_qty: number;
    out_qty: number;
    count: number;
    trend: TrendPoint[];
  };
  categories: {
    total: number;
    breakdown: {
      category_id: number;
      category_name: string;
      product_count: number;
      low_stock_count: number;
    }[];
  };
  low_stock: Product[];
  recent_movements: Movement[];
};

export type SessionResponse = {
  user: User;
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
};

export type ApiErrorEnvelope = { error: { code: string; message: string } };