// Institution types + the nomenclature each one uses. The app is institution-
// generic; the configured type drives how people/places are named in the UI.
//
// LEOS is being refocused as a dedicated Architecture-education platform (a
// school/college of architecture running a 5-year B.Arch + M.Arch under the
// Council of Architecture). The `architecture` type carries the studio-based
// vocabulary used across schools of architecture in India — see
// docs/architecture-education-revision.md for the full pedagogy → module map.

export type InstitutionType =
  | 'architecture'
  | 'school'
  | 'preschool'
  | 'college'
  | 'puc';

export interface InstitutionTypeOption {
  value: InstitutionType;
  label: string;
}

export const INSTITUTION_TYPES: InstitutionTypeOption[] = [
  { value: 'architecture', label: 'School of Architecture' },
  { value: 'school', label: 'School' },
  { value: 'preschool', label: 'Pre-School' },
  { value: 'college', label: 'College' },
  { value: 'puc', label: 'Pre-University College' },
];

export interface Terms {
  institution: string;
  educator: string; // singular, e.g. Teacher / Lecturer / Studio Faculty
  educatorPlural: string; // e.g. Teachers / Faculty
  student: string;
  students: string;
  // Optional studio-based vocabulary. Populated for schools of architecture;
  // undefined elsewhere so generic screens fall back to their existing labels.
  program?: string; // e.g. Programme (B.Arch / M.Arch) vs "Class"
  section?: string; // e.g. Studio Section vs "Section"
  course?: string; // e.g. Subject / Studio vs "Course"
  cohort?: string; // e.g. Year / Studio Year vs "Grade"
  assessment?: string; // e.g. Jury / Review vs "Exam"
}

const TERMS: Record<InstitutionType, Terms> = {
  architecture: {
    institution: 'School of Architecture',
    educator: 'Studio Faculty',
    educatorPlural: 'Faculty',
    student: 'Student',
    students: 'Students',
    program: 'Programme',
    section: 'Studio',
    course: 'Subject',
    cohort: 'Year',
    assessment: 'Jury',
  },
  school: {
    institution: 'School',
    educator: 'Teacher',
    educatorPlural: 'Teachers',
    student: 'Student',
    students: 'Students',
  },
  preschool: {
    institution: 'Pre-School',
    educator: 'Teacher',
    educatorPlural: 'Teachers',
    student: 'Child',
    students: 'Children',
  },
  college: {
    institution: 'College',
    educator: 'Lecturer',
    educatorPlural: 'Faculty',
    student: 'Student',
    students: 'Students',
  },
  puc: {
    institution: 'Pre-University College',
    educator: 'Lecturer',
    educatorPlural: 'Lecturers',
    student: 'Student',
    students: 'Students',
  },
};

export function termsFor(type: string | null | undefined): Terms {
  return TERMS[type as InstitutionType] ?? TERMS.school;
}

export function institutionTypeLabel(type: string | null | undefined): string {
  return INSTITUTION_TYPES.find((t) => t.value === type)?.label ?? 'School';
}
