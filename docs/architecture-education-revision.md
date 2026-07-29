# Revision Proposal — Refocusing LEOS as a Dedicated Architecture-Education Platform

**Status:** Draft · **Date:** 2026-07-29 · **Owner:** Holagundi Consulting Works
**Scope:** Reframe LEOS (a generic offline-first school OS) into a purpose-built
operating system for a **School / College of Architecture** running the COA
5-year B.Arch (and M.Arch) programme.

---

## 1. Why this revision

LEOS today is institution-generic (School / Pre-School / College / PUC). A
school of architecture is *not* a generic college with a renamed course list —
its pedagogy, regulator, calendar, and assessment model are structurally
different. Making the platform "dedicated to architecture education" means
teaching the core LEOS modules to speak the language and enforce the rules of
architectural education, and adding the few first-class objects that the domain
demands (the **design studio**, the **jury**, the **portfolio**, the
**professional-training internship**, and the **design thesis**).

This document (a) captures the research on how architecture is taught and
regulated in India, and (b) maps that onto concrete, phased changes to the
existing LEOS modules.

---

## 2. Research — how architecture education works in India

### 2.1 Regulator and legal frame
- Architecture education is governed by the **Council of Architecture (COA)**, a
  statutory body under the **Architects Act, 1972**. The **Minimum Standards of
  Architectural Education (MSAR) Regulations** (originally 1983, revised since)
  prescribe eligibility, course duration, staffing, accommodation (studio space,
  workshops, library), course content, and examination norms. COA approves and
  periodically inspects institutions.
- Only COA-registered architects may use the title "Architect" and practise; the
  degree is the gateway to that registration. This makes **compliance,
  attendance, and internship records** unusually high-stakes for the institution.

### 2.2 Admission
- Entry to B.Arch is via **NATA** (National Aptitude Test in Architecture,
  conducted by COA) and/or **JEE (Main) Paper 2**. It tests drawing, visual
  perception, aesthetic sensitivity, logical reasoning — not just PCM marks.
- Eligibility: **Physics, Chemistry, Mathematics** at 10+2 with ~50% aggregate,
  plus a qualifying NATA/JEE-2 score.

### 2.3 Programme structure
- **B.Arch = 5 years / 10 semesters.** Total **260–300 credits**;
  **26–30 credits (≈26–30 contact hours) per semester**.
- **M.Arch = 2 years / 4 semesters** (specialisations: Urban Design, Landscape,
  Conservation, Sustainable Architecture, etc.). PhD tracks exist at larger
  schools (SPA, CEPT, IITs).
- Curriculum organises subjects into heads: **Professional Core** (Architectural
  Design studio, Building Construction & Materials, Working Drawings, History of
  Architecture, Theory of Design), **Building Sciences & Applied Engineering**
  (Structures, Building Services, Climatology/Environmental Studies), and
  **Humanities / Electives**.
- The **Design Studio** is the spine of *every* semester — a large drafting-table
  room where students carry ongoing design problems, build physical models, and
  present. It carries the highest credit weight of any subject.

### 2.4 Pedagogy — studio, juries, portfolio
- Assessment in studio is by **jury / crit / review**: a student pins up sheets
  and models and defends the design before a panel that usually includes
  **external examiners / visiting practitioners**. A school may run ~15 juries
  across a 35-week year. Juries are scheduled events with rooms, panels, and
  time-slots — closer to a timetable/event than to a written exam.
- Students accumulate a **portfolio** of sheets, models (photos), and drawings
  across five years — the artefact they carry to internships, jobs, and
  registration.
- **Visiting faculty** are mandated (roughly 25–50% of studio load) so students
  stay in contact with practising architects.

### 2.5 Professional training (internship)
- A **mandatory practical-training / internship semester** (~6 months, commonly
  in the 9th semester / after the 8th) in a registered architect's office or
  firm. Students maintain a **logbook**, are paid a stipend, and are assessed on
  return. This is a COA requirement, not optional.

### 2.6 Design thesis
- The final year culminates in an individual **design thesis**: a self-chosen,
  complex programme researched, designed, and detailed across a full semester,
  defended at a final **thesis jury / viva** before internal + external panels.

### 2.7 Student life
- **NASA** (National Association of Students of Architecture) runs zonal and
  annual conventions and design trophies; participation is a real part of a
  school's calendar and student record.

### 2.8 Implication for LEOS
Architecture is **studio-centric, jury-assessed, portfolio-carrying,
internship-gated, and COA-regulated**. The generic "class → subject → written
exam → report card" spine under-serves it. LEOS already has most of the
scaffolding (people, timetable, rooms, attendance, events, documents, audit);
the work is to **re-vocabulary** it and add five domain objects: **Studio,
Jury, Portfolio, Internship, Thesis**.

Sources:
- Council of Architecture — Minimum Standards of Architectural Education:
  <https://www.coa.gov.in/index1.php?lang=1&level=0&linkid=7&lid=11&key=education>
- SPA Delhi — B.Arch syllabus (credit/hour structure):
  <https://spa.ac.in/sites/default/files/2024-05/Bachelor_of_Architecture_Syllabus.pdf>
- Minimum Standards of Architectural Education Regulations (Architexturez):
  <https://architexturez.net/doc/az-cf-208268>

---

## 3. Product framing change

| | LEOS today | LEOS for Architecture |
|---|---|---|
| Identity | Generic school ops cockpit | Studio-first school-of-architecture OS |
| Default institution type | `school` | **`architecture`** (now the default on new files) |
| Core object | Class → Section | **Programme (B.Arch/M.Arch) → Year → Studio** |
| Central subject | Any course | **Design Studio** (credit-weighted, jury-assessed) |
| Assessment | Exam + marks + report card | **Jury / Review** (panel, external examiner, grade + comments) |
| Calendar | Terms + exams | **Semesters + juries + internship + thesis milestones** |
| Student artefact | Documents tab | **Portfolio** (sheets, model photos, drawings) |
| Compliance | Statutory returns (school) | **COA/MSAR compliance + attendance + internship logbook** |

The nomenclature layer (`frontend/src/lib/institution.ts`) is the switch that
carries most of this: an `architecture` type is added with studio vocabulary
(Programme / Studio / Subject / Year / Jury, "Studio Faculty" educators). It is
seeded as the **default** for newly created school files.

---

## 4. Module-by-module revision map

Legend: 🟢 rename/re-vocabulary only · 🟡 extend existing module · 🔴 new object.

| LEOS module | Change | Type |
|---|---|---|
| Institution Settings | Add `architecture` type; expose COA reg. no., NATA/COA intake config | 🟢🟡 |
| Terminology (`useTerms`) | Studio vocabulary already added (Programme/Studio/Jury/Faculty) | 🟢 |
| Classes & Sections | Present as **Programme → Year → Studio Section**; batch/year-of-admission | 🟢🟡 |
| Courses & Subjects | Tag subjects by **head** (Prof. Core / Building Sci. / HSS) + **credits**; flag `is_studio` | 🟡 |
| Teacher–Subject mapper | Add **visiting-faculty** flag + studio-load %; track MSAR visiting-load ratio | 🟡 |
| Staff | "Studio Faculty" label; qualification/COA-registration field for faculty | 🟢🟡 |
| Students | Admission via **NATA/JEE-2 score**, PCM eligibility capture; batch/programme | 🟡 |
| Timetable OS | Model long **studio blocks** (3–4 hr) distinct from lecture slots; jury slots | 🟡 |
| Attendance OS | Per-studio attendance with **COA minimum-attendance** thresholds + eligibility bar | 🟡 |
| Classrooms / Floor-plan | Represent **studios, workshops, model-making labs, material library** | 🟢🟡 |
| **Exams & Marks → Jury OS** | Reframe as **Jury/Review**: panel (incl. external), per-criterion grade + written crit, pin-up schedule | 🔴 |
| **Portfolio** | New per-student portfolio: sheets, model photos, drawings, per-studio, exportable | 🔴 |
| **Internship / Professional Training** | New object: firm, COA-reg. mentor, dates, **logbook**, stipend, on-return assessment | 🔴 |
| **Design Thesis** | New object: topic approval, guide, milestones, pre-thesis → final jury/viva, report | 🔴 |
| Activity Scheduler | Repurpose for **studios site visits, measure drawings, NASA conventions/trophies** | 🟢 |
| Events & Meetings | **Jury pin-up notices, guest lectures, exhibitions** | 🟢 |
| Fee OS | Studio-material/jury fees, internship-semester fee handling | 🟢 |
| Public Disclosure / Statutory | Swap school statutory returns for **COA/MSAR disclosure** fields | 🟡 |
| Backup, Security/Audit, Hardware, Import, Design Connect | Unchanged (already domain-neutral) | — |

---

## 5. Data-model additions (Rust API + SQLite)

New tables (studio objects), designed to sit beside the existing schema without
disturbing generic installs (all gated by institution type):

```
subjects        += head TEXT, credits INTEGER, is_studio INTEGER DEFAULT 0
staff           += is_visiting INTEGER DEFAULT 0, coa_reg_no TEXT, qualification TEXT
students         += programme TEXT, batch_year INTEGER, nata_score REAL, jee2_score REAL

studios         (id, name, year, semester, subject_id, section_id, academic_year_id)
juries          (id, studio_id, title, date, room_id, kind /* pinup|mid|final|thesis */)
jury_panel      (id, jury_id, staff_id NULL, external_name TEXT, is_external INTEGER)
jury_marks      (id, jury_id, student_id, criterion TEXT, score REAL, comments TEXT)

portfolio_items (id, student_id, studio_id NULL, kind /* sheet|model|drawing */,
                 media_path TEXT, title TEXT, created_at)

internships     (id, student_id, firm_name, mentor_name, mentor_coa_reg TEXT,
                 start_date, end_date, stipend REAL, status, assessment TEXT)
internship_log  (id, internship_id, entry_date, hours REAL, description TEXT)

theses          (id, student_id, guide_staff_id, title, topic_status,
                 pre_jury_grade TEXT, final_jury_grade TEXT, viva_date, report_path)
thesis_milestones (id, thesis_id, name, due_date, done INTEGER)
```

These reuse existing patterns (media in the `.leosdb` `media/`, audit on writes,
academic-year scoping). No PHP/MySQL heritage is touched — this stays Rust +
SQLite.

---

## 6. Phased plan

**Phase 0 — Vocabulary & framing (this PR).** `architecture` institution type
with studio nomenclature; default for new files; this proposal doc; README
positioning. Zero risk to existing installs.

**Phase 1 — Subjects & studios metadata.** `head` / `credits` / `is_studio` on
subjects; visiting-faculty flag on staff; NATA/JEE-2 + programme/batch on
students; COA reg. no. in Institution Settings. Studio-aware timetable blocks.

**Phase 2 — Jury OS.** Reframe Exam OS into juries: panels with external
examiners, per-criterion grading + written crit, pin-up scheduling on the
calendar. COA-attendance eligibility gate feeds jury eligibility.

**Phase 3 — Portfolio.** Per-student, per-studio artefact store with export.

**Phase 4 — Internship & Thesis.** Professional-training logbook + assessment;
thesis milestones and final jury/viva. Both gate progression per COA rules.

**Phase 5 — Compliance & disclosure.** MSAR/COA disclosure screen, visiting-load
ratio check, attendance-eligibility reports.

---

## 7. Out of scope / open questions

- **Multi-programme** institutions (B.Arch + M.Arch + PhD + allied design
  degrees) — supported by `programme` on students; UI grouping is Phase 1+.
- **Grade vs marks:** most schools grade studio on letter/GPA scales; the Jury OS
  should support both a criterion score and a final letter grade — confirm the
  target school's convention before Phase 2.
- **NASA / conventions** tracking depth — start as Activities, promote later if
  needed.
- Should the generic school types be **retired** once the platform is fully
  architecture-dedicated, or kept for reuse? Kept for now (non-breaking); can be
  hidden behind a build flag.

---

*Phase 0 lands the vocabulary switch and this plan; subsequent phases are
tracked in [`ROADMAP.md`](../ROADMAP.md).*
