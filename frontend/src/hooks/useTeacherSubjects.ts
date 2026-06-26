import { useQuery } from '@tanstack/react-query';
import { fetchTeacherSubjects } from '../api/client';
import { useAuth } from '../stores/auth';

export function useTeacherSubjects() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['teacher-subjects'],
    queryFn: () => fetchTeacherSubjects(token as string),
    enabled: !!token,
  });
}
