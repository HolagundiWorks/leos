import { useQuery } from '@tanstack/react-query';
import { fetchStudios } from '../api/client';
import { useAuth } from '../stores/auth';

export function useStudios() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['studios'],
    queryFn: () => fetchStudios(token as string),
    enabled: !!token,
  });
}
