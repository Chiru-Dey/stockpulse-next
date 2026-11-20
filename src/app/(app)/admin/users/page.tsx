"use client";

import { useCallback, useState, type FormEvent } from "react";
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
  TableWrapper,
  Td,
  Th,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { useAsyncData } from "@/lib/use-async-data";
import type { Paginated, Role, User } from "@/types/api";

const PER_PAGE = 10;

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type EditUserForm = {
  name: string;
  password: string;
  role: Role;
  is_active: boolean;
};

function emptyCreateForm(): CreateUserForm {
  return { name: "", email: "", password: "", role: "staff" };
}

function editFormFromUser(user: User): EditUserForm {
  return {
    name: user.name,
    password: "",
    role: user.role,
    is_active: user.is_active,
  };
}

function UserFormModal({
  open,
  initial,
  currentUserId,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: User | null;
  currentUserId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [createValues, setCreateValues] = useState<CreateUserForm>(emptyCreateForm());
  const [editValues, setEditValues] = useState<EditUserForm>(
    initial ? editFormFromUser(initial) : { name: "", password: "", role: "staff", is_active: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isSelf = initial !== null && initial.id === currentUserId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (initial) {
        const payload: Record<string, unknown> = {};
        if (editValues.name.trim() && editValues.name !== initial.name) {
          payload.name = editValues.name.trim();
        }
        if (editValues.password) payload.password = editValues.password;
        if (editValues.role !== initial.role) payload.role = editValues.role;
        if (editValues.is_active !== initial.is_active) payload.is_active = editValues.is_active;
        await api.patch(`/api/users/${initial.id}`, payload);
      } else {
        await api.post("/api/users", {
          name: createValues.name.trim(),
          email: createValues.email.trim(),
          password: createValues.password,
          role: createValues.role,
        });
      }
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={initial ? `Edit ${initial.name}` : "New user"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {initial ? (
          <>
            <p className="text-xs text-slate-500">Email cannot be changed. Leave password blank to keep it.</p>
            <Field label="Name" htmlFor="user-name">
              <Input id="user-name" required maxLength={120} value={editValues.name}
                onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} />
            </Field>
            <Field label="New password" htmlFor="user-password" hint="Leave blank to keep current password.">
              <Input id="user-password" type="password" autoComplete="new-password"
                value={editValues.password}
                onChange={(e) => setEditValues((v) => ({ ...v, password: e.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" htmlFor="user-role">
                <Select id="user-role" value={editValues.role} disabled={isSelf}
                  onChange={(e) => setEditValues((v) => ({ ...v, role: e.target.value as Role }))}>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                    checked={editValues.is_active}
                    disabled={isSelf}
                    onChange={(e) => setEditValues((v) => ({ ...v, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>
            </div>
            {isSelf && (
              <Alert tone="info">
                You cannot change your own role or active status. Sign out and back in as another
                admin if you need to change yours.
              </Alert>
            )}
          </>
        ) : (
          <>
            <Field label="Name" htmlFor="new-name">
              <Input id="new-name" required maxLength={120} value={createValues.name}
                onChange={(e) => setCreateValues((v) => ({ ...v, name: e.target.value }))} />
            </Field>
            <Field label="Email" htmlFor="new-email">
              <Input id="new-email" type="email" required maxLength={255} value={createValues.email}
                onChange={(e) => setCreateValues((v) => ({ ...v, email: e.target.value }))} />
            </Field>
            <Field label="Password" htmlFor="new-password" hint="Minimum 8 characters, max 72.">
              <Input id="new-password" type="password" required minLength={8} maxLength={72}
                value={createValues.password}
                onChange={(e) => setCreateValues((v) => ({ ...v, password: e.target.value }))} />
            </Field>
            <Field label="Role" htmlFor="new-role">
              <Select id="new-role" value={createValues.role}
                onChange={(e) => setCreateValues((v) => ({ ...v, role: e.target.value as Role }))}>
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </Select>
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{initial ? "Save changes" : "Create user"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = useCallback(
    () =>
      api.get<Paginated<User>>("/api/users", {
        search: search || undefined,
        page,
        per_page: PER_PAGE,
      }),
    [search, page],
  );
  const usersState = useAsyncData(loadUsers);
  const users = usersState.data?.items ?? [];

  function openCreate() {
    setActionError(null);
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(target: User) {
    setActionError(null);
    setEditing(target);
    setFormOpen(true);
  }

  async function handleToggleActive(target: User) {
    setActionError(null);
    try {
      await api.patch(`/api/users/${target.id}`, { is_active: !target.is_active });
      await usersState.reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  async function handleDelete(target: User) {
    setActionError(null);
    if (
      !window.confirm(
        `Delete ${target.name} (${target.email})? This fails if they recorded any stock movements — deactivate instead.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/api/users/${target.id}`);
      await usersState.reload();
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <Alert tone="info">Admins only.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-xs text-slate-500">Admins only. Last active admin cannot be removed.</p>
        </div>
        <Button onClick={openCreate}>New user</Button>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <Card>
        <div className="max-w-sm">
          <Field label="Search" htmlFor="users-search">
            <Input id="users-search" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name or email" />
          </Field>
        </div>
      </Card>

      <Card>
        {usersState.error && <Alert>{usersState.error}</Alert>}

        {usersState.loading && users.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Spinner /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <EmptyState>No users match this search.</EmptyState>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((target) => {
                const isSelf = target.id === currentUser.id;
                return (
                  <tr key={target.id}>
                    <Td className="font-medium">
                      {target.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </Td>
                    <Td className="text-slate-600">{target.email}</Td>
                    <Td>
                      <Badge tone={target.role === "admin" ? "indigo" : "slate"}>{target.role}</Badge>
                    </Td>
                    <Td>
                      {target.is_active ? (
                        <Badge tone="emerald">active</Badge>
                      ) : (
                        <Badge>inactive</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {new Date(target.created_at).toLocaleDateString()}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => openEdit(target)}>Edit</Button>
                        {target.is_active ? (
                          <Button variant="secondary" onClick={() => void handleToggleActive(target)}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button variant="secondary" onClick={() => void handleToggleActive(target)}>
                            Activate
                          </Button>
                        )}
                        <Button variant="danger" onClick={() => void handleDelete(target)}>Delete</Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}

        {usersState.data && (
          <PaginationBar
            page={usersState.data.page}
            pages={usersState.data.pages}
            total={usersState.data.total}
            onPage={setPage}
          />
        )}
      </Card>

      <UserFormModal
        key={editing?.id ?? "new"}
        open={formOpen}
        initial={editing}
        currentUserId={currentUser.id}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void usersState.reload();
        }}
      />
    </div>
  );
}