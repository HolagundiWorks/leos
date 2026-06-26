import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Container,
  Divider,
  Group,
  Modal,
  Progress,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { TimetableEntry } from '../api/client';
import { ApiError, clearTimetableEntry, setTimetableEntry } from '../api/client';
import { useClasses } from '../hooks/useClasses';
import { useClassrooms } from '../hooks/useClassrooms';
import { useSubjects } from '../hooks/useSubjects';
import { useTeacherLoad } from '../hooks/useTeacherLoad';
import { useTeacherSubjects } from '../hooks/useTeacherSubjects';
import { useTimings } from '../hooks/useTimings';
import { useTimetable } from '../hooks/useTimetable';
import { useTimetableQuota } from '../hooks/useTimetableQuota';
import { useAuth } from '../stores/auth';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const CELL_BG = [
  '#e5f6ff', '#f0e8ff', '#e0f4f4', '#fce8f3',
  '#ede8ff', '#fff0e8', '#e8fce8', '#fff5e0',
];
const CELL_BORDER = [
  '#1192e8', '#6929c4', '#005d5d', '#9f1853',
  '#a56eff', '#fa4d56', '#198038', '#ff832b',
];

function accent(subjectId: number | null) {
  if (!subjectId) return { bg: '#f4f4f4', border: '#c6c6c6' };
  const i = (subjectId - 1) % CELL_BG.length;
  return { bg: CELL_BG[i], border: CELL_BORDER[i] };
}

function shortName(name: string | null): string {
  if (!name) return '';
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0]}.`;
}

// ─── Cell ──────────────────────────────────────────────────────────────────
function Cell({ entry, onClick }: { entry: TimetableEntry | null; onClick: () => void }) {
  const [hover, setHover] = useState(false);

  if (!entry) {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          height: 76,
          border: `1.5px dashed ${hover ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-gray-3)'}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: hover ? 'rgba(17,146,232,0.05)' : undefined,
          color: hover ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-4)',
          fontSize: 20,
          transition: 'all 0.12s',
          userSelect: 'none',
        }}
      >
        +
      </div>
    );
  }

  const { bg, border } = accent(entry.subject_id);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 76,
        padding: '6px 8px',
        borderRadius: 6,
        background: bg,
        border: `1.5px solid ${border}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        opacity: hover ? 0.8 : 1,
        transition: 'opacity 0.12s',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Text size="xs" fw={700} style={{ color: border, lineHeight: 1.2 }} truncate>
        {entry.subject_code ?? entry.subject_name ?? '–'}
      </Text>
      <Text size="xs" c="dimmed" truncate style={{ lineHeight: 1.2 }}>
        {shortName(entry.teacher_name)}
      </Text>
      {entry.room_name && (
        <Text c="dimmed" truncate style={{ fontSize: 9, lineHeight: 1.2 }}>
          {entry.room_name}
        </Text>
      )}
    </div>
  );
}

// ─── Assignment modal ───────────────────────────────────────────────────────
interface ActiveCell {
  periodId: number;
  periodLabel: string;
  day: number;
  entry: TimetableEntry | null;
}

function CellModal({
  cell,
  sectionId,
  onClose,
}: {
  cell: ActiveCell;
  sectionId: number;
  onClose: () => void;
}) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();

  const [subjectId, setSubjectId] = useState<string | null>(
    cell.entry?.subject_id ? String(cell.entry.subject_id) : null,
  );
  const [staffId, setStaffId] = useState<string | null>(
    cell.entry?.staff_id ? String(cell.entry.staff_id) : null,
  );
  const [roomId, setRoomId] = useState<string | null>(
    cell.entry?.room_id ? String(cell.entry.room_id) : null,
  );
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { data: subjectsData } = useSubjects('');
  const { data: tsData } = useTeacherSubjects();
  const { data: roomsData } = useClassrooms();

  const teacherOptions = useMemo(() => {
    if (!subjectId || !tsData) return [];
    const subj = tsData.subjects.find((s) => String(s.id) === subjectId);
    return (subj?.assignments ?? []).map((a) => ({
      value: String(a.staff_id),
      label: a.teacher ?? 'Unknown',
    }));
  }, [subjectId, tsData]);

  useEffect(() => {
    if (teacherOptions.length === 1 && !staffId) {
      setStaffId(teacherOptions[0].value);
    } else if (staffId && teacherOptions.length > 0) {
      if (!teacherOptions.find((t) => t.value === staffId)) setStaffId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherOptions]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['timetable', sectionId] });
    qc.invalidateQueries({ queryKey: ['timetable-quota', sectionId] });
    qc.invalidateQueries({ queryKey: ['teacher-load'] });
  };

  const save = useMutation({
    mutationFn: () =>
      setTimetableEntry(token, {
        section_id: sectionId,
        period_id: cell.periodId,
        day_of_week: cell.day,
        subject_id: subjectId ? Number(subjectId) : null,
        staff_id: staffId ? Number(staffId) : null,
        room_id: roomId ? Number(roomId) : null,
      }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err) => {
      if (err instanceof ApiError) setConflictMsg(err.message);
    },
  });

  const clear = useMutation({
    mutationFn: () =>
      clearTimetableEntry(token, {
        section_id: sectionId,
        period_id: cell.periodId,
        day_of_week: cell.day,
      }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const subjectOptions = (subjectsData?.subjects ?? []).map((s) => ({
    value: String(s.id),
    label: `${s.name ?? ''}${s.code ? ` (${s.code})` : ''}`,
    group: s.type ?? 'Other',
  }));

  // Show quota hint for selected subject
  const selectedSubject = subjectsData?.subjects.find((s) => String(s.id) === subjectId);
  const weeklyTarget = selectedSubject?.weekly_periods ?? 0;

  const roomOptions = (roomsData?.classrooms ?? []).map((r) => ({
    value: String(r.id),
    label: `${r.name ?? ''}${r.capacity ? ` · ${r.capacity} seats` : ''}`,
  }));

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>{DAYS[cell.day]}</Text>
          <Text c="dimmed">·</Text>
          <Text c="dimmed">{cell.periodLabel}</Text>
        </Group>
      }
      centered
      size="sm"
    >
      <Stack gap="md">
        {conflictMsg && (
          <Alert color="red" icon={<AlertTriangle size={14} />} title="Scheduling conflict">
            {conflictMsg}
          </Alert>
        )}

        {cell.entry && (
          <Group
            justify="space-between"
            p="xs"
            style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 6 }}
          >
            <div>
              <Text size="xs" fw={500}>{cell.entry.subject_name}</Text>
              <Text size="xs" c="dimmed">{cell.entry.teacher_name ?? 'No teacher assigned'}</Text>
            </div>
            <Button size="xs" variant="subtle" color="red" onClick={() => clear.mutate()} loading={clear.isPending}>
              Clear slot
            </Button>
          </Group>
        )}

        <div>
          <Select
            label="Subject"
            placeholder="Select subject…"
            data={subjectOptions}
            value={subjectId}
            onChange={(v) => { setSubjectId(v); setStaffId(null); setConflictMsg(null); }}
            searchable
            clearable
          />
          {weeklyTarget > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              Target: {weeklyTarget} periods/week
            </Text>
          )}
        </div>

        <Select
          label="Teacher"
          placeholder={
            !subjectId ? 'Select a subject first'
              : teacherOptions.length === 0 ? 'No teachers mapped to this subject'
              : 'Select teacher…'
          }
          data={teacherOptions}
          value={staffId}
          onChange={setStaffId}
          disabled={teacherOptions.length === 0}
          clearable
        />

        <Select
          label="Room (optional)"
          placeholder="Any room"
          data={roomOptions}
          value={roomId}
          onChange={setRoomId}
          clearable
          searchable
        />

        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!subjectId}>
          {cell.entry ? 'Update' : 'Assign'}
        </Button>
      </Stack>
    </Modal>
  );
}

// ─── Subject quota panel ────────────────────────────────────────────────────
function SubjectQuotaPanel({ sectionId }: { sectionId: number }) {
  const { data } = useTimetableQuota(sectionId);
  if (!data || data.subjects.length === 0) return null;

  const metCount = data.subjects.filter((s) => s.status === 'met').length;
  const totalScheduled = data.subjects.reduce((s, q) => s + q.scheduled, 0);
  const totalTarget = data.subjects.reduce((s, q) => s + q.target, 0);

  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Text fw={600} size="sm">Subject Quotas</Text>
          <Badge size="xs" color="teal" variant="light">{metCount}/{data.total} met</Badge>
        </Group>
        <Text size="xs" c="dimmed">{totalScheduled}/{totalTarget} periods scheduled</Text>
      </Group>
      <Stack gap={8}>
        {data.subjects.map((s) => {
          const pct = s.target > 0 ? Math.min(100, (s.scheduled / s.target) * 100) : 0;
          const color = s.status === 'met' ? 'teal' : s.status === 'over' ? 'red' : 'orange';
          const statusLabel =
            s.status === 'met' ? '✓ Met'
            : s.status === 'over' ? `+${s.scheduled - s.target} over`
            : `−${s.target - s.scheduled} needed`;

          return (
            <Group key={s.id} gap="sm" wrap="nowrap" align="center">
              <Badge w={46} variant="outline" color="gray" size="sm" style={{ flexShrink: 0 }}>
                {s.code ?? '–'}
              </Badge>
              <Text size="xs" style={{ width: 130, flexShrink: 0 }} truncate>
                {s.name}
              </Text>
              <Progress value={pct} color={color} size="sm" style={{ flex: 1, minWidth: 60 }} />
              <Text size="xs" c="dimmed" style={{ width: 38, textAlign: 'right', flexShrink: 0 }}>
                {s.scheduled}/{s.target}
              </Text>
              <Badge
                size="xs"
                color={color}
                variant="light"
                style={{ width: 90, textAlign: 'center', flexShrink: 0 }}
              >
                {statusLabel}
              </Badge>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

// ─── Teacher load panel ─────────────────────────────────────────────────────
function TeacherLoadPanel() {
  const { data } = useTeacherLoad();
  const [open, setOpen] = useState(false);

  if (!data || data.teachers.length === 0) return null;

  const maxPeriods = Math.max(...data.teachers.map((t) => t.total_periods), 1);

  return (
    <Card p={0}>
      <Group
        px="md"
        py="sm"
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((o) => !o)}
      >
        <Group gap="xs">
          <Text fw={600} size="sm">Teacher Load</Text>
          <Badge size="xs" color="lavender" variant="light">
            {data.total} teachers · this week
          </Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" component="div">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </ActionIcon>
      </Group>

      <Collapse in={open}>
        <Divider />
        <Stack gap={8} p="md">
          {data.teachers.map((t) => (
            <Group key={t.staff_id} gap="sm" wrap="nowrap" align="center">
              <Text size="xs" fw={500} style={{ width: 130, flexShrink: 0 }} truncate>
                {t.teacher_name}
              </Text>
              <Progress
                value={(t.total_periods / maxPeriods) * 100}
                color="lavender"
                size="sm"
                style={{ flex: 1, minWidth: 60 }}
              />
              <Text size="xs" c="dimmed" style={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
                {t.total_periods} {t.total_periods === 1 ? 'period' : 'periods'}
              </Text>
              <Text size="xs" c="dimmed" style={{ minWidth: 140 }} truncate>
                {t.sections.map((s) => `${s.section}×${s.periods}`).join(', ')}
              </Text>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────
function TimetableGrid({
  sectionId,
  onCellClick,
}: {
  sectionId: number;
  onCellClick: (cell: ActiveCell) => void;
}) {
  const { data: timingsData, isLoading: timingsLoading } = useTimings();
  const { data: ttData, isLoading: ttLoading } = useTimetable(sectionId);

  const entryMap = useMemo(() => {
    const m: Record<string, TimetableEntry> = {};
    for (const e of ttData?.entries ?? []) {
      m[`${e.day_of_week}-${e.period_id}`] = e;
    }
    return m;
  }, [ttData]);

  const periods = timingsData?.periods ?? [];

  if (timingsLoading || ttLoading) return <Skeleton height={420} radius="md" />;

  if (periods.length === 0) {
    return (
      <Card>
        <Text c="dimmed" ta="center" py="xl">
          No period slots defined — set up School Timings first.
        </Text>
      </Card>
    );
  }

  const filledCount = ttData?.total ?? 0;
  const periodSlots = periods.filter((p) => p.period_type === 'period');

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Text size="xs" c="dimmed">
          {periodSlots.length} periods · Mon–Fri
        </Text>
        {filledCount > 0 && (
          <Badge variant="light" color="teal" size="xs">
            {filledCount} assigned
          </Badge>
        )}
      </Group>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 110, paddingBottom: 6, textAlign: 'left' }}>
                <Text size="xs" c="dimmed" fw={500} pl={4}>Period</Text>
              </th>
              {DAYS_SHORT.map((d, i) => (
                <th key={i} style={{ paddingBottom: 6, textAlign: 'center' }}>
                  <Badge variant="light" color="lavender" size="sm">{d}</Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              if (period.period_type === 'break') {
                return (
                  <tr key={`b-${period.id}`}>
                    <td colSpan={6} style={{ padding: '2px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: 'var(--mantine-color-gray-1)' }}>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{period.label}</Text>
                        <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-gray-3)' }} />
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{period.start_time}–{period.end_time}</Text>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={`p-${period.id}`}>
                  <td style={{ verticalAlign: 'middle', paddingRight: 4 }}>
                    <div style={{ padding: '2px 4px' }}>
                      <Text size="xs" fw={600}>{period.label}</Text>
                      <Text size="xs" c="dimmed">{period.start_time}</Text>
                    </div>
                  </td>
                  {[0, 1, 2, 3, 4].map((day) => (
                    <td key={day} style={{ width: `${100 / 5}%`, verticalAlign: 'top' }}>
                      <Cell
                        entry={entryMap[`${day}-${period.id}`] ?? null}
                        onClick={() =>
                          onCellClick({
                            periodId: period.id!,
                            periodLabel: period.label,
                            day,
                            entry: entryMap[`${day}-${period.id}`] ?? null,
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────
export function TimetableScreen() {
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const { data: classesData } = useClasses();

  const sectionOptions = useMemo(
    () =>
      (classesData?.classes ?? []).map((cls) => ({
        group: cls.name ?? '',
        items: cls.sections.map((sec) => ({
          value: String(sec.id),
          label: `Section ${sec.name}`,
        })),
      })),
    [classesData],
  );

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Title order={2}>Timetable Builder</Title>
            <Text c="dimmed">
              {sectionId
                ? 'Click a cell to assign or update. Quotas update live below.'
                : 'Select a class section to view or build its timetable.'}
            </Text>
          </div>
          <Select
            label="Class section"
            placeholder="Choose section…"
            data={sectionOptions}
            value={sectionId ? String(sectionId) : null}
            onChange={(v) => { setSectionId(v ? Number(v) : null); setActiveCell(null); }}
            searchable
            w={220}
            styles={{ root: { flexShrink: 0 } }}
          />
        </Group>

        {sectionId != null ? (
          <>
            <TimetableGrid sectionId={sectionId} onCellClick={setActiveCell} />
            <SubjectQuotaPanel sectionId={sectionId} />
            <TeacherLoadPanel />
          </>
        ) : (
          <Card>
            <Stack align="center" py="xl" gap="xs">
              <Text c="dimmed">No section selected.</Text>
              <Text size="xs" c="dimmed" ta="center" maw={400}>
                Use the dropdown above to pick a class section, then click any cell to assign a
                subject and teacher. Quotas (weekly_periods target vs scheduled) and teacher load
                are tracked and shown below the grid.
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>

      {activeCell && sectionId != null && (
        <CellModal cell={activeCell} sectionId={sectionId} onClose={() => setActiveCell(null)} />
      )}
    </Container>
  );
}
