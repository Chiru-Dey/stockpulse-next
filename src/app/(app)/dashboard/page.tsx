"use client";

import { useCallback } from "react";
import { api } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  Stat,
  StockBadge,
  TableWrapper,
  Td,
  Th,
} from "@/components/ui";
import type { DashboardSummary, TrendPoint } from "@/types/api";

function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => Math.max(point.in_qty, point.out_qty)));
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {points.map((point) => (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <div
                className="w-3 rounded-t bg-emerald-500"
                style={{ height: `${(point.in_qty / max) * 100}%` }}
                title={`${point.date} · IN ${point.in_qty}`}
              />
              <div
                className="w-3 rounded-t bg-rose-500"
                style={{ height: `${(point.out_qty / max) * 100}%` }}
                title={`${point.date} · OUT ${point.out_qty}`}
              />
            </div>
            <span className="text-[10px] text-slate-500">{point.date.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Stock in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Stock out
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const loadSummary = useCallback(
    () => api.get<DashboardSummary>("/api/dashboard/summary"),
    [],
  );
  const { data: summary, error, loading, reload } = useAsyncData(loadSummary);

  if (loading && !summary) {
    return (
      <div className="flex items-center gap-3 py-16 text-slate-500">
        <Spinner /> Loading dashboard…
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={() => void reload()}>Retry</Button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-slate-500">
            Generated {new Date(summary.generated_at).toLocaleString()}
          </p>
        </div>
        <Button variant="secondary" loading={loading} onClick={() => void reload()}>
          Refresh
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Products" value={summary.products.total} />
        <Stat label="Active" value={summary.products.active} />
        <Stat label="Archived" value={summary.products.archived} />
        <Stat label="Healthy" value={summary.stock_status.ok} tone="ok" />
        <Stat label="Low stock" value={summary.stock_status.low} tone="low" />
        <Stat label="Out of stock" value={summary.stock_status.out} tone="out" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title={`Movement trend · last ${summary.movements.window_days} days`}
          className="lg:col-span-2"
          action={
            <div className="flex gap-2 text-xs">
              <Badge tone="emerald">IN {summary.movements.in_qty}</Badge>
              <Badge>OUT {summary.movements.out_qty}</Badge>
            </div>
          }
        >
          <TrendChart points={summary.movements.trend} />
          <p className="mt-3 text-xs text-slate-500">
            {summary.movements.count} movement(s) recorded in this window.
          </p>
        </Card>

        <Card title="Categories">
          {summary.categories.breakdown.length === 0 ? (
            <EmptyState>No categories yet.</EmptyState>
          ) : (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th className="text-right">Products</Th>
                  <Th className="text-right">Low</Th>
                </tr>
              </thead>
              <tbody>
                {summary.categories.breakdown.map((row) => (
                  <tr key={row.category_id}>
                    <Td>{row.category_name}</Td>
                    <Td className="text-right">{row.product_count}</Td>
                    <Td className="text-right">{row.low_stock_count}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>
      </div>

      <Card title="Low-stock watchlist">
        {summary.low_stock.length === 0 ? (
          <EmptyState>Everything is above its threshold. 🎉</EmptyState>
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
              </tr>
            </thead>
            <tbody>
              {summary.low_stock.map((product) => (
                <tr key={product.id}>
                  <Td className="font-mono text-xs">{product.sku}</Td>
                  <Td>{product.name}</Td>
                  <Td>{product.category_name}</Td>
                  <Td className="text-right font-semibold">{product.stock_qty}</Td>
                  <Td className="text-right">{product.low_stock_threshold}</Td>
                  <Td><StockBadge status={product.stock_status} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <Card title="Recent movements">
        {summary.recent_movements.length === 0 ? (
          <EmptyState>No stock movements recorded yet.</EmptyState>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Product</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th>By</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {summary.recent_movements.map((movement) => (
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
      </Card>
    </div>
  );
}