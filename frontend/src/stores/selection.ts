import { create } from 'zustand';

interface SelectedStudent {
  id: number;
  name: string;
}

interface SelectionState {
  student: SelectedStudent | null;
  selectStudent: (id: number, name: string) => void;
  clear: () => void;
}

// Current row selection — drives the bottom context ribbon (guide §12).
export const useSelection = create<SelectionState>((set) => ({
  student: null,
  selectStudent: (id, name) => set({ student: { id, name } }),
  clear: () => set({ student: null }),
}));
