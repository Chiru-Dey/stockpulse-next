"use client";

import { useCallback, useState, type FormEvent } from "react";
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
  TableWrapper,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import type { Movement, MovementType, Paginated, Product } from "@/types/api";

const PER_PAGE = 10;
// The API caps per_page at 100; requesting more returns 400 VALIDATION_ERROR.
const PRODUCT_OPTIONS_PER_PAGE = 100;

type RecordForm = {
  product_id: string;
  movement_type: MovementType;
  quantity: string;
  note: string;
};

function emptyRecordForm(): RecordForm {
  return { product_id: "", movement_type: "IN", quantity: "", note: "" };
}

function RecordMovementModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<RecordForm>(emptyRecordForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(
    () => api.get<Paginated<Product>>("/api/products", { per_page: PRODUCT_OPTIONS_PER_PAGE }),
    [],
  );
  const productsState = useAsyncData(loadProducts);
  const activeProducts = (productsState.data?.items ?? []).filter(
    (product) => !product.archived_at,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      product_id: Number(values.product_id),
      movement_type: values.movement_type,
      quantity: Number(values.quantity),
      note: values.note.trim() || null,
    };
    try {
      await api.post("/api/stock-movements", payload);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Record stock movement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {productsState.error && (
          <Alert>Could not load products: {productsState.error}</Alert>
        )}

        <Field label="Product" htmlFor="mv-product">
          <Select id="mv-product" required value={values.product_id}
            onChange={(e) => setValues((v) => ({ ...v, product_id: e.target.value }))}
            disabled={productsState.loading}>
            <option value="" disabled>
              {productsState.loading ? "Loading products…" : "Select a product"}
            </option>
            {activeProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name} (on hand: {product.stock_qty})
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="mv-type">
            <Select id="mv-type" required value={values.movement_type}
              onChange={(e) => setValues((v) => ({ ...v, movement_type: e.target.value as MovementType }))}>
              <option value="IN">IN (stock in)</option>
              <option value="OUT">OUT (stock out)</option>
            </Select>
          </Field>
          <Field label="Quantity" htmlFor="mv-quantity">
            <Input id="mv-quantity" type="number" min={1} max={1000000} required
              value={values.quantity}
              onChange={(e) => setValues((v) => ({ ...v, quantity: e.target.value }))} />
          </Field>
        </div>

        <Field label="Note" htmlFor="mv-note">
          <Textarea id="mv-note" maxLength={500} value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
            placeholder="Optional — e.g. PO #12345, damaged, returned" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Record movement</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MovementsPage() {
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);

  const loadProducts = useCallback(
    () =>
      api.get<Paginated<Product>>("/api/products", {
        per_page: PRODUCT_OPTIONS_PER_PAGE,
        include_archived: "true",
      }),
    [],
  );
  const productsState = useAsyncData(loadProducts);
  const products = productsState.data?.items ?? [];

  const loadMovements = useCallback(
    () =>
      api.get<Paginated<Movement>>("/api/stock-movements", {
        product_id: productId || undefined,
        movement_type: movementType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: PER_PAGE,
      }),
    [productId, movementType, dateFrom, dateTo, page],
  );
  const movementsState = useAsyncData(loadMovements);
  const movements = movementsState.data?.items ?? [];

  function resetFilters() {
    setProductId("");
    setMovementType("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Movements</h1>
          <p className="text-xs text-slate-500">The stock ledger is append-only and immutable.</p>
        </div>
        <Button onClick={() => setRecordOpen(true)}>Record movement</Button>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Product" htmlFor="mvf-product">
            <Select id="mvf-product" value={productId}
              onChange={(e) => { setProductId(e.target.value); setPage(1); }}>
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="mvf-type">
            <Select id="mvf-type" value={movementType}
              onChange={(e) => { setMovementType(e.target.value); setPage(1); }}>
              <option value="">Any</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </Select>
          </Field>
          <Field label="From (UTC)" htmlFor="mvf-from">
            <Input id="mvf-from" type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="To (UTC)" htmlFor="mvf-to">
            <Input id="mvf-to" type="date" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" onClick={resetFilters}>Reset filters</Button>
        </div>
      </Card>

      <Card>
        {movementsState.error && <Alert>{movementsState.error}</Alert>}

        {movementsState.loading && movements.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Spinner /> Loading ledger…
          </div>
        ) : movements.length === 0 ? (
          <EmptyState>No movements match these filters.</EmptyState>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>When (UTC)</Th>
                <Th>Product</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th>By</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <Td className="whitespace-nowrap text-xs">
                    {new Date(movement.created_at).toLocaleString()}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs">{movement.product_sku}</span>
                    <span className="ml-2">{movement.product_name}</span>
                  </Td>
                  <Td>
                    <Badge tone={movement.movement_type === "IN" ? "emerald" : "slate"}>
                      {movement.movement_type}
                    </Badge>
                  </Td>
                  <Td className="text-right font-semibold">{movement.quantity}</Td>
                  <Td>{movement.created_by_name}</Td>
                  <Td className="text-xs text-slate-500">{movement.note ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        {movementsState.data && (
          <PaginationBar
            page={movementsState.data.page}
            pages={movementsState.data.pages}
            total={movementsState.data.total}
            onPage={setPage}
          />
        )}
      </Card>

      <RecordMovementModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSaved={() => {
          setRecordOpen(false);
          void movementsState.reload();
        }}
      />
    </div>
  );
}