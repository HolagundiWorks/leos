import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Plus, Trash2, X } from 'lucide-react';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Department {
  id: number;
  name: string;
  head_staff_id: number | null;
  head_name: string | null;
  staff_count: number;
}

interface LeaveRequest {
  id: number;
  staff_id: number;
  first_name: string | null;
  last_name: string | null;
  leave_type: string | null;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: number | null;
  created_at: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function fetchDepartments(token: string): Promise<{ departments: Department[]; total: number }> {
  const r = await fetch(`${BASE}/departments`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function createDepartment(token: string, name: string, head_staff_id?: number | null) {
  const r = await fetch(`${BASE}/departments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, head_staff_id }),
  });
  return r.json();
}

async function deleteDepartment(token: string, id: number) {
  const r = await fetch(`${BASE}/departments/${id}/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return r.json();
}

async function fetchLeave(token: string, status?: string): Promise<{ leave_requests: LeaveRequest[]; total: number }> {
  const qs = status ? `?status=${status}` : '';
  const r = await fetch(`${BASE}/leave${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function applyLeave(token: string, data: { staff_id: number; leave_type: string; from_date: string; to_date: string; reason?: string }) {
  const r = await fetch(`${BASE}/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function approveLeave(token: string, id: number) {
  const r = await fetch(`${BASE}/leave/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return r.json();
}

async function rejectLeave(token: string, id: number) {
  const r = await fetch(`${BASE}/leave/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return r.json();
}

// ─── Departments panel ─────────────────────────────────────────────────────────
function DepartmentsPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(token),
    staleTime: 30_000,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHead, setNewHead] = useState<string | null>(null);

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || `#${s.id}`,
  }));

  const createMut = useMutation({
    mutationFn: () => createDepartment(token, newName, newHead ? Number(newHead) : null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      setAddOpen(false);
      setNewName('');
      setNewHead(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDepartment(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });

  const depts = data?.departments ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Departments</Text>
        <Button size="xs" leftSection={<Plus size={13} />} onClick={() => setAddOpen(true)}>
          Add Department
        </Button>
      </Group>

      {isLoading ? (
        <Skeleton height={120} radius="md" />
      ) : depts.length === 0 ? (
        <Text size="sm" c="dimmed">No departments yet. Add one to organize staff.</Text>
      ) : (
        <Table striped withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Department</Table.Th>
              <Table.Th>Head</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Staff</Table.Th>
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {depts.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td><Text fw={500} size="sm">{d.name}</Text></Table.Td>
                <Table.Td><Text size="sm" c="dimmed">{d.head_name ?? '—'}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm">{d.staff_count}</Text></Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    p={4}
                    onClick={() => deleteMut.mutate(d.id)}
                    loading={deleteMut.isPending}
                  >
                    <Trash2 size={12} />
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add Department" size="sm">
        <Stack gap="sm">
          <TextInput
            label="Department name"
            placeholder="e.g. Science"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <Select
            label="Head of Department (optional)"
            placeholder="Select staff…"
            data={staffOptions}
            value={newHead}
            onChange={setNewHead}
            searchable
            clearable
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate()}
              loading={createMut.isPending}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Leave management panel ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { pending: 'yellow', approved: 'mint', rejected: 'red' };
const LEAVE_TYPES = ['sick', 'casual', 'earned', 'maternity', 'paternity', 'emergency', 'unpaid'];

function LeavePanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ staff_id: '', leave_type: 'sick', from_date: '', to_date: '', reason: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['leave', statusFilter],
    queryFn: () => fetchLeave(token, statusFilter ?? undefined),
    staleTime: 30_000,
  });

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || `#${s.id}`,
  }));

  const applyMut = useMutation({
    mutationFn: () =>
      applyLeave(token, {
        staff_id: Number(form.staff_id),
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      setApplyOpen(false);
      setForm({ staff_id: '', leave_type: 'sick', from_date: '', to_date: '', reason: '' });
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => approveLeave(token, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['substitutions'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => rejectLeave(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });

  const requests = data?.leave_requests ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600}>Leave Requests</Text>
        <Group gap="sm">
          <Select
            size="xs"
            placeholder="All statuses"
            data={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={140}
          />
          <Button size="xs" leftSection={<Plus size={13} />} onClick={() => setApplyOpen(true)}>
            Apply Leave
          </Button>
        </Group>
      </Group>

      {isLoading ? (
        <Skeleton height={160} radius="md" />
      ) : requests.length === 0 ? (
        <Text size="sm" c="dimmed">No leave requests found.</Text>
      ) : (
        <Stack gap="xs">
          {requests.map((lr) => (
            <Card key={lr.id} p="sm">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap="sm" wrap="nowrap">
                    <Badge color={STATUS_COLOR[lr.status] ?? 'gray'} size="xs">{lr.status}</Badge>
                    <Text fw={600} size="sm" truncate>
                      {[lr.first_name, lr.last_name].filter(Boolean).join(' ')}
                    </Text>
                    <Badge variant="outline" color="gray" size="xs">{lr.leave_type}</Badge>
                  </Group>
                  <Text size="xs" c="dimmed">{lr.from_date} → {lr.to_date}</Text>
                  {lr.reason && <Text size="xs" c="dimmed" fs="italic">{lr.reason}</Text>}
                </Stack>
                {lr.status === 'pending' && (
                  <Group gap="xs" style={{ flexShrink: 0 }}>
                    <Button
                      size="xs"
                      color="mint"
                      leftSection={<Check size={12} />}
                      onClick={() => approveMut.mutate(lr.id)}
                      loading={approveMut.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      leftSection={<X size={12} />}
                      onClick={() => rejectMut.mutate(lr.id)}
                      loading={rejectMut.isPending}
                    >
                      Reject
                    </Button>
                  </Group>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal opened={applyOpen} onClose={() => setApplyOpen(false)} title="Apply Leave" size="md">
        <Stack gap="sm">
          <Select
            label="Staff"
            placeholder="Select staff member…"
            data={staffOptions}
            value={form.staff_id}
            onChange={(v) => setForm((f) => ({ ...f, staff_id: v ?? '' }))}
            searchable
          />
          <Select
            label="Leave type"
            data={LEAVE_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            value={form.leave_type}
            onChange={(v) => setForm((f) => ({ ...f, leave_type: v ?? 'sick' }))}
          />
          <Group grow>
            <TextInput
              type="date"
              label="From"
              value={form.from_date}
              onChange={(e) => setForm((f) => ({ ...f, from_date: e.currentTarget.value }))}
            />
            <TextInput
              type="date"
              label="To"
              value={form.to_date}
              onChange={(e) => setForm((f) => ({ ...f, to_date: e.currentTarget.value }))}
            />
          </Group>
          <TextInput
            label="Reason (optional)"
            placeholder="Brief description…"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.currentTarget.value }))}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => applyMut.mutate()}
              loading={applyMut.isPending}
              disabled={!form.staff_id || !form.from_date || !form.to_date}
            >
              Submit
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function StaffOSScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState<'departments' | 'leave'>('departments');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Group gap="sm" mb={4}>
              <Building2 size={20} color="var(--mantine-color-brand-6)" />
              <Title order={2}>Staff OS</Title>
            </Group>
            <Text c="dimmed" size="sm">Department management and leave approval</Text>
          </div>
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as 'departments' | 'leave')}
            data={[
              { value: 'departments', label: 'Departments' },
              { value: 'leave', label: 'Leave' },
            ]}
          />
        </Group>

        <Card>
          {tab === 'departments' ? (
            <DepartmentsPanel token={token} />
          ) : (
            <LeavePanel token={token} />
          )}
        </Card>
      </Stack>
    </Container>
  );
}
