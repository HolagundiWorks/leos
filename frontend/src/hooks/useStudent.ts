import { useQuery } from '@tanstack/react-query';
import { fetchStudent } from '../api/client';
import { useAuth } from '../stores/auth';

export function useStudent(id: number | null) {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => fetchStudent(token as string, id as number),
    enabled: !!token && id != null,
  });
}
