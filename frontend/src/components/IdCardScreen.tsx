import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Printer } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useSchool } from '../hooks/useSchool';
import { useActiveYear } from '../hooks/useAcademicYears';
import { useAuth } from '../stores/auth';
import { initials } from '../types';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const TEAL = '#0F62FE';
const GRAPHITE = '#161616';

interface RosterStudent {
  id: number;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
}

function formatId(id: number) {
  return `LEOS-${String(id).padStart(6, '0')}`;
}

// Decorative barcode-like strip derived deterministically from the id.
function barWidths(id: number): number[] {
  const seq: number[] = [];
  let n = id * 2654435761;
  for (let i = 0; i < 36; i++) {
    n = (n ^ (n << 13)) >>> 0;
    seq.push((n % 3) + 1);
  }
  return seq;
}

// ─── Print: build a standalone HTML sheet of all cards ──────────────────────────
function printCards(students: RosterStudent[], school: string, ay: string, cls: string) {
  const card = (s: RosterStudent) => {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
    const bars = barWidths(s.id)
      .map((w, i) => `<span style="display:inline-block;width:${w}px;height:26px;background:${i % 2 ? '#fff' : GRAPHITE}"></span>`)
      .join('');
    return `
    <div class="card">
      <div class="head">
        <div class="school">${school}</div>
        <div class="ay">${ay}</div>
      </div>
      <div class="body">
        <div class="photo">${initials(name)}</div>
        <div class="info">
          <div class="name">${name}</div>
          <div class="row"><span>Class</span><b>${cls}</b></div>
          <div class="row"><span>Gender</span><b>${s.gender ?? '—'}</b></div>
          <div class="row"><span>ID</span><b>${formatId(s.id)}</b></div>
        </div>
      </div>
      <div class="barcode">${bars}</div>
      <div class="idtext">${formatId(s.id)}</div>
    </div>`;
  };
  const html = `<!DOCTYPE html><html><head><title>Student ID Cards</title>
<style>
  body{font-family:'Segoe UI',sans-serif;margin:10mm;background:#fff;}
  .sheet{display:flex;flex-wrap:wrap;gap:8mm;}
  .card{width:54mm;height:86mm;border:1px solid #ddd;border-radius:4mm;overflow:hidden;
        display:flex;flex-direction:column;page-break-inside:avoid;box-shadow:0 1px 3px rgba(0,0,0,.12);}
  .head{background:${GRAPHITE};color:#fff;padding:3mm;text-align:center;}
  .school{font-weight:700;font-size:3.4mm;line-height:1.15;}
  .ay{font-size:2.6mm;opacity:.7;margin-top:1mm;}
  .body{flex:1;display:flex;flex-direction:column;align-items:center;padding:3mm;}
  .photo{width:22mm;height:22mm;border-radius:50%;background:${TEAL};color:#fff;
         display:flex;align-items:center;justify-content:center;font-size:7mm;font-weight:700;margin:2mm 0 3mm;}
  .info{width:100%;}
  .name{font-weight:700;font-size:3.6mm;text-align:center;margin-bottom:2mm;}
  .row{display:flex;justify-content:space-between;font-size:2.8mm;padding:0.8mm 0;border-bottom:0.2mm solid #eee;}
  .row span{color:#888;}
  .barcode{background:#fff;display:flex;justify-content:center;align-items:center;height:26px;padding:1mm 3mm;}
  .idtext{text-align:center;font-size:2.6mm;letter-spacing:.5mm;padding-bottom:2mm;color:${GRAPHITE};}
  @media print{body{margin:6mm;}}
</style></head>
<body><div class="sheet">${students.map(card).join('')}</div></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
}

// ─── On-screen card preview ─────────────────────────────────────────────────────
function IdCardPreview({ s, school, ay, cls }: { s: RosterStudent; school: string; ay: string; cls: string }) {
  const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
  return (
    <Card p={0} radius="md" withBorder style={{ overflow: 'hidden', width: 220 }}>
      <div style={{ background: GRAPHITE, color: '#fff', padding: '10px 12px', textAlign: 'center' }}>
        <Text fw={700} size="sm" lh={1.15}>{school}</Text>
        <Text size="xs" style={{ opacity: 0.7 }}>{ay}</Text>
      </div>
      <Stack gap={6} align="center" p="sm">
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: TEAL, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, margin: '4px 0',
        }}>
          {initials(name)}
        </div>
        <Text fw={700} size="sm" ta="center" lineClamp={1}>{name}</Text>
        <div style={{ width: '100%' }}>
          {[['Class', cls], ['Gender', s.gender ?? '—'], ['ID', formatId(s.id)]].map(([k, v]) => (
            <Group key={k} justify="space-between" gap={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)', padding: '2px 0' }}>
              <Text size="xs" c="dimmed">{k}</Text>
              <Text size="xs" fw={600}>{v}</Text>
            </Group>
          ))}
        </div>
        <div style={{ display: 'flex', height: 24, alignItems: 'center', marginTop: 4 }}>
          {barWidths(s.id).map((w, i) => (
            <span key={i} style={{ display: 'inline-block', width: w, height: 22, background: i % 2 ? '#fff' : GRAPHITE }} />
          ))}
        </div>
      </Stack>
    </Card>
  );
}

interface FlatSection { id: number; label: string; }

export function IdCardScreen() {
  const token = useAuth((s) => s.token)!;
  const [sectionId, setSectionId] = useState<string | null>(null);
  const { data: classesData } = useClasses();
  const { data: school } = useSchool();
  const { data: activeYear } = useActiveYear();

  const schoolName = school?.name ?? 'School';
  const ay = activeYear?.year?.label ?? school?.academic_year ?? '';

  const flatSections = useMemo<FlatSection[]>(() => {
    const out: FlatSection[] = [];
    for (const cls of classesData?.classes ?? []) {
      for (const sec of cls.sections ?? []) out.push({ id: sec.id, label: `${cls.name} — ${sec.name}` });
    }
    return out;
  }, [classesData]);
  const sectionOptions = flatSections.map((s) => ({ value: String(s.id), label: s.label }));
  const clsLabel = flatSections.find((s) => String(s.id) === sectionId)?.label ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['id-card-roster', sectionId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/section-students?section_id=${sectionId}`, { headers: { Authorization: `Bearer ${token}` } });
      return r.json() as Promise<{ students: RosterStudent[] }>;
    },
    enabled: !!sectionId,
    staleTime: 60_000,
  });

  const students = data?.students ?? [];

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div>
            <Group gap="sm">
              <CreditCard size={20} color="var(--mantine-color-brand-6)" />
              <Title order={2}>ID Cards</Title>
            </Group>
            <Text c="dimmed" size="sm">Generate &amp; print student identity cards by class</Text>
          </div>
          <Button
            leftSection={<Printer size={15} />}
            disabled={students.length === 0}
            onClick={() => printCards(students, schoolName, ay, clsLabel)}
          >
            Print {students.length > 0 ? `(${students.length})` : 'All'}
          </Button>
        </Group>

        <Card>
          <Select
            label="Class / Section"
            placeholder="Select class + section…"
            data={sectionOptions}
            value={sectionId}
            onChange={setSectionId}
            searchable
            w={300}
          />
        </Card>

        {!sectionId ? (
          <Card><Text size="sm" c="dimmed" ta="center" py="md">Select a class to generate ID cards.</Text></Card>
        ) : isLoading ? (
          <Group>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={300} width={220} radius="md" />)}</Group>
        ) : students.length === 0 ? (
          <Card><Text size="sm" c="dimmed" ta="center" py="md">No students enrolled in this section yet.</Text></Card>
        ) : (
          <>
            <Badge variant="light" color="brand" w="fit-content">{students.length} cards</Badge>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
              {students.map((s) => (
                <IdCardPreview key={s.id} s={s} school={schoolName} ay={ay} cls={clsLabel} />
              ))}
            </SimpleGrid>
          </>
        )}
      </Stack>
    </Container>
  );
}
