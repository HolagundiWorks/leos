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
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp, LayoutGrid, LayoutList } from 'lucide-react';
import {
  ApiError,
  api,
  type TimetableEntry,
  type TimetableSection,
} from '../api/client';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const CELL_BG = ['#e8f4f4', '#e8f0ff', '#e0f4ea', '#fef6e8', '#f0e8ff', '#fff0e8', '#e8f8f0', '#fef0f0', '#f0f8ff', '#f8f0f8'];
const CELL_BORDER = ['#3E7B7B', '#4d8cf5', '#5C8A62', '#D9A441', '#7550e8', '#e85555', '#2a9965', '#e07070', '#2980b9', '#a040a0'];

function accent(subjectId: number | null) {
  if (!subjectId) return { bg: '#f5f7fa', border: '#dee2e6' };
  const i = (subjectId - 1) % CELL_BG.length;
  return { bg: CELL_BG[i], border: CELL_BORDER[i] };
}

function shortName(name: string | null | undefined): string {
  if (!name) return '';
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0]}.`;
}

function invalidateTimetableQueries(qc: QueryClient, sectionId: number) {
  qc.invalidateQueries({ queryKey: ['timetable', sectionId] });
  qc.invalidateQueries({ queryKey: ['timetable-quota', sectionId] });
  qc.invalidateQueries({ queryKey: ['teacher-load'] });
  qc.invalidateQueries({ queryKey: ['timetable-all'] });
}

interface ActiveCell {
  periodId: number;
  periodLabel: string;
  day: number;
  entry: TimetableEntry | null;
}

interface DragPayload {
  fromPeriodId: number;
  fromDay: number;
  entry: TimetableEntry;
}

function Cell({
  entry, onClick, onDropEntry, periodId, day,
}: {
  entry: TimetableEntry | null;
  onClick: () => void;
  onDropEntry?: (p: DragPayload) => void;
  periodId: number;
  day: number;
}) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (!entry) return;
    e.dataTransfer.setData('application/leos-cell', JSON.stringify({ fromPeriodId: periodId, fromDay: day, entry }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/leos-cell')) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const payload: DragPayload = JSON.parse(e.dataTransfer.getData('application/leos-cell'));
      if (payload.fromPeriodId === periodId && payload.fromDay === day) return;
      onDropEntry?.(payload);
    } catch { /* ignore */ }
  };

  const { bg, border } = accent(entry?.subject_id ?? null);

  if (!entry) {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          height: 76, border: `1.5px ${dragOver ? 'solid' : 'dashed'} ${dragOver ? '#3E7B7B' : hover ? '#52a9a9' : '#DDE3EC'}`,
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', background: dragOver ? 'rgba(62,123,123,0.1)' : hover ? 'rgba(62,123,123,0.04)' : undefined,
          color: hover || dragOver ? '#336666' : '#9BAABB', fontSize: 20, userSelect: 'none',
        }}
      >+</div>
    );
  }

  return (
    <div draggable onDragStart={handleDragStart} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
      style={{
        height: 76, padding: '6px 8px', borderRadius: 6, background: dragOver ? 'rgba(62,123,123,0.12)' : bg,
        border: `1.5px solid ${dragOver ? '#3E7B7B' : border}`, cursor: 'grab',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        opacity: hover ? 0.82 : 1, minWidth: 0, overflow: 'hidden',
      }}
    >
      <Text size="xs" fw={700} style={{ color: border, lineHeight: 1.2 }} truncate>
        {entry.subject_code ?? entry.subject_name ?? '–'}
      </Text>
      <Text size="xs" c="dimmed" truncate>{shortName(entry.teacher_name)}</Text>
      {entry.room_name && <Text c="dimmed" truncate style={{ fontSize: 9 }}>{entry.room_name}</Text>}
    </div>
  );
}

function CellModal({ cell, sectionId, onClose }: { cell: ActiveCell; sectionId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState<string | null>(cell.entry?.subject_id ? String(cell.entry.subject_id) : null);
  const [staffId, setStaffId] = useState<string | null>(cell.entry?.staff_id ? String(cell.entry.staff_id) : null);
  const [roomId, setRoomId] = useState<string | null>(cell.entry?.room_id ? String(cell.entry.room_id) : null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { data: subjectsData } = useQuery({ queryKey: ['subjects'], queryFn: () => api.fetchSubjects() });
  const { data: tsData } = useQuery({ queryKey: ['teacher-subjects'], queryFn: () => api.fetchTeacherSubjects() });
  const { data: roomsData } = useQuery({ queryKey: ['classrooms'], queryFn: () => api.fetchClassrooms() });

  const teacherOptions = useMemo(() => {
    if (!subjectId || !tsData) return [];
    const subj = tsData.subjects.find((s) => String(s.id) === subjectId);
    return (subj?.assignments ?? []).map((a) => ({ value: String(a.staff_id), label: a.teacher ?? 'Unknown' }));
  }, [subjectId, tsData]);

  useEffect(() => {
    if (teacherOptions.length === 1 && !staffId) setStaffId(teacherOptions[0].value);
    else if (staffId && !teacherOptions.find((t) => t.value === staffId)) setStaffId(null);
  }, [teacherOptions, staffId]);

  const invalidate = () => invalidateTimetableQueries(qc, sectionId);

  const save = useMutation({
    mutationFn: () => api.setTimetableEntry({
      section_id: sectionId, period_id: cell.periodId, day_of_week: cell.day,
      subject_id: subjectId ? Number(subjectId) : null,
      staff_id: staffId ? Number(staffId) : null,
      room_id: roomId ? Number(roomId) : null,
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err) => { if (err instanceof ApiError) setConflictMsg(err.message); },
  });

  const clear = useMutation({
    mutationFn: () => api.clearTimetableEntry({ section_id: sectionId, period_id: cell.periodId, day_of_week: cell.day }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const subjectOptions = (subjectsData?.subjects ?? []).map((s) => ({
    value: String(s.id), label: `${s.name ?? ''}${s.code ? ` (${s.code})` : ''}`, group: s.type ?? 'Other',
  }));
  const selectedSubject = subjectsData?.subjects.find((s) => String(s.id) === subjectId);
  const roomOptions = (roomsData?.classrooms ?? []).map((r) => ({
    value: String(r.id), label: `${r.name ?? ''}${r.capacity ? ` · ${r.capacity} seats` : ''}`,
  }));

  return (
    <Modal opened onClose={onClose} title={<Group gap="xs"><Text fw={600}>{DAYS[cell.day]}</Text><Text c="dimmed">·</Text><Text c="dimmed">{cell.periodLabel}</Text></Group>} centered size="sm">
      <Stack gap="md">
        {conflictMsg && <Alert color="red" icon={<AlertTriangle size={14} />} title="Scheduling conflict">{conflictMsg}</Alert>}
        {cell.entry && (
          <Group justify="space-between" p="xs" style={{ background: '#F5F7FA', borderRadius: 6 }}>
            <div>
              <Text size="xs" fw={500}>{cell.entry.subject_name}</Text>
              <Text size="xs" c="dimmed">{cell.entry.teacher_name ?? 'No teacher assigned'}</Text>
            </div>
            <Button size="xs" variant="subtle" color="red" onClick={() => clear.mutate()} loading={clear.isPending}>Clear slot</Button>
          </Group>
        )}
        <Select label="Subject" placeholder="Select subject…" data={subjectOptions} value={subjectId}
          onChange={(v) => { setSubjectId(v); setStaffId(null); setConflictMsg(null); }} searchable clearable />
        {(selectedSubject?.weekly_periods ?? 0) > 0 && (
          <Text size="xs" c="dimmed">Target: {selectedSubject?.weekly_periods} periods/week</Text>
        )}
        <Select label="Teacher" placeholder={!subjectId ? 'Select a subject first' : teacherOptions.length === 0 ? 'No teachers mapped' : 'Select teacher…'}
          data={teacherOptions} value={staffId} onChange={setStaffId} disabled={teacherOptions.length === 0} clearable />
        <Select label="Room (optional)" placeholder="Any room" data={roomOptions} value={roomId} onChange={setRoomId} clearable searchable />
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!subjectId}>{cell.entry ? 'Update' : 'Assign'}</Button>
      </Stack>
    </Modal>
  );
}

function SubjectQuotaPanel({ sectionId }: { sectionId: number }) {
  const { data } = useQuery({ queryKey: ['timetable-quota', sectionId], queryFn: () => api.fetchTimetableQuota(sectionId) });
  if (!data || data.subjects.length === 0) return null;
  const metCount = data.subjects.filter((s) => s.status === 'met').length;

  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Group gap="xs"><Text fw={600} size="sm">Subject Quotas</Text><Badge size="xs" color="brand" variant="light">{metCount}/{data.total} met</Badge></Group>
      </Group>
      <Stack gap={8}>
        {data.subjects.map((s) => {
          const pct = s.target > 0 ? Math.min(100, (s.scheduled / s.target) * 100) : 0;
          const color = s.status === 'met' ? 'mint' : s.status === 'over' ? 'peach' : 'yellow';
          const statusLabel = s.status === 'met' ? '✓ Met' : s.status === 'over' ? `+${s.scheduled - s.target} over` : `−${s.target - s.scheduled} needed`;
          return (
            <Group key={s.id} gap="sm" wrap="nowrap">
              <Badge w={46} variant="outline" color="gray" size="sm">{s.code ?? '–'}</Badge>
              <Text size="xs" style={{ width: 130 }} truncate>{s.name}</Text>
              <Progress value={pct} color={color} size="sm" style={{ flex: 1 }} />
              <Text size="xs" c="dimmed" style={{ width: 38, textAlign: 'right' }}>{s.scheduled}/{s.target}</Text>
              <Badge size="xs" color={color} variant="light" style={{ width: 90 }}>{statusLabel}</Badge>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

function TeacherLoadPanel() {
  const { data } = useQuery({ queryKey: ['teacher-load'], queryFn: () => api.fetchTeacherLoad() });
  const [open, setOpen] = useState(false);
  if (!data || data.teachers.length === 0) return null;
  const maxPeriods = Math.max(...data.teachers.map((t) => t.total_periods), 1);

  return (
    <Card p={0}>
      <Group px="md" py="sm" justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <Group gap="xs"><Text fw={600} size="sm">Teacher Load</Text><Badge size="xs" color="sky" variant="light">{data.total} teachers</Badge></Group>
        <ActionIcon size="sm" variant="subtle">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</ActionIcon>
      </Group>
      <Collapse in={open}>
        <Divider />
        <Stack gap={8} p="md">
          {data.teachers.map((t) => (
            <Group key={t.staff_id} gap="sm" wrap="nowrap">
              <Text size="xs" fw={500} style={{ width: 130 }} truncate>{t.teacher_name}</Text>
              <Progress value={(t.total_periods / maxPeriods) * 100} color="brand" size="sm" style={{ flex: 1 }} />
              <Text size="xs" c="dimmed" style={{ width: 70, textAlign: 'right' }}>{t.total_periods} periods</Text>
              <Text size="xs" c="dimmed" truncate>{t.sections.map((s) => `${s.section}×${s.periods}`).join(', ')}</Text>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
}

function TimetableGrid({ sectionId, onCellClick }: { sectionId: number; onCellClick: (c: ActiveCell) => void }) {
  const qc = useQueryClient();
  const { data: timingsData, isLoading: timingsLoading } = useQuery({ queryKey: ['periods'], queryFn: () => api.fetchPeriods() });
  const { data: ttData, isLoading: ttLoading } = useQuery({ queryKey: ['timetable', sectionId], queryFn: () => api.fetchTimetable(sectionId) });

  const entryMap = useMemo(() => {
    const m: Record<string, TimetableEntry> = {};
    for (const e of ttData?.entries ?? []) m[`${e.day_of_week}-${e.period_id}`] = e;
    return m;
  }, [ttData]);

  const periods = timingsData?.periods ?? [];

  const invalidate = () => invalidateTimetableQueries(qc, sectionId);

  const moveEntry = useMutation({
    mutationFn: async ({ payload, toDay, toPeriodId }: { payload: DragPayload; toDay: number; toPeriodId: number }) => {
      const { entry } = payload;
      await api.setTimetableEntry({
        section_id: sectionId, period_id: toPeriodId, day_of_week: toDay,
        subject_id: entry.subject_id ?? null, staff_id: entry.staff_id ?? null, room_id: entry.room_id ?? null,
      });
      await api.clearTimetableEntry({ section_id: sectionId, period_id: payload.fromPeriodId, day_of_week: payload.fromDay });
    },
    onSuccess: invalidate,
  });

  if (timingsLoading || ttLoading) return <Skeleton height={420} radius="md" />;
  if (periods.length === 0) return <Card><Text c="dimmed" ta="center" py="xl">No period slots defined — set up School Timings first.</Text></Card>;

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Text size="xs" c="dimmed">{periods.filter((p) => p.period_type === 'period').length} periods · Mon–Fri · drag to move</Text>
        {(ttData?.total ?? 0) > 0 && <Badge variant="light" color="brand" size="xs">{ttData?.total} assigned</Badge>}
      </Group>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 110, textAlign: 'left' }}><Text size="xs" c="dimmed" pl={4}>Period</Text></th>
              {DAYS_SHORT.map((d, i) => (
                <th key={i} style={{ textAlign: 'center' }}><Badge variant="light" color="sky" size="sm">{d}</Badge></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              if (period.period_type === 'break') {
                return (
                  <tr key={`b-${period.id}`}>
                    <td colSpan={6} style={{ padding: '2px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: '#EDF0F5' }}>
                        <Text size="xs" c="dimmed">{period.label}</Text>
                        <div style={{ flex: 1, height: 1, background: '#DDE3EC' }} />
                        <Text size="xs" c="dimmed">{period.start_time}–{period.end_time}</Text>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={`p-${period.id}`}>
                  <td style={{ verticalAlign: 'middle' }}>
                    <Text size="xs" fw={600}>{period.label}</Text>
                    <Text size="xs" c="dimmed">{period.start_time}</Text>
                  </td>
                  {[0, 1, 2, 3, 4].map((day) => (
                    <td key={day}>
                      <Cell
                        entry={entryMap[`${day}-${period.id}`] ?? null}
                        periodId={period.id!} day={day}
                        onClick={() => onCellClick({ periodId: period.id!, periodLabel: period.label, day, entry: entryMap[`${day}-${period.id}`] ?? null })}
                        onDropEntry={(payload) => moveEntry.mutate({ payload, toDay: day, toPeriodId: period.id! })}
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

function SchoolWideGrid() {
  const { data, isLoading } = useQuery({ queryKey: ['timetable-all'], queryFn: () => api.fetchTimetableAll() });
  const { data: timingsData, isLoading: timingsLoading } = useQuery({ queryKey: ['periods'], queryFn: () => api.fetchPeriods() });

  const entryMap = useMemo(() => {
    const m: Record<string, TimetableEntry> = {};
    for (const e of data?.entries ?? []) m[`${e.section_id}-${e.day_of_week}-${e.period_id}`] = e;
    return m;
  }, [data]);

  const sections = data?.sections ?? [];
  const periods = timingsData?.periods ?? [];

  const classSections = useMemo(() => {
    const map = new Map<number, TimetableSection[]>();
    for (const sec of sections) {
      if (!map.has(sec.class_id)) map.set(sec.class_id, []);
      map.get(sec.class_id)!.push(sec);
    }
    return [...map.entries()].map(([classId, secs]) => ({
      classId, className: secs[0].class_name ?? 'Unknown', grade: secs[0].grade_level, sections: secs,
    }));
  }, [sections]);

  if (isLoading || timingsLoading) return <Skeleton height={500} radius="md" />;
  if (sections.length === 0) return <Card><Text c="dimmed" ta="center" py="xl">No sections configured.</Text></Card>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: Math.max(900, sections.length * 90 + 110) }}>
        <thead>
          <tr>
            <th style={{ width: 110 }} />
            {classSections.map(({ classId, className, grade, sections: secs }) => (
              <th key={classId} colSpan={secs.length} style={{ textAlign: 'center' }}>
                <Badge variant="light" color="brand" size="sm">{className}{grade ? ` · Gr ${grade}` : ''}</Badge>
              </th>
            ))}
          </tr>
          <tr>
            <th><Text size="xs" c="dimmed" pl={4}>Period</Text></th>
            {sections.map((sec) => (
              <th key={sec.id} style={{ minWidth: 84, textAlign: 'center' }}>
                <Badge variant="dot" color="sky" size="sm">{sec.name}</Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            if (period.period_type === 'break') {
              return (
                <tr key={`b-${period.id}`}>
                  <td colSpan={sections.length + 1}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderRadius: 4, background: '#EDF0F5' }}>
                      <Text size="xs" c="dimmed">{period.label}</Text>
                    </div>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={`p-${period.id}`}>
                <td><Text size="xs" fw={600}>{period.label}</Text><Text size="xs" c="dimmed">{period.start_time}</Text></td>
                {sections.map((sec) => {
                  const weekEntries = [0, 1, 2, 3, 4].map((day) => entryMap[`${sec.id}-${day}-${period.id}`] ?? null);
                  return (
                    <td key={sec.id} style={{ padding: 2 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {weekEntries.map((entry, dayIdx) => {
                          const { bg, border } = accent(entry?.subject_id ?? null);
                          return (
                            <div key={dayIdx} title={entry ? `${DAYS[dayIdx]}: ${entry.subject_name}` : DAYS[dayIdx]}
                              style={{ flex: 1, height: 52, borderRadius: 4, background: entry ? bg : '#F5F7FA', border: `1px solid ${entry ? border : '#DDE3EC'}`, padding: '2px 3px', overflow: 'hidden' }}>
                              {entry ? (
                                <>
                                  <div style={{ fontSize: 8, fontWeight: 700, color: border, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{entry.subject_code ?? entry.subject_name}</div>
                                  <div style={{ fontSize: 7.5, color: '#868e96', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{shortName(entry.teacher_name)}</div>
                                </>
                              ) : (
                                <div style={{ fontSize: 8, color: '#9BAABB', textAlign: 'center' }}>{DAYS_SHORT[dayIdx][0]}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TimetablePage() {
  const [view, setView] = useState<'section' | 'school'>('section');
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const { data: classesData } = useQuery({ queryKey: ['classes'], queryFn: () => api.fetchClasses() });

  const sectionOptions = useMemo(() =>
    (classesData?.classes ?? []).map((cls) => ({
      group: cls.name ?? '',
      items: cls.sections.map((sec) => ({ value: String(sec.id), label: `Section ${sec.name}` })),
    })), [classesData]);

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Timetable</Title>
            <Text c="dimmed" size="sm">
              {view === 'school' ? 'School-wide view — all sections side by side' : 'Click a cell to assign. Drag filled cells to move them.'}
            </Text>
          </div>
          <Group gap="sm">
            <SegmentedControl size="xs" value={view} onChange={(v) => setView(v as 'section' | 'school')}
              data={[
                { value: 'section', label: <Group gap={4}><LayoutList size={13} /><span>Section</span></Group> },
                { value: 'school', label: <Group gap={4}><LayoutGrid size={13} /><span>School</span></Group> },
              ]} />
            {view === 'section' && (
              <Select placeholder="Choose section…" data={sectionOptions} value={sectionId ? String(sectionId) : null}
                onChange={(v) => { setSectionId(v ? Number(v) : null); setActiveCell(null); }} searchable w={200} />
            )}
          </Group>
        </Group>

        {view === 'school' ? <SchoolWideGrid /> : sectionId != null ? (
          <>
            <TimetableGrid sectionId={sectionId} onCellClick={setActiveCell} />
            <SubjectQuotaPanel sectionId={sectionId} />
            <TeacherLoadPanel />
          </>
        ) : (
          <Card>
            <Stack align="center" py="xl" gap="xs">
              <LayoutGrid size={36} strokeWidth={1.5} color="#9BAABB" />
              <Text fw={500} c="dimmed">No section selected</Text>
              <Text size="xs" c="dimmed" ta="center">Pick a section from the dropdown or switch to School View.</Text>
            </Stack>
          </Card>
        )}
      </Stack>
      {activeCell && sectionId != null && view === 'section' && (
        <CellModal cell={activeCell} sectionId={sectionId} onClose={() => setActiveCell(null)} />
      )}
    </Container>
  );
}
