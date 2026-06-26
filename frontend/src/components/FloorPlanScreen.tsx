import { Fragment, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  FileButton,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { useClassrooms } from '../hooks/useClassrooms';
import { fetchFloorPlan, saveFloorPlan } from '../api/client';
import type { FloorPlanData, RoomShape } from '../api/client';
import { pdfToImage } from '../lib/pdf';

interface TypeStyle {
  label: string;
  fill: string;
  stroke: string;
}

// Room types + their canvas colours (semi-transparent fill, solid stroke).
const TYPE_STYLE: Record<string, TypeStyle> = {
  classroom: { label: 'Classroom', fill: 'rgba(59,130,246,0.16)', stroke: '#3B82F6' },
  lab: { label: 'Lab', fill: 'rgba(34,197,94,0.16)', stroke: '#22C55E' },
  office: { label: 'Office', fill: 'rgba(14,165,233,0.16)', stroke: '#0EA5E9' },
  staff: { label: 'Staff Room', fill: 'rgba(139,92,246,0.16)', stroke: '#8B5CF6' },
  toilet: { label: 'Toilet', fill: 'rgba(245,158,11,0.18)', stroke: '#F59E0B' },
  corridor: { label: 'Corridor', fill: 'rgba(100,116,139,0.14)', stroke: '#64748B' },
  library: { label: 'Library', fill: 'rgba(239,68,68,0.14)', stroke: '#EF4444' },
  other: { label: 'Other', fill: 'rgba(120,120,120,0.12)', stroke: '#9CA3AF' },
};
const TYPE_OPTIONS = Object.entries(TYPE_STYLE).map(([value, s]) => ({ value, label: s.label }));

function styleOf(type: string): TypeStyle {
  return TYPE_STYLE[type] ?? TYPE_STYLE.other;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface Bg {
  url: string;
  img: HTMLImageElement;
  w: number;
  h: number;
}

export function FloorPlanScreen() {
  const token = useAuth((s) => s.token) as string;
  const { data: classroomData } = useClassrooms();

  const [rooms, setRooms] = useState<RoomShape[]>([]);
  const [bg, setBg] = useState<Bg | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState('classroom');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [stageW, setStageW] = useState(960);

  const wrapRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Rect>>(new Map());

  // Load the saved plan once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const plan = await fetchFloorPlan(token).catch(() => null);
      if (!alive || !plan?.data) return;
      setRooms(plan.data.rooms ?? []);
      if (plan.data.bg) {
        const img = await loadImage(plan.data.bg).catch(() => null);
        if (img && alive) {
          setBg({ url: plan.data.bg, img, w: plan.data.bgWidth ?? img.width, h: plan.data.bgHeight ?? img.height });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // Track the available canvas width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(Math.max(360, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Attach the transformer to the selected rectangle.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? shapeRefs.current.get(selectedId) ?? null : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, rooms]);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const scale = bg && bg.w > 0 ? stageW / bg.w : 1;
  const stageH = bg ? Math.round(bg.h * scale) : 560;

  const update = (id: string, patch: Partial<RoomShape>) =>
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRoom = () => {
    const id = Math.random().toString(36).slice(2, 10);
    const s = styleOf(newType);
    setRooms((rs) => [...rs, { id, type: newType, label: s.label, x: 60, y: 60, w: 150, h: 96, classroomId: null }]);
    setSelectedId(id);
    setStatus('idle');
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setRooms((rs) => rs.filter((r) => r.id !== selectedId));
    shapeRefs.current.delete(selectedId);
    setSelectedId(null);
  };

  const importPdf = async (file: File | null) => {
    if (!file) return;
    const { dataUrl, width, height } = await pdfToImage(file);
    const img = await loadImage(dataUrl);
    setBg({ url: dataUrl, img, w: width, h: height });
  };

  const save = async () => {
    setStatus('saving');
    const data: FloorPlanData = {
      bg: bg?.url ?? null,
      bgWidth: bg?.w,
      bgHeight: bg?.h,
      rooms,
    };
    try {
      await saveFloorPlan(token, data);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('idle');
    }
  };

  const classroomOptions = (classroomData?.classrooms ?? []).map((c) => ({
    value: String(c.id),
    label: c.name ?? c.code ?? `#${c.id}`,
  }));

  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Floor Plan</Title>
          <Text c="dimmed">
            {bg ? 'Plan loaded' : 'No plan imported'} · {rooms.length} rooms
          </Text>
        </div>
        <Group gap="sm">
          {status === 'saved' && (
            <Badge color="mint" variant="light">
              Saved
            </Badge>
          )}
          <Button
            leftSection={<Save size={16} />}
            onClick={save}
            loading={status === 'saving'}
          >
            Save plan
          </Button>
        </Group>
      </Group>

      <Paper withBorder p="xs" radius="md">
        <Group gap="sm">
          <FileButton onChange={importPdf} accept="application/pdf">
            {(props) => (
              <Button {...props} variant="default" leftSection={<Upload size={16} />}>
                Import PDF
              </Button>
            )}
          </FileButton>
          <Divider orientation="vertical" />
          <Select
            w={150}
            data={TYPE_OPTIONS}
            value={newType}
            onChange={(v) => setNewType(v ?? 'classroom')}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <Button variant="light" leftSection={<Plus size={16} />} onClick={addRoom}>
            Add room
          </Button>

          {selected && (
            <>
              <Divider orientation="vertical" />
              <TextInput
                w={150}
                placeholder="Label"
                value={selected.label}
                onChange={(e) => update(selected.id, { label: e.currentTarget.value })}
              />
              <Select
                w={140}
                data={TYPE_OPTIONS}
                value={selected.type}
                onChange={(v) => update(selected.id, { type: v ?? selected.type })}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
              {selected.type === 'classroom' && (
                <Select
                  w={180}
                  placeholder="Link classroom"
                  data={classroomOptions}
                  value={selected.classroomId != null ? String(selected.classroomId) : null}
                  onChange={(v) => {
                    const opt = classroomOptions.find((o) => o.value === v);
                    update(selected.id, {
                      classroomId: v ? Number(v) : null,
                      label: opt ? opt.label : selected.label,
                    });
                  }}
                  clearable
                  searchable
                  comboboxProps={{ withinPortal: true }}
                />
              )}
              <Tooltip label="Delete room">
                <ActionIcon color="rose" variant="light" size="lg" onClick={removeSelected}>
                  <Trash2 size={18} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Paper>

      <Paper withBorder radius="md" ref={wrapRef} style={{ overflow: 'auto', background: '#FAFAFB' }}>
        <Stage
          width={stageW}
          height={stageH}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer scaleX={scale} scaleY={scale}>
            {bg && <KonvaImage image={bg.img} width={bg.w} height={bg.h} listening={false} />}
            {rooms.map((s) => {
              const st = styleOf(s.type);
              return (
                <Fragment key={s.id}>
                  <Rect
                    ref={(node) => {
                      if (node) shapeRefs.current.set(s.id, node);
                      else shapeRefs.current.delete(s.id);
                    }}
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    fill={st.fill}
                    stroke={st.stroke}
                    strokeWidth={selectedId === s.id ? 2.5 : 1.5}
                    cornerRadius={4}
                    draggable
                    onClick={() => setSelectedId(s.id)}
                    onTap={() => setSelectedId(s.id)}
                    onDragEnd={(e) => update(s.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
                    onTransformEnd={(e) => {
                      const node = e.target as Konva.Rect;
                      const sx = node.scaleX();
                      const sy = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      update(s.id, {
                        x: Math.round(node.x()),
                        y: Math.round(node.y()),
                        w: Math.max(30, Math.round(node.width() * sx)),
                        h: Math.max(24, Math.round(node.height() * sy)),
                      });
                    }}
                  />
                  <KonvaText
                    x={s.x + 6}
                    y={s.y + 6}
                    width={s.w - 12}
                    text={s.label}
                    fontSize={12}
                    fontStyle="600"
                    fill={st.stroke}
                    ellipsis
                    wrap="none"
                    listening={false}
                  />
                </Fragment>
              );
            })}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 30 || newBox.height < 24 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      </Paper>

      <Group gap="xs">
        {TYPE_OPTIONS.map((t) => {
          const st = styleOf(t.value);
          return (
            <Group key={t.value} gap={6}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: st.fill,
                  border: `1.5px solid ${st.stroke}`,
                  display: 'inline-block',
                }}
              />
              <Text size="xs" c="dimmed">
                {t.label}
              </Text>
            </Group>
          );
        })}
      </Group>
    </Stack>
  );
}
