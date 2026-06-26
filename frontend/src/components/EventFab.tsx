import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarHeart, ClipboardList, Plus } from 'lucide-react';
import { ApiError } from '../api/client';
import { useStaff } from '../hooks/useStaff';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

type Kind = 'event' | 'meeting' | 'task';

const MEETING_TYPES = ['department', 'staff', 'parent', 'government', 'board', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const KIND_TITLE: Record<Kind, string> = {
  event: 'Create Event',
  meeting: 'Create Meeting',
  task: 'Create Task',
};

const blank = {
  title: '',
  date: '',
  start_time: '',
  venue: '',
  notes: '',
  meeting_type: 'staff',
  assigned_to: '',
  due_date: '',
  priority: 'normal',
};

async function postJSON(token: string, path: string, body: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, r.status);
  return r.json();
}

/**
 * Floating "+" create button (bottom-right). Click opens a category menu —
 * Event · Meeting · Task — and the chosen kind shows its own quick form,
 * then refreshes the dashboard agenda / work queue.
 */
export function EventFab() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: staffData } = useStaff('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [form, setForm] = useState(blank);

  const open = (k: Kind) => { setForm(blank); setKind(k); };
  const close = () => setKind(null);

  const staffOptions = (staffData?.staff ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || `Staff #${s.id}`,
  }));

  const createMut = useMutation({
    mutationFn: () => {
      if (kind === 'meeting') {
        return postJSON(token, '/meetings', {
          title: form.title,
          meeting_type: form.meeting_type,
          date: form.date,
          start_time: form.start_time || undefined,
          venue: form.venue || undefined,
          agenda: form.notes || undefined,
        });
      }
      if (kind === 'task') {
        return postJSON(token, '/tasks', {
          title: form.title,
          description: form.notes || undefined,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined,
          due_date: form.due_date || undefined,
          priority: form.priority,
        });
      }
      // event
      return postJSON(token, '/activities', {
        title: form.title,
        activity_type: 'event',
        date: form.date || undefined,
        venue: form.venue || undefined,
        description: form.notes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-agenda'] });
      qc.invalidateQueries({ queryKey: ['dashboard-today'] });
      qc.invalidateQueries({ queryKey: ['dashboard-meetings-today'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      close();
      setForm(blank);
    },
  });

  const canSubmit =
    !!form.title.trim() && (kind === 'meeting' ? !!form.date : true);

  return (
    <>
      <Menu position="top-end" radius="md" shadow="md" width={180}>
        <Menu.Target>
          <Tooltip label="Create" position="left" withArrow>
            <ActionIcon
              radius="xl"
              size={56}
              color="brand"
              variant="filled"
              aria-label="Create"
              style={{
                position: 'fixed',
                right: 24,
                bottom: 44,
                zIndex: 200,
                boxShadow: '0 6px 20px rgba(62, 123, 123, 0.45)',
              }}
            >
              <Plus size={28} strokeWidth={2.4} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Create new</Menu.Label>
          <Menu.Item leftSection={<CalendarHeart size={16} />} onClick={() => open('event')}>Event</Menu.Item>
          <Menu.Item leftSection={<CalendarDays size={16} />} onClick={() => open('meeting')}>Meeting</Menu.Item>
          <Menu.Item leftSection={<ClipboardList size={16} />} onClick={() => open('task')}>Task</Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal opened={kind !== null} onClose={close} title={kind ? KIND_TITLE[kind] : ''} size="md" radius="md">
        <Stack gap="sm">
          <TextInput
            label="Title"
            placeholder={
              kind === 'task' ? 'e.g. Submit attendance report'
                : kind === 'meeting' ? 'e.g. Monthly staff sync'
                : 'e.g. Annual Sports Day'
            }
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))}
            data-autofocus
          />

          {/* Meeting-specific */}
          {kind === 'meeting' && (
            <>
              <Group grow>
                <Select
                  label="Meeting type"
                  data={MEETING_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                  value={form.meeting_type}
                  onChange={(v) => setForm((f) => ({ ...f, meeting_type: v ?? 'staff' }))}
                  allowDeselect={false}
                />
                <TextInput type="date" label="Date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
              </Group>
              <Group grow>
                <TextInput type="time" label="Start time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.currentTarget.value }))} />
                <TextInput label="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.currentTarget.value }))} />
              </Group>
              <Textarea label="Agenda" autosize minRows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
            </>
          )}

          {/* Event-specific */}
          {kind === 'event' && (
            <>
              <Group grow>
                <TextInput type="date" label="Date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
                <TextInput label="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.currentTarget.value }))} />
              </Group>
              <Textarea label="Description" autosize minRows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
            </>
          )}

          {/* Task-specific */}
          {kind === 'task' && (
            <>
              <Textarea label="Description" autosize minRows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
              <Group grow>
                <Select
                  label="Assign to"
                  placeholder="Select staff…"
                  data={staffOptions}
                  value={form.assigned_to}
                  onChange={(v) => setForm((f) => ({ ...f, assigned_to: v ?? '' }))}
                  searchable
                  clearable
                />
                <Select
                  label="Priority"
                  data={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
                  value={form.priority}
                  onChange={(v) => setForm((f) => ({ ...f, priority: v ?? 'normal' }))}
                  allowDeselect={false}
                />
              </Group>
              <TextInput type="date" label="Due date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.currentTarget.value }))} />
            </>
          )}

          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={close}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!canSubmit}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
