import { useQuery } from '@tanstack/react-query';
import { fetchTeacherLoad } from '../api/client';
import { useAuth } from '../stores/auth';

export function useTeacherLoad() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['teacher-load'],
    queryFn: () => fetchTeacherLoad(token as string),
    enabled: !!token,
  });
}
