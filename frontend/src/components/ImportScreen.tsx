import { useState } from "react";
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
  Database,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useAuth } from "../stores/auth";
import { MergePanel } from "./MergePanel";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

interface ImportJob {
  id: number;
  source_type: string;
  source_path: string | null;
  status: string | null;
  rows_imported: number;
  rows_failed: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiJobs(token: string): Promise<{ jobs: ImportJob[] }> {
  return fetch(`${BASE}/import/jobs`, { headers: authed(token) }).then((r) =>
    r.json(),
  );
}

async function postJSON(token: string, path: string, body: object) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authed(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

const CSV_TARGETS = [
  { value: "students", label: "Students" },
  { value: "staff", label: "Staff" },
];

const SQLITE_TABLES = [
  { value: "students", label: "students" },
  { value: "staff", label: "staff" },
  { value: "courses", label: "courses" },
  { value: "subjects", label: "subjects" },
];

// ─── CSV Import panel ─────────────────────────────────────────────────────────
function CsvPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [path, setPath] = useState("");
  const [target, setTarget] = useState<string>("students");
  const [result, setResult] = useState<{
    ok?: boolean;
    rows_imported?: number;
    rows_failed?: number;
    error?: string;
  } | null>(null);

  const csvMut = useMutation({
    mutationFn: () => postJSON(token, "/import/csv", { path, target }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (e) => setResult({ error: String(e) }),
  });

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Import students or staff from a CSV file. Required columns depend on the
        target: students → <code>first_name, last_name, email</code>; staff →{" "}
        <code>first_name, last_name, email, profile</code>. Rows that already
        exist (by email) are skipped.
      </Text>
      <Group align="flex-end" gap="sm">
        <TextInput
          label="CSV file path"
          placeholder="C:\exports\students.csv"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          w={380}
          rightSectionWidth={window.leosDesktop ? 84 : undefined}
          rightSection={
            window.leosDesktop ? (
              <Button
                size="compact-xs"
                variant="light"
                onClick={async () => {
                  const file =
                    await window.leosDesktop!.chooseImportFile("csv");
                  if (file) setPath(file);
                }}
              >
                Browse…
              </Button>
            ) : undefined
          }
        />
        <Select
          label="Target table"
          data={CSV_TARGETS}
          value={target}
          onChange={(v) => setTarget(v ?? "students")}
          w={140}
        />
        <Button
          leftSection={<Upload size={14} />}
          onClick={() => {
            setResult(null);
            csvMut.mutate();
          }}
          loading={csvMut.isPending}
          disabled={!path.trim()}
        >
          Import CSV
        </Button>
      </Group>
      {result &&
        (result.error ? (
          <Alert
            icon={<AlertCircle size={14} />}
            color="red"
            title="Import failed"
          >
            {result.error}
          </Alert>
        ) : (
          <Alert
            icon={<CheckCircle size={14} />}
            color="green"
            title="Import complete"
          >
            {result.rows_imported} row(s) imported, {result.rows_failed}{" "}
            skipped.
          </Alert>
        ))}
    </Stack>
  );
}

// ─── SQLite Import panel ──────────────────────────────────────────────────────
function SqlitePanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const [path, setPath] = useState("");
  const [tables, setTables] = useState<string[]>(["students", "staff"]);
  const [result, setResult] = useState<{
    ok?: boolean;
    rows_imported?: number;
    error?: string;
  } | null>(null);

  const sqliteMut = useMutation({
    mutationFn: () => postJSON(token, "/import/sqlite", { path, tables }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (e) => setResult({ error: String(e) }),
  });

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Import compatible, allowlisted fields from another SQLite database. Use
        Merge School File for students and staff when two copies have been
        edited independently, so conflicts can be reviewed first.
      </Text>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput
          label="SQLite file path"
          placeholder="C:\exports\other_school.sqlite"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          w={380}
          rightSectionWidth={window.leosDesktop ? 84 : undefined}
          rightSection={
            window.leosDesktop ? (
              <Button
                size="compact-xs"
                variant="light"
                onClick={async () => {
                  const file =
                    await window.leosDesktop!.chooseImportFile("database");
                  if (file) setPath(file);
                }}
              >
                Browse…
              </Button>
            ) : undefined
          }
        />
      </Group>
      <Group gap="xs" mt={4}>
        <Text size="sm" fw={500}>
          Tables to import:
        </Text>
        {SQLITE_TABLES.map((t) => (
          <Badge
            key={t.value}
            variant={tables.includes(t.value) ? "filled" : "outline"}
            style={{ cursor: "pointer" }}
            onClick={() =>
              setTables((prev) =>
                prev.includes(t.value)
                  ? prev.filter((x) => x !== t.value)
                  : [...prev, t.value],
              )
            }
          >
            {t.label}
          </Badge>
        ))}
      </Group>
      <Group>
        <Button
          leftSection={<Database size={14} />}
          onClick={() => {
            setResult(null);
            sqliteMut.mutate();
          }}
          loading={sqliteMut.isPending}
          disabled={!path.trim() || tables.length === 0}
        >
          Import SQLite
        </Button>
      </Group>
      {result &&
        (result.error ? (
          <Alert
            icon={<AlertCircle size={14} />}
            color="red"
            title="Import failed"
          >
            {result.error}
          </Alert>
        ) : (
          <Alert
            icon={<CheckCircle size={14} />}
            color="green"
            title="Import complete"
          >
            {result.rows_imported} row(s) imported.
          </Alert>
        ))}
    </Stack>
  );
}

// ─── Job history panel ────────────────────────────────────────────────────────
function JobHistoryPanel({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => apiJobs(token),
    staleTime: 30_000,
  });

  const jobs = data?.jobs ?? [];

  const statusColor = (s: string | null) =>
    s === "completed"
      ? "green"
      : s === "error"
        ? "red"
        : s === "running"
          ? "blue"
          : "gray";

  return isLoading ? (
    <Skeleton height={150} radius="md" />
  ) : jobs.length === 0 ? (
    <Text size="sm" c="dimmed">
      No import jobs yet.
    </Text>
  ) : (
    <Table withTableBorder striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Date</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Source</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Imported</Table.Th>
          <Table.Th>Failed</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {jobs.map((j) => (
          <Table.Tr key={j.id}>
            <Table.Td>
              <Text size="xs" c="dimmed">
                {j.created_at.slice(0, 16)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Badge size="xs" variant="outline">
                {j.source_type.toUpperCase()}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text size="xs" lineClamp={1}>
                {j.source_path ?? "—"}
              </Text>
            </Table.Td>
            <Table.Td>
              <Badge size="xs" color={statusColor(j.status)}>
                {j.status ?? "pending"}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{j.rows_imported}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c={j.rows_failed > 0 ? "red" : undefined}>
                {j.rows_failed}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function ImportScreen() {
  const token = useAuth((s) => s.token)!;
  const [tab, setTab] = useState("merge");

  return (
    <Container size="xl" px={0}>
      <Stack gap="lg">
        <Group gap="sm" mb={4}>
          <FileSpreadsheet size={20} color="var(--mantine-color-brand-6)" />
          <Title order={2}>LEOS Connect — Data Import</Title>
        </Group>

        <Card>
          <Tabs value={tab} onChange={(v) => setTab(v ?? "csv")}>
            <Tabs.List mb="md">
              <Tabs.Tab value="merge">Merge School File</Tabs.Tab>
              <Tabs.Tab value="csv">CSV Import</Tabs.Tab>
              <Tabs.Tab value="sqlite">SQLite Import</Tabs.Tab>
              <Tabs.Tab value="history">Job History</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="merge">
              <MergePanel token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="csv">
              <CsvPanel token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="sqlite">
              <SqlitePanel token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="history">
              <JobHistoryPanel token={token} />
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  );
}
