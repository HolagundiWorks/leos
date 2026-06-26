import { useQuery } from '@tanstack/react-query';
import { fetchDashboardToday } from '../api/client';
import { useAuth } from '../stores/auth';

export function useDashboardToday() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => fetchDashboardToday(token as string),
    enabled: !!token,
  });
}
