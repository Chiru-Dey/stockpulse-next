"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { PaginationBar } from "@/components/pagination-bar";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  StockBadge,
  TableWrapper,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import type { Category, Paginated, Product } from "@/types/api";

const PER_PAGE = 10;

type ProductFormValues = {
  name: string;
  sku: string;
  description: string;
  category_id: string;
  low_stock_threshold: string;
};

function emptyForm(): ProductFormValues {
  return { name: "", sku: "", description: "", category_id: "", low_stock_threshold: "5" };
}

function formFromProduct(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? "",
    category_id: String(product.category_id),
    low_stock_threshold: String(product.low_stock_threshold),
  };
}

function ProductFormModal({
  open,
  initial,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(
    initial ? formFromProduct(initial) : emptyForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      description: values.description.trim() || null,
      category_id: Number(values.category_id),
      low_stock_threshold: Number(values.low_stock_threshold),
    };
    try {
      if (initial) {
        await api.patch(`/api/products/${initial.id}`, payload);
      } else {
        await api.post("/api/products", payload);
      }
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={initial ? `Edit ${initial.sku}` : "New product"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Name" htmlFor="product-name">
          <Input id="product-name" required maxLength={200} value={values.name}
            onChange={(e) => set("name", e.target.value)} placeholder="Mineral Water 1L" />
        </Field>

        <Field label="SKU" htmlFor="product-sku" hint="Stored uppercase; must be unique.">
          <Input id="product-sku" required maxLength={64} value={values.sku}
            onChange={(e) => set("sku", e.target.value)} placeholder="SKU-BEV-004" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="product-category">
            <Select id="product-category" required value={values.category_id}
              onChange={(e) => set("category_id", e.target.value)}>
              <option value="" disabled>Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Low-stock threshold" htmlFor="product-threshold">
            <Input id="product-threshold" type="number" min={0} max={1000000} required
              value={values.low_stock_threshold}
              onChange={(e) => set("low_stock_threshold", e.target.value)} />
          </Field>
        </div>

        <Field label="Description" htmlFor="product-description">
          <Textarea id="product-description" maxLength={2000} value={values.description}
            onChange={(e) => set("description", e.target.value)} placeholder="Optional" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{initial ? "Save changes" : "Create product"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCategories = useCallback(
    () => api.get<Paginated<Category>>("/api/categories", { per_page: 100 }),
    [],
  );
  const categoriesState = useAsyncData(loadCategories);

  const loadProducts = useCallback(
    () =>
      api.get<Paginated<Product>>("/api/products", {
        search: search || undefined,
        category_id: categoryId || undefined,
        stock_status: stockStatus || undefined,
        include_archived: includeArchived ? "true" : undefined,
        page,
        per_page: PER_PAGE,
      }),
    [search, categoryId, stockStatus, includeArchived, page],
  );
  const productsState = useAsyncData(loadProducts);

  const categories = categoriesState.data?.items ?? [];
  const products = productsState.data?.items ?? [];

  function handleSearch(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  function openCreate() {
    setActionError(null);
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setActionError(null);
    setEditing(product);
    setFormOpen(true);
  }

  async function handleArchive(product: Product) {
    setActionError(null);
    if (!window.confirm(`Archive ${product.sku}? Its movements stay in the ledger.`)) return;
    try {
      await api.delete(`/api/products/${product.id}`);
      await productsState.reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  async function handleRestore(product: Product) {
    setActionError(null);
    try {
      await api.patch(`/api/products/${product.id}`, { archived: false });
      await productsState.reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="text-xs text-slate-500">Stock quantities only change via the movement ledger.</p>
        </div>
        {isAdmin && <Button onClick={openCreate}>New product</Button>}
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Search" htmlFor="filter-search">
            <Input id="filter-search" value={searchInput} onChange={(e) => handleSearch(e.target.value)}
              placeholder="SKU or name" />
          </Field>
          <Field label="Category" htmlFor="filter-category">
            <Select id="filter-category" value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Stock status" htmlFor="filter-status">
            <Select id="filter-status" value={stockStatus}
              onChange={(e) => { setStockStatus(e.target.value); setPage(1); }}>
              <option value="">Any status</option>
              <option value="ok">OK</option>
              <option value="low">Low</option>
              <option value="out">Out</option>
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                checked={includeArchived}
                onChange={(e) => { setIncludeArchived(e.target.checked); setPage(1); }} />
              Include archived
            </label>
          </div>
        </div>
      </Card>

      <Card>
        {productsState.error && <Alert>{productsState.error}</Alert>}

        {productsState.loading && products.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Spinner /> Loading products…
          </div>
        ) : products.length === 0 ? (
          <EmptyState>No products match these filters.</EmptyState>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Threshold</Th>
                <Th>Status</Th>
                {isAdmin && <Th className="text-right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className={product.archived_at ? "opacity-60" : undefined}>
                  <Td className="font-mono text-xs">{product.sku}</Td>
                  <Td>
                    {product.name}
                    {product.archived_at && (
                      <span className="ml-2"><Badge>archived</Badge></span>
                    )}
                  </Td>
                  <Td>{product.category_name}</Td>
                  <Td className="text-right font-semibold">{product.stock_qty}</Td>
                  <Td className="text-right">{product.low_stock_threshold}</Td>
                  <Td><StockBadge status={product.stock_status} /></Td>
                  {isAdmin && (
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => openEdit(product)}>Edit</Button>
                        {product.archived_at ? (
                          <Button variant="secondary" onClick={() => void handleRestore(product)}>Restore</Button>
                        ) : (
                          <Button variant="danger" onClick={() => void handleArchive(product)}>Archive</Button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        {productsState.data && (
          <PaginationBar
            page={productsState.data.page}
            pages={productsState.data.pages}
            total={productsState.data.total}
            onPage={setPage}
          />
        )}
      </Card>

      <ProductFormModal
        key={editing?.id ?? "new"}
        open={formOpen}
        initial={editing}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void productsState.reload();
        }}
      />
    </div>
  );
}