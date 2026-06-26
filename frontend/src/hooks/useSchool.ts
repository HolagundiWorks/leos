import { useQuery } from '@tanstack/react-query';
import { fetchSchool } from '../api/client';
import { useAuth } from '../stores/auth';

export function useSchool() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['school'],
    queryFn: () => fetchSchool(token as string),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });
}
