import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

export interface TimetableSection {
  id: number;
  name: string | null;
  class_id: number;
  class_name: string | null;
  grade_level: string | null;
}

export interface AllTimetableEntry {
  id: number;
  section_id: number;
  period_id: number;
  day_of_week: number;
  subject_id: number | null;
  subject_name: string | null;
  subject_code: string | null;
  staff_id: number | null;
  teacher_name: string | null;
  room_id: number | null;
  room_name: string | null;
}

export interface TimetableAllResponse {
  sections: TimetableSection[];
  entries: AllTimetableEntry[];
}

async function fetchTimetableAll(token: string): Promise<TimetableAllResponse> {
  const res = await fetch(`${BASE}/timetable/all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch timetable');
  return res.json();
}

export function useTimetableAll() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ['timetable-all'],
    queryFn: () => fetchTimetableAll(token as string),
    enabled: !!token,
    staleTime: 30_000,
  });
}
