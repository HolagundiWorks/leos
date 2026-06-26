import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Center,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { CircleAlert, Layers } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';

export function LoginPage() {
  const signIn = useAuth((s) => s.signIn);
  const setSchoolOpened = useAuth((s) => s.setSchoolOpened);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <BrandWatermark bottom={20} />
      <Card w={380} withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <ThemeIcon size={52} radius="lg" variant="light" color="brand">
              <Layers size={26} strokeWidth={1.6} />
            </ThemeIcon>
            <Title order={3} ta="center" c="gray.9">
              LEOS
            </Title>
            <Text size="xs" c="dimmed" ta="center" lh={1.4}>
              Learning Environment Operating System
            </Text>
          </Stack>

          <form onSubmit={submit}>
            <Stack gap="md">
              {error && (
                <Alert color="peach" radius="md" icon={<CircleAlert size={16} />}>
                  {error}
                </Alert>
              )}
              <TextInput
                label="Username"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="Password"
                placeholder="your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
              <Button type="submit" fullWidth loading={loading} mt="xs">
                Sign in
              </Button>
            </Stack>
          </form>

          <Stack gap={4} align="center">
            <Text size="xs" c="dimmed" ta="center">
              Default sign-in: <Text span fw={600}>admin</Text> / <Text span fw={600}>ChangeMe@3201</Text>
            </Text>
            <Text
              size="xs"
              c="brand"
              style={{ cursor: 'pointer' }}
              onClick={() => setSchoolOpened(false)}
            >
              ← Open a different school file
            </Text>
          </Stack>
        </Stack>
      </Card>
    </Center>
  );
}
