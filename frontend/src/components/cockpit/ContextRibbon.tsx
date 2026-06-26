import { Avatar, Button, Group, Kbd, Text, Tooltip } from '@mantine/core';
import { Eye, MessageSquare, Pencil, Printer } from 'lucide-react';
import { moduleByKey } from '../../modules';
import { useSelection } from '../../stores/selection';
import { initials } from '../../types';

/** Bottom action surface — contextual actions for the active module (max 6),
 *  refined to the selected row when one is picked (guide §12). */
export function ContextRibbon({
  active,
  onViewStudent,
}: {
  active: string;
  onViewStudent?: (id: number) => void;
}) {
  const student = useSelection((s) => s.student);

  if (active === 'students' && student) {
    return (
      <Group h="100%" px="md" gap="xs" wrap="nowrap" style={{ overflowX: 'auto' }}>
        <Group gap={8} wrap="nowrap" mr="sm" style={{ flexShrink: 0 }}>
          <Avatar size={26} radius="xl" color="brand" variant="light">
            {initials(student.name)}
          </Avatar>
          <Text size="sm" fw={600}>
            {student.name}
          </Text>
        </Group>
        <Button
          variant="filled"
          size="sm"
          style={{ flexShrink: 0 }}
          leftSection={<Eye size={16} strokeWidth={1.9} />}
          onClick={() => onViewStudent?.(student.id)}
        >
          View profile
        </Button>
        <Button variant="default" size="sm" style={{ flexShrink: 0 }} leftSection={<Pencil size={16} strokeWidth={1.9} />}>
          Edit
        </Button>
        <Button variant="default" size="sm" style={{ flexShrink: 0 }} leftSection={<Printer size={16} strokeWidth={1.9} />}>
          Print ID
        </Button>
        <Button variant="default" size="sm" style={{ flexShrink: 0 }} leftSection={<MessageSquare size={16} strokeWidth={1.9} />}>
          Message Parent
        </Button>
      </Group>
    );
  }

  const mod = moduleByKey[active];
  const actions = (mod?.actions ?? []).slice(0, 6);

  if (actions.length === 0) {
    return (
      <Group h="100%" px="md">
        <Text size="sm" c="dimmed">
          No quick actions for {mod?.label ?? 'this screen'}.
        </Text>
      </Group>
    );
  }

  return (
    <Group h="100%" px="md" gap="xs" wrap="nowrap" style={{ overflowX: 'auto' }}>
      {actions.map((a, i) => {
        const Icon = a.icon;
        const btn = (
          <Button
            variant={i === 0 ? 'filled' : 'default'}
            leftSection={<Icon size={16} strokeWidth={1.9} />}
            size="sm"
            style={{ flexShrink: 0 }}
          >
            {a.label}
          </Button>
        );
        return a.shortcut ? (
          <Tooltip key={a.key} label={<Kbd>{a.shortcut}</Kbd>} withArrow openDelay={300}>
            {btn}
          </Tooltip>
        ) : (
          <span key={a.key}>{btn}</span>
        );
      })}
    </Group>
  );
}
