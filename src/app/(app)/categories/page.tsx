"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { PaginationBar } from "@/components/pagination-bar";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
  TableWrapper,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import type { Category, Paginated } from "@/types/api";

const PER_PAGE = 10;

type CategoryFormValues = { name: string; description: string };

function CategoryFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<CategoryFormValues>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
    };
    try {
      if (initial) {
        await api.patch(`/api/categories/${initial.id}`, payload);
      } else {
        await api.post("/api/categories", payload);
      }
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={initial ? `Edit ${initial.name}` : "New category"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Name" htmlFor="category-name">
          <Input id="category-name" required maxLength={120} value={values.name}
            onChange={(e) => setValues((c) => ({ ...c, name: e.target.value }))}
            placeholder="Beverages" />
        </Field>

        <Field label="Description" htmlFor="category-description">
          <Textarea id="category-description" maxLength={2000} value={values.description}
            onChange={(e) => setValues((c) => ({ ...c, description: e.target.value }))}
            placeholder="Optional" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{initial ? "Save changes" : "Create category"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCategories = useCallback(
    () =>
      api.get<Paginated<Category>>("/api/categories", {
        search: search || undefined,
        page,
        per_page: PER_PAGE,
      }),
    [search, page],
  );
  const categoriesState = useAsyncData(loadCategories);

  const categories = categoriesState.data?.items ?? [];

  function handleSearch(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  async function handleDelete(category: Category) {
    setActionError(null);
    if (!window.confirm(`Delete category "${category.name}"? This fails if products still use it.`)) return;
    try {
      await api.delete(`/api/categories/${category.id}`);
      await categoriesState.reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="text-xs text-slate-500">Names are unique, case-insensitively.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setActionError(null); setEditing(null); setFormOpen(true); }}>
            New category
          </Button>
        )}
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <Card>
        <div className="max-w-sm">
          <Field label="Search" htmlFor="category-search">
            <Input id="category-search" value={searchInput} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Name or description" />
          </Field>
        </div>
      </Card>

      <Card>
        {categoriesState.error && <Alert>{categoriesState.error}</Alert>}

        {categoriesState.loading && categories.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Spinner /> Loading categories…
          </div>
        ) : categories.length === 0 ? (
          <EmptyState>No categories match this search.</EmptyState>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Created</Th>
                {isAdmin && <Th className="text-right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <Td className="font-medium">{category.name}</Td>
                  <Td className="text-slate-500">{category.description ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {new Date(category.created_at).toLocaleDateString()}
                  </Td>
                  {isAdmin && (
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => { setActionError(null); setEditing(category); setFormOpen(true); }}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => void handleDelete(category)}>Delete</Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        {categoriesState.data && (
          <PaginationBar
            page={categoriesState.data.page}
            pages={categoriesState.data.pages}
            total={categoriesState.data.total}
            onPage={setPage}
          />
        )}
      </Card>

      <CategoryFormModal
        key={editing?.id ?? "new"}
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void categoriesState.reload();
        }}
      />
    </div>
  );
}