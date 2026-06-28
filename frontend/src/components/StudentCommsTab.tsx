import { useState } from 'react';
import {
  ActionIcon, Badge, Button, Group, Select, Stack, Text, TextInput, Textarea, Timeline,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Mail, MessageSquare, Phone, Trash2, Users } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { addStudentMessage, ackStudentMessage, deleteStudentMessage, fetchStudentMessages } from '../api/client';

const CHANNELS = ['Circular', 'SMS', 'Email', 'Call', 'Meeting', 'Note'];
const DIRECTIONS = ['Outgoing', 'Incoming'];
const ICON: Record<string, typeof Bell> = { Circular: Bell, SMS: MessageSquare, Email: Mail, Call: Phone, Meeting: Users, Note: MessageSquare };

export function StudentCommsTab({ studentId }: { studentId: number }) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['student-comms', studentId], queryFn: () => fetchStudentMessages(token, studentId) });
  const messages = data?.messages ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['student-comms', studentId] });

  const [m, setM] = useState({ channel: 'Circular', direction: 'Outgoing', subject: '', body: '' });
  const add = useMutation({
    mutationFn: () => addStudentMessage(token, { student_id: studentId, ...m }),
    onSuccess: () => { inv(); setM((s) => ({ ...s, subject: '', body: '' })); },
  });
  const ack = useMutation({ mutationFn: ({ id, v }: { id: number; v: boolean }) => ackStudentMessage(token, id, v), onSuccess: inv });
  const del = useMutation({ mutationFn: (id: number) => deleteStudentMessage(token, id), onSuccess: inv });

  return (
    <Stack gap="lg">
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select label="Channel" w={130} data={CHANNELS} value={m.channel} onChange={(v) => setM({ ...m, channel: v ?? 'Circular' })} allowDeselect={false} />
        <Select label="Direction" w={120} data={DIRECTIONS} value={m.direction} onChange={(v) => setM({ ...m, direction: v ?? 'Outgoing' })} allowDeselect={false} />
        <TextInput label="Subject" style={{ flex: 1, minWidth: 200 }} value={m.subject} onChange={(e) => setM({ ...m, subject: e.currentTarget.value })} data-testid="comm-subject" />
        <Button loading={add.isPending} disabled={!m.subject.trim()} onClick={() => add.mutate()} data-testid="comm-add">Log</Button>
      </Group>
      <Textarea placeholder="Message / notes (optional)" autosize minRows={2} value={m.body} onChange={(e) => setM({ ...m, body: e.currentTarget.value })} />

      {messages.length > 0 ? (
        <Timeline active={messages.length} bulletSize={26} lineWidth={2} data-testid="comm-timeline">
          {messages.map((msg) => {
            const Icon = ICON[msg.channel ?? 'Note'] ?? Bell;
            return (
              <Timeline.Item key={msg.id} bullet={<Icon size={13} />} title={
                <Group gap="xs">
                  <Text fw={600} size="sm">{msg.subject}</Text>
                  <Badge size="xs" variant="light">{msg.channel}</Badge>
                  <Badge size="xs" variant="outline" color={msg.direction === 'Incoming' ? 'grape' : 'sky'}>{msg.direction}</Badge>
                  {msg.acknowledged && <Badge size="xs" color="mint" variant="light" leftSection={<Check size={10} />}>Acknowledged</Badge>}
                </Group>
              }>
                {msg.body && <Text size="sm" c="dimmed">{msg.body}</Text>}
                <Group gap="sm" mt={4}>
                  <Text size="xs" c="dimmed">{msg.created_at?.slice(0, 16).replace('T', ' ')}</Text>
                  {!msg.acknowledged && <Button size="compact-xs" variant="subtle" onClick={() => ack.mutate({ id: msg.id, v: true })}>Mark acknowledged</Button>}
                  <ActionIcon size="sm" variant="subtle" color="red" onClick={() => del.mutate(msg.id)}><Trash2 size={13} /></ActionIcon>
                </Group>
              </Timeline.Item>
            );
          })}
        </Timeline>
      ) : <Text c="dimmed" ta="center" py="xl">No communication logged yet.</Text>}
    </Stack>
  );
}
