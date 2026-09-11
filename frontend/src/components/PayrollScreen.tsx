import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  NumberInput,
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
import { FileText, Play, Printer } from 'lucide-react';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';
import { useSchool } from '../hooks/useSchool';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SalaryStructure {
  id: number;
  staff_id: number;
  basic: number;
  hra: number;
  da: number;
  ta: number;
  other_allowances: number;
  pf_deduction: number;
  pt_deduction: number;
  other_deductions: number;
  effective_from: string | null;
}

interface Payslip {
  id: number;
  staff_id: number;
  first_name: string | null;
  last_name: string | null;
  month: string;
  basic: number;
  hra: number;
  da: number;
  ta: number;
  other_allowances: number;
  pf_deduction: number;
  pt_deduction: number;
  other_deductions: number;
  gross: number;
  net: number;
  working_days: number | null;
  paid_days: number | null;
  generated_at: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function fetchStructure(token: string, staffId: number): Promise<{ structure: SalaryStructure | null }> {
  const r = await fetch(`${BASE}/payroll/structure?staff_id=${staffId}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function saveStructure(token: string, data: Omit<SalaryStructure, 'id'>) {
  const r = await fetch(`${BASE}/payroll/structure`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

async function fetchPayslips(token: string, month?: string): Promise<{ payslips: Payslip[]; total: number }> {
  const qs = month ? `?month=${month}` : '';
  const r = await fetch(`${BASE}/payroll/payslips${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function generatePayroll(token: string, data: { staff_ids: number[]; month: string; working_days: number }) {
  const r = await fetch(`${BASE}/payroll/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

// ─── Salary structure editor ──────────────────────────────────────────────────
function StructureEditor({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const [staffId, setStaffId] = useState<string | null>(null);

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || s.email || `#${s.id}`,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ['salary-structure', staffId],
    queryFn: () => fetchStructure(token, Number(staffId)),
    enabled: !!staffId,
    staleTime: 60_000,
  });

  const existing = data?.structure;
  const [form, setForm] = useState({
    basic: 0, hra: 0, da: 0, ta: 0, other_allowances: 0,
    pf_deduction: 0, pt_deduction: 0, other_deductions: 0, effective_from: '',
  });

  // Populate from server when loaded
  useMemo(() => {
    if (existing) {
      setForm({
        basic: existing.basic,
        hra: existing.hra,
        da: existing.da,
        ta: existing.ta,
        other_allowances: existing.other_allowances,
        pf_deduction: existing.pf_deduction,
        pt_deduction: existing.pt_deduction,
        other_deductions: existing.other_deductions,
        effective_from: existing.effective_from ?? '',
      });
    }
  }, [existing?.id]);

  const gross = form.basic + form.hra + form.da + form.ta + form.other_allowances;
  const deductions = form.pf_deduction + form.pt_deduction + form.other_deductions;
  const net = gross - deductions;

  const saveMut = useMutation({
    mutationFn: () =>
      saveStructure(token, {
        staff_id: Number(staffId),
        ...form,
        effective_from: form.effective_from || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salary-structure', staffId] }),
  });

  const numField = (key: keyof typeof form, label: string) => (
    <NumberInput
      label={label}
      value={form[key] as number}
      onChange={(v) => setForm((f) => ({ ...f, [key]: typeof v === 'number' ? v : 0 }))}
      min={0}
      decimalScale={2}
      prefix="₹ "
      size="sm"
    />
  );

  return (
    <Stack gap="md">
      <Select
        label="Staff member"
        placeholder="Select staff…"
        data={staffOptions}
        value={staffId}
        onChange={setStaffId}
        searchable
        w={280}
      />

      {staffId && (
        isLoading ? <Skeleton height={200} radius="md" /> : (
          <Stack gap="md">
            <Text fw={600} size="sm" c="dimmed">Earnings</Text>
            <Group grow gap="sm">
              {numField('basic', 'Basic')}
              {numField('hra', 'HRA')}
              {numField('da', 'DA')}
            </Group>
            <Group grow gap="sm">
              {numField('ta', 'TA')}
              {numField('other_allowances', 'Other Allowances')}
            </Group>

            <Text fw={600} size="sm" c="dimmed" mt="xs">Deductions</Text>
            <Group grow gap="sm">
              {numField('pf_deduction', 'PF')}
              {numField('pt_deduction', 'PT')}
              {numField('other_deductions', 'Other Deductions')}
            </Group>

            <TextInput
              type="date"
              label="Effective from"
              value={form.effective_from}
              onChange={(e) => setForm((f) => ({ ...f, effective_from: e.currentTarget.value }))}
              w={180}
            />

            <Card bg="var(--mantine-color-gray-0)" p="sm">
              <Group gap="xl">
                <div>
                  <Text size="xs" c="dimmed">Gross</Text>
                  <Text fw={700} size="md" c="mint.7">₹ {gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Deductions</Text>
                  <Text fw={700} size="md" c="red.7">₹ {deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Net</Text>
                  <Text fw={700} size="md">₹ {net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </div>
              </Group>
            </Card>

            <Group justify="flex-end">
              <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
                Save Structure
              </Button>
            </Group>
          </Stack>
        )
      )}
    </Stack>
  );
}

// ─── Payslip print template ────────────────────────────────────────────────────
function printPayslip(p: Payslip, schoolName: string) {
  const fmt = (n: number) => `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const html = `<!DOCTYPE html>
<html><head><title>Payslip — ${p.first_name} ${p.last_name} — ${p.month}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; color: #161616; }
  h2 { margin: 0; font-size: 1.2rem; }
  .school { font-size: 0.85rem; color: #555; }
  .header { border-bottom: 2px solid #0F62FE; padding-bottom: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 10px; border: 1px solid #ddd; font-size: 0.85rem; }
  th { background: #f0f4f8; }
  .total { font-weight: bold; background: #e8f4f4; }
  .net { font-size: 1.1rem; font-weight: 700; color: #0F62FE; }
  @media print { body { margin: 10mm; } }
</style></head><body>
<div class="header">
  <h2>${schoolName}</h2>
  <p class="school">Pay Slip for the month of ${p.month}</p>
  <p class="school">Employee: ${p.first_name ?? ''} ${p.last_name ?? ''} | Working days: ${p.working_days ?? 26} | Paid days: ${p.paid_days ?? p.working_days ?? 26}</p>
</div>
<table>
  <thead><tr><th>Earnings</th><th>Amount</th><th>Deductions</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>Basic</td><td>${fmt(p.basic)}</td><td>PF</td><td>${fmt(p.pf_deduction)}</td></tr>
    <tr><td>HRA</td><td>${fmt(p.hra)}</td><td>PT</td><td>${fmt(p.pt_deduction)}</td></tr>
    <tr><td>DA</td><td>${fmt(p.da)}</td><td>Other Deductions</td><td>${fmt(p.other_deductions)}</td></tr>
    <tr><td>TA</td><td>${fmt(p.ta)}</td><td></td><td></td></tr>
    <tr><td>Other Allowances</td><td>${fmt(p.other_allowances)}</td><td></td><td></td></tr>
    <tr class="total"><td>Gross</td><td>${fmt(p.gross)}</td><td>Total Deductions</td><td>${fmt(p.pf_deduction + p.pt_deduction + p.other_deductions)}</td></tr>
  </tbody>
</table>
<p class="net" style="margin-top:16px;">Net Pay: ${fmt(p.net)}</p>
<p style="font-size:0.75rem;color:#888;margin-top:32px;">Generated by LEOS — ${new Date().toLocaleString('en-IN')}</p>
</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ─── Payroll generation panel ──────────────────────────────────────────────────
function GeneratePanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const { data: schoolData } = useSchool();
  const schoolName = schoolData?.name ?? 'School';

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [workingDays, setWorkingDays] = useState<number | string>(26);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const staffList = staffData?.staff ?? [];

  const toggleAll = () => {
    if (selected.size === staffList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(staffList.map((s) => s.id)));
    }
  };

  const genMut = useMutation({
    mutationFn: () =>
      generatePayroll(token, {
        staff_ids: Array.from(selected),
        month,
        working_days: typeof workingDays === 'number' ? workingDays : 26,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payslips'] });
      setSelected(new Set());
    },
  });

  const { data: payslipData, isLoading } = useQuery({
    queryKey: ['payslips', month],
    queryFn: () => fetchPayslips(token, month),
    enabled: !!month,
    staleTime: 60_000,
  });

  const payslips = payslipData?.payslips ?? [];

  return (
    <Stack gap="lg">
      <Group gap="sm" align="flex-end">
        <TextInput
          type="month"
          label="Month"
          value={month}
          onChange={(e) => setMonth(e.currentTarget.value)}
          w={180}
        />
        <NumberInput
          label="Working days"
          value={workingDays}
          onChange={setWorkingDays}
          min={1}
          max={31}
          w={140}
        />
      </Group>

      <Stack gap="xs">
        <Group gap="sm">
          <Checkbox
            checked={selected.size === staffList.length && staffList.length > 0}
            indeterminate={selected.size > 0 && selected.size < staffList.length}
            onChange={toggleAll}
            label={`Select all (${staffList.length})`}
          />
          <Button
            size="xs"
            leftSection={<Play size={12} />}
            disabled={selected.size === 0}
            loading={genMut.isPending}
            onClick={() => genMut.mutate()}
          >
            Generate Payslips ({selected.size})
          </Button>
        </Group>

        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 36 }} />
              <Table.Th>Staff</Table.Th>
              <Table.Th style={{ textAlign: 'center' }}>Status</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Net Pay</Table.Th>
              <Table.Th style={{ width: 48 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {staffList.map((s) => {
              const slip = payslips.find((p) => p.staff_id === s.id);
              return (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        const nxt = new Set(selected);
                        if (e.currentTarget.checked) nxt.add(s.id); else nxt.delete(s.id);
                        setSelected(nxt);
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{[s.first_name, s.last_name].filter(Boolean).join(' ')}</Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    {slip ? (
                      <Badge color="mint" size="xs">Generated</Badge>
                    ) : (
                      <Badge color="gray" variant="outline" size="xs">Pending</Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {slip ? (
                      <Text size="sm" fw={600}>₹ {slip.net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {slip && (
                      <Button
                        size="xs"
                        variant="subtle"
                        p={4}
                        onClick={() => printPayslip(slip, schoolName)}
                      >
                        <Printer size={13} />
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {isLoading && <Skeleton height={80} radius="md" />}
      </Stack>
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function PayrollScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState<'structure' | 'generate'>('generate');

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Group gap="sm" mb={4}>
              <FileText size={20} color="var(--mantine-color-brand-6)" />
              <Title order={2}>Payroll</Title>
            </Group>
            <Text c="dimmed" size="sm">Salary structures and monthly payslip generation</Text>
          </div>
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as 'structure' | 'generate')}
            data={[
              { value: 'generate', label: 'Generate' },
              { value: 'structure', label: 'Salary Structure' },
            ]}
          />
        </Group>

        <Card>
          {tab === 'structure' ? (
            <StructureEditor token={token} />
          ) : (
            <GeneratePanel token={token} />
          )}
        </Card>
      </Stack>
    </Container>
  );
}
