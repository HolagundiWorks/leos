import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  Cpu,
  Fingerprint,
  Nfc,
  ScanLine,
  Wifi,
} from "lucide-react";
import { useAuth } from "../stores/auth";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  card_uid?: string;
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiStudentByCard(
  token: string,
  uid: string,
): Promise<{ student: Student | null }> {
  return fetch(`${BASE}/students/by-card?uid=${encodeURIComponent(uid)}`, {
    headers: authed(token),
  }).then((r) => r.json());
}

async function postJSON(token: string, path: string, body: object) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authed(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

// ─── Barcode / NFC keyboard-emulation scanner ─────────────────────────────────
// Many NFC readers and barcode scanners behave as USB HID keyboards — they type
// the card UID / barcode value and send Enter. This panel captures that stream.
function ScanPanel({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanBuffer, setScanBuffer] = useState("");
  const [lastScan, setLastScan] = useState<{
    uid: string;
    student: Student | null;
    ts: Date;
  } | null>(null);
  const [scanLog, setScanLog] = useState<
    Array<{ uid: string; name: string; ts: Date }>
  >([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const qc = useQueryClient();

  // Query sections for the dropdown
  const { data: sectionsData } = useQuery({
    queryKey: ["sections-list"],
    queryFn: () =>
      fetch(`${BASE}/sections`, { headers: authed(token) }).then((r) =>
        r.json(),
      ),
    staleTime: 120_000,
  });

  const markMut = useMutation({
    mutationFn: (studentId: number) =>
      postJSON(token, "/attendance/mark", {
        section_id: Number(sectionId),
        date: new Date().toISOString().slice(0, 10),
        period_id: 1,
        records: [{ student_id: studentId, status: "present" }],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });

  const processScan = useCallback(
    async (uid: string) => {
      const trimmed = uid.trim();
      if (!trimmed) return;
      try {
        const res = await apiStudentByCard(token, trimmed);
        const student = res.student ?? null;
        setLastScan({ uid: trimmed, student, ts: new Date() });
        if (student) {
          setScanLog((prev) => [
            {
              uid: trimmed,
              name: `${student.first_name} ${student.last_name}`,
              ts: new Date(),
            },
            ...prev.slice(0, 49),
          ]);
          markMut.mutate(student.id);
        } else {
          setScanLog((prev) => [
            { uid: trimmed, name: "(unknown card)", ts: new Date() },
            ...prev.slice(0, 49),
          ]);
        }
      } catch (_) {
        setScanLog((prev) => [
          { uid: trimmed, name: "(lookup error)", ts: new Date() },
          ...prev.slice(0, 49),
        ]);
      }
    },
    [token, markMut],
  );

  // Hidden input captures HID keyboard events; auto-focus when panel is active
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sections = sectionsData?.sections ?? [];

  return (
    <Stack gap="sm">
      <Group gap="xs" align="center">
        <Nfc size={16} color="var(--mantine-color-brand-6)" />
        <Text size="sm" fw={500}>
          NFC / Barcode scanner (HID keyboard-emulation mode)
        </Text>
      </Group>
      <Text size="sm" c="dimmed">
        Click "Start scanning" then scan a card with your NFC reader or barcode
        scanner. The reader must operate in HID keyboard mode (most USB NFC
        readers + barcode scanners do this out of the box). Each scan marks the
        matched student as present.
      </Text>

      <Group align="flex-end" gap="sm">
        <Select
          label="Section (optional)"
          placeholder="Any section"
          data={sections.map(
            (s: { id: number; name: string; class_name?: string }) => ({
              value: String(s.id),
              label: `${s.class_name ?? ""} — ${s.name}`.trim(),
            }),
          )}
          value={sectionId}
          onChange={setSectionId}
          clearable
          w={240}
        />
        <Button
          leftSection={<ScanLine size={14} />}
          onClick={() => inputRef.current?.focus()}
        >
          Focus scan input
        </Button>
      </Group>

      {/* Hidden capture input — reads scanner output */}
      <TextInput
        ref={inputRef}
        value={scanBuffer}
        onChange={(e) => setScanBuffer(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const val = scanBuffer.trim();
            setScanBuffer("");
            if (val) processScan(val);
          }
        }}
        label="Scan input (keep focused while scanning)"
        placeholder="Waiting for scan…"
        styles={{ input: { fontFamily: "monospace" } }}
      />

      {lastScan && (
        <Alert
          icon={
            lastScan.student ? (
              <CheckCircle size={14} />
            ) : (
              <AlertCircle size={14} />
            )
          }
          color={lastScan.student ? "green" : "red"}
          title={
            lastScan.student
              ? `Marked present: ${lastScan.student.first_name} ${lastScan.student.last_name}`
              : "Card not linked to any student"
          }
        >
          Card UID: <code>{lastScan.uid}</code>
        </Alert>
      )}

      {scanLog.length > 0 && (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>Card UID</Table.Th>
              <Table.Th>Student</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {scanLog.map((entry, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {entry.ts.toLocaleTimeString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" style={{ fontFamily: "monospace" }}>
                    {entry.uid}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{entry.name}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// ─── Card enrollment panel ─────────────────────────────────────────────────────
function EnrollPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [cardUid, setCardUid] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(
    null,
  );

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["students-search", searchTerm],
    queryFn: () =>
      fetch(
        `${BASE}/students?search=${encodeURIComponent(searchTerm)}&limit=20`,
        { headers: authed(token) },
      ).then((r) => r.json()),
    staleTime: 15_000,
    enabled: searchTerm.length >= 2,
  });

  const enrollMut = useMutation({
    mutationFn: () =>
      postJSON(token, `/students/${selectedId}/update`, { card_uid: cardUid }),
    onSuccess: (data) => {
      setResult(data.error ? { error: data.error } : { ok: true });
      qc.invalidateQueries({ queryKey: ["students-search"] });
    },
    onError: (e) => setResult({ error: String(e) }),
  });

  const students = studentsData?.students ?? [];

  return (
    <Stack gap="sm">
      <Group gap="xs" align="center">
        <Fingerprint size={16} color="var(--mantine-color-brand-6)" />
        <Text size="sm" fw={500}>
          Link NFC card / barcode to student
        </Text>
      </Group>
      <Text size="sm" c="dimmed">
        Search for a student, then enter or scan the card UID to link it. Once
        linked, scanning the card in the Scan panel will automatically mark that
        student present.
      </Text>
      <TextInput
        label="Search student"
        placeholder="Type name…"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.currentTarget.value);
          setSelectedId(null);
        }}
      />
      {isLoading && <Skeleton height={60} radius="md" />}
      {students.length > 0 && (
        <Stack gap={4}>
          {students.map(
            (s: {
              id: number;
              first_name: string;
              last_name: string;
              card_uid?: string;
            }) => (
              <Card
                key={s.id}
                p="xs"
                withBorder
                style={{
                  cursor: "pointer",
                  background:
                    selectedId === s.id
                      ? "var(--mantine-color-brand-0)"
                      : undefined,
                }}
                onClick={() => setSelectedId(s.id)}
              >
                <Group justify="space-between">
                  <Text size="sm">
                    {s.first_name} {s.last_name}
                  </Text>
                  {s.card_uid && (
                    <Badge size="xs" variant="outline" color="teal">
                      linked: {s.card_uid}
                    </Badge>
                  )}
                </Group>
              </Card>
            ),
          )}
        </Stack>
      )}
      {selectedId && (
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Card UID (scan or type)"
            placeholder="Scan card here…"
            value={cardUid}
            onChange={(e) => setCardUid(e.currentTarget.value)}
            w={260}
            styles={{ input: { fontFamily: "monospace" } }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && cardUid.trim()) enrollMut.mutate();
            }}
          />
          <Button
            onClick={() => enrollMut.mutate()}
            loading={enrollMut.isPending}
            disabled={!cardUid.trim()}
          >
            Link Card
          </Button>
        </Group>
      )}
      {result &&
        (result.error ? (
          <Alert icon={<AlertCircle size={14} />} color="red">
            {result.error}
          </Alert>
        ) : (
          <Alert icon={<CheckCircle size={14} />} color="green">
            Card linked successfully.
          </Alert>
        ))}
    </Stack>
  );
}

// ─── Device info panel ─────────────────────────────────────────────────────────
function DeviceInfoPanel() {
  return (
    <Stack gap="sm">
      <Group gap="xs" align="center">
        <Cpu size={16} color="var(--mantine-color-brand-6)" />
        <Text size="sm" fw={500}>
          Supported hardware
        </Text>
      </Group>
      <Card p="sm" withBorder>
        <Stack gap="xs">
          <Group gap="xs">
            <Nfc size={14} />
            <Text size="sm" fw={500}>
              NFC / RFID readers
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Any USB NFC or RFID reader that operates in HID keyboard-emulation
            mode. Most ACR122U, PN532, and common school-ID readers work this
            way. Reader plugs in via USB, no driver needed — it appears as a
            keyboard and types the card UID followed by Enter.
          </Text>
        </Stack>
      </Card>
      <Card p="sm" withBorder>
        <Stack gap="xs">
          <Group gap="xs">
            <ScanLine size={14} />
            <Text size="sm" fw={500}>
              Barcode scanners
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            USB barcode scanners (1D/2D) in keyboard-emulation mode. Scan the
            student's ID card barcode. Enroll the barcode value to the student's
            card_uid field.
          </Text>
        </Stack>
      </Card>
      <Card p="sm" withBorder>
        <Stack gap="xs">
          <Group gap="xs">
            <Wifi size={14} />
            <Text size="sm" fw={500}>
              Future: Fingerprint / Biometric
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Native fingerprint scanner integration (Digital Persona, Suprema,
            etc.) requires device SDK integration and is planned for a future
            LEOS Connect Hardware release.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function HardwareScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState("scan");

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <Nfc size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>Hardware Integration</Title>
        </Group>

        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? "scan")}>
            <Tabs.List mb="md">
              <Tabs.Tab value="scan">Scan Attendance</Tabs.Tab>
              <Tabs.Tab value="enroll">Card Enrollment</Tabs.Tab>
              <Tabs.Tab value="devices">Device Guide</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="scan">
              <ScanPanel token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="enroll">
              <EnrollPanel token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="devices">
              <DeviceInfoPanel />
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
