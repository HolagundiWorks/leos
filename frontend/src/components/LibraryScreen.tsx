import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, BookUp, Library, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import dayjs from 'dayjs';
import { ApiError } from '../api/client';
import { useStudents } from '../hooks/useStudents';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Book { id: number; title: string; author: string | null; isbn: string | null; category: string | null; total_copies: number; available_copies: number; }
interface Loan { id: number; book_id: number; title: string; student_id: number; first_name: string | null; last_name: string | null; issued_date: string | null; due_date: string | null; returned_date: string | null; }

async function apiGet<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: authed(token) });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json() as Promise<T>;
}
async function postJSON(token: string, path: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authed(token), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json();
}

// ─── Catalog tab ────────────────────────────────────────────────────────────────
function CatalogPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', author: '', category: '', isbn: '', total_copies: 1 as number | string });

  const { data, isLoading } = useQuery({ queryKey: ['library-books', q], queryFn: () => apiGet<{ books: Book[] }>(token, `/library/books${q ? `?q=${encodeURIComponent(q)}` : ''}`), staleTime: 30_000 });

  const createMut = useMutation({
    mutationFn: () => postJSON(token, '/library/books', { ...form, total_copies: Number(form.total_copies) || 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-books'] }); setOpen(false); setForm({ title: '', author: '', category: '', isbn: '', total_copies: 1 }); },
  });
  const deleteMut = useMutation({ mutationFn: (id: number) => postJSON(token, `/library/books/${id}/delete`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-books'] }); qc.invalidateQueries({ queryKey: ['library-loans'] }); } });

  const books = data?.books ?? [];

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <TextInput leftSection={<Search size={15} />} placeholder="Search title / author / category" value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
        <Button size="xs" leftSection={<Plus size={13} />} onClick={() => setOpen(true)}>Add Book</Button>
      </Group>
      {isLoading ? <Skeleton height={160} radius="md" /> : books.length === 0 ? (
        <Text size="sm" c="dimmed">No books in the catalog.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead><Table.Tr><Table.Th>Title</Table.Th><Table.Th>Author</Table.Th><Table.Th>Category</Table.Th><Table.Th ta="center">Available</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {books.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td><Text size="sm" fw={500}>{b.title}</Text>{b.isbn && <Text size="xs" c="dimmed">{b.isbn}</Text>}</Table.Td>
                <Table.Td><Text size="sm">{b.author ?? '—'}</Text></Table.Td>
                <Table.Td>{b.category ? <Badge size="xs" variant="light">{b.category}</Badge> : '—'}</Table.Td>
                <Table.Td ta="center">
                  <Badge size="sm" color={b.available_copies > 0 ? 'mint' : 'red'} variant="light">{b.available_copies}/{b.total_copies}</Badge>
                </Table.Td>
                <Table.Td><Group justify="flex-end"><ActionIcon variant="subtle" color="red" onClick={() => deleteMut.mutate(b.id)}><Trash2 size={14} /></ActionIcon></Group></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Add Book" size="sm" radius="md">
        <Stack gap="sm">
          <TextInput label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} data-autofocus />
          <Group grow>
            <TextInput label="Author" value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.currentTarget.value }))} />
            <TextInput label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.currentTarget.value }))} />
          </Group>
          <Group grow>
            <TextInput label="ISBN" value={form.isbn} onChange={(e) => setForm((f) => ({ ...f, isbn: e.currentTarget.value }))} />
            <NumberInput label="Copies" min={1} value={form.total_copies} onChange={(v) => setForm((f) => ({ ...f, total_copies: v }))} />
          </Group>
          <Group justify="flex-end"><Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.title.trim()}>Add</Button></Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Issue / Return tab ─────────────────────────────────────────────────────────
function LoansPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentQ, setStudentQ] = useState('');
  const [due, setDue] = useState(() => dayjs().add(14, 'day').format('YYYY-MM-DD'));

  const { data, isLoading } = useQuery({ queryKey: ['library-loans', 'active'], queryFn: () => apiGet<{ loans: Loan[] }>(token, '/library/loans?status=active'), staleTime: 20_000 });
  const { data: booksData } = useQuery({ queryKey: ['library-books', ''], queryFn: () => apiGet<{ books: Book[] }>(token, '/library/books'), staleTime: 30_000 });
  const { data: studentsData } = useStudents(studentQ);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['library-loans'] }); qc.invalidateQueries({ queryKey: ['library-books'] }); };
  const issueMut = useMutation({
    mutationFn: () => postJSON(token, '/library/loans', { book_id: Number(bookId), student_id: Number(studentId), due_date: due || undefined }),
    onSuccess: () => { invalidate(); setOpen(false); setBookId(null); setStudentId(null); },
  });
  const returnMut = useMutation({ mutationFn: (id: number) => postJSON(token, `/library/loans/${id}/return`), onSuccess: invalidate });

  const loans = data?.loans ?? [];
  const bookOptions = (booksData?.books ?? []).filter((b) => b.available_copies > 0).map((b) => ({ value: String(b.id), label: `${b.title} (${b.available_copies} avail)` }));
  const studentOptions = (studentsData?.students ?? []).map((s) => ({ value: String(s.id), label: `${s.first_name ?? ''} ${s.last_name ?? ''} #${s.id}`.trim() }));
  const today = dayjs().startOf('day');

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{loans.length} books currently issued</Text>
        <Button size="xs" leftSection={<BookUp size={13} />} onClick={() => setOpen(true)}>Issue Book</Button>
      </Group>
      {isLoading ? <Skeleton height={160} radius="md" /> : loans.length === 0 ? (
        <Text size="sm" c="dimmed">No books currently issued.</Text>
      ) : (
        <Table withTableBorder striped>
          <Table.Thead><Table.Tr><Table.Th>Book</Table.Th><Table.Th>Issued to</Table.Th><Table.Th>Issued</Table.Th><Table.Th>Due</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {loans.map((l) => {
              const overdue = l.due_date ? dayjs(l.due_date).isBefore(today) : false;
              return (
                <Table.Tr key={l.id}>
                  <Table.Td><Text size="sm" fw={500}>{l.title}</Text></Table.Td>
                  <Table.Td><Text size="sm">{[l.first_name, l.last_name].filter(Boolean).join(' ')}</Text></Table.Td>
                  <Table.Td><Text size="sm">{l.issued_date ?? '—'}</Text></Table.Td>
                  <Table.Td>
                    {l.due_date ? <Group gap={6}><Text size="sm" c={overdue ? 'red' : undefined}>{l.due_date}</Text>{overdue && <Badge size="xs" color="red">overdue</Badge>}</Group> : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button size="compact-xs" variant="light" color="mint" leftSection={<Undo2 size={12} />} onClick={() => returnMut.mutate(l.id)} loading={returnMut.isPending}>Return</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={open} onClose={() => setOpen(false)} title="Issue Book" size="sm" radius="md">
        <Stack gap="sm">
          <Select label="Book" placeholder="Select an available book…" data={bookOptions} value={bookId} onChange={setBookId} searchable nothingFoundMessage="No available copies" />
          <Select label="Student" placeholder="Search…" data={studentOptions} value={studentId} onChange={setStudentId} searchable searchValue={studentQ} onSearchChange={setStudentQ} nothingFoundMessage="Type to search" />
          <TextInput type="date" label="Due date" value={due} onChange={(e) => setDue(e.currentTarget.value)} />
          <Group justify="flex-end"><Button variant="subtle" color="gray" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => issueMut.mutate()} loading={issueMut.isPending} disabled={!bookId || !studentId}>Issue</Button></Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function LibraryScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState('loans');
  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm">
          <Library size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Library</Title>
        </Group>
        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? 'loans')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="loans" leftSection={<BookUp size={13} />}>Issue / Return</Tabs.Tab>
              <Tabs.Tab value="catalog" leftSection={<BookOpen size={13} />}>Catalog</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="loans"><LoansPanel token={token} /></Tabs.Panel>
            <Tabs.Panel value="catalog"><CatalogPanel token={token} /></Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
