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
  Title,
} from '@mantine/core';
import { CircleAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../stores/auth';
import { BrandWatermark } from './brand/BrandWatermark';
import { BrandMark } from './brand/BrandMark';

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
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Can't reach the LEOS service. Close and reopen the desktop app, then try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--mantine-color-body)' }}>
      <BrandWatermark bottom={20} />
      <Card w={380} withBorder shadow="sm" radius="lg" p="xl">
        <Stack gap="lg">
          <Stack gap={6} align="center">
            <BrandMark size={64} />
            <Title order={3} ta="center" c="gray.9">
              LEOS
            </Title>
            <Text size="xs" c="dimmed" ta="center" lh={1.4}>
              Learning Environment Operating System
            </Text>
          </Stack>

          <form onSubmit={submit} data-testid="login-form">
            <Stack gap="md">
              {error && (
                <Alert color="peach" radius="md" icon={<CircleAlert size={16} />} data-testid="login-error">
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
                data-testid="login-username-input"
              />
              <PasswordInput
                label="Password"
                placeholder="your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                data-testid="login-password-input"
              />
              <Button type="submit" fullWidth loading={loading} mt="xs" data-testid="login-submit-button">
                Sign in
              </Button>
            </Stack>
          </form>

          <Stack gap={4} align="center">
            <Text size="xs" c="dimmed" ta="center">
              Sign in with the account issued by your school administrator.
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
