import { useQuery } from '@tanstack/react-query';
import { fetchTimetableQuota } from '../api/client';
import { useAuth } from '../stores/auth';

export function useTimetableQuota(sectionId: number | null) {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['timetable-quota', sectionId],
    queryFn: () => fetchTimetableQuota(token as string, sectionId as number),
    enabled: !!token && sectionId != null,
  });
}
