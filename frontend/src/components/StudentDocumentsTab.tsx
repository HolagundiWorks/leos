import { useRef, useState } from 'react';
import {
  ActionIcon, Badge, Button, Group, Select, Stack, Table, Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Download, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../stores/auth';
import {
  addStudentDocument, deleteStudentDocument, fetchStudentDocument, fetchStudentDocuments,
  verifyStudentDocument,
} from '../api/client';
import { MAX_UPLOAD_BYTES, readAsDataUrl } from '../lib/fileData';

const DOC_TYPES = [
  'Birth Certificate', 'Aadhaar Card', 'Transfer Certificate', 'Migration Certificate',
  'Passport Photo', 'Parent ID Proof', 'Address Proof', 'Income Certificate',
  'Caste Certificate', 'Medical Certificate', 'Disability Certificate', 'Board Registration', 'Other',
];

export function StudentDocumentsTab({ studentId }: { studentId: number }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string | null>('Birth Certificate');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['student-docs', studentId], queryFn: () => fetchStudentDocuments(token, studentId) });
  const docs = data?.documents ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['student-docs', studentId] });

  const add = useMutation({
    mutationFn: (file: File) => readAsDataUrl(file).then((dataUrl) =>
      addStudentDocument(token, { student_id: studentId, doc_type: docType ?? 'Other', file_name: file.name, mime: file.type || 'application/octet-stream', data: dataUrl })),
    onSuccess: invalidate,
    onError: () => setError('Upload failed.'),
  });
  const verify = useMutation({ mutationFn: ({ id, v }: { id: number; v: boolean }) => verifyStudentDocument(token, id, v), onSuccess: invalidate });
  const del = useMutation({ mutationFn: (id: number) => deleteStudentDocument(token, id), onSuccess: invalidate });

  const pick = (file?: File) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — please keep documents under 3 MB.`); return; }
    add.mutate(file);
  };

  const download = async (id: number, fileName: string) => {
    const doc = await fetchStudentDocument(token, id);
    if (!doc?.data) return;
    const a = document.createElement('a');
    a.href = doc.data;
    a.download = fileName || `document-${id}`;
    a.click();
  };

  return (
    <Stack gap="md">
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <Select label="Document type" data={DOC_TYPES} value={docType} onChange={setDocType} w={240} data-testid="doc-type" />
        <Button leftSection={<Upload size={15} />} loading={add.isPending} onClick={() => ref.current?.click()} data-testid="doc-upload">Upload</Button>
        <Text size="xs" c="dimmed">PDF or image, under 3 MB.</Text>
      </Group>
      {error && <Text size="xs" c="red">{error}</Text>}

      {docs.length > 0 ? (
        <Table withTableBorder striped data-testid="doc-table">
          <Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>File</Table.Th><Table.Th>Uploaded</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {docs.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td><Text size="sm" fw={500}>{d.doc_type}</Text></Table.Td>
                <Table.Td><Text size="xs" lineClamp={1}>{d.file_name}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{d.uploaded_at?.slice(0, 10)}</Text></Table.Td>
                <Table.Td>
                  {d.verified
                    ? <Badge color="mint" variant="light" leftSection={<BadgeCheck size={11} />}>Verified</Badge>
                    : <Button size="compact-xs" variant="subtle" onClick={() => verify.mutate({ id: d.id, v: true })}>Mark verified</Button>}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon size="sm" variant="subtle" onClick={() => download(d.id, d.file_name ?? '')} title="Download"><Download size={14} /></ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => del.mutate(d.id)} title="Delete"><Trash2 size={14} /></ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : <Text c="dimmed" ta="center" py="xl">No documents uploaded yet.</Text>}

      <input ref={ref} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={(e) => { pick(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    </Stack>
  );
}
