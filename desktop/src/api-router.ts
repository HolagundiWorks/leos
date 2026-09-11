import Database from "./sqlite";
import { hash } from "bcryptjs";
import { z } from "zod";
import {
  type ApiRequest,
  type ApiResponse,
  apiResponseSchema,
} from "./contracts";
import { AuthService } from "./auth";
import { LmsRouter } from "./lms-router";
import { FinanceRouter } from "./finance-router";
import { OperationsRouter } from "./operations-router";
import { StaffOpsRouter } from "./staff-ops-router";
import { CoordinationRouter } from "./coordination-router";
import { BackupRouter } from "./backup-router";
import { ImportRouter } from "./import-router";
import { AdminRouter } from "./admin-router";
import { RecordsRouter } from "./records-router";
import { CocurricularRouter } from "./cocurricular-router";
import { SubstitutionRouter } from "./substitution-router";
import { StatutoryRouter } from "./statutory-router";
import { SupabaseRouter } from "./supabase-router";

const loginBody = z.object({ username: z.string(), password: z.string() });
const courseBody = z.object({ name: z.string().trim().min(1) });
const subjectBody = z.object({
  name: z.string().trim().min(1),
  code: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  course_id: z.number().int().nullable().optional(),
  weekly_periods: z.number().int().min(0).optional(),
  is_lab: z.boolean().optional(),
  mandatory: z.boolean().optional(),
});
const studentColumns = [
  "first_name",
  "middle_name",
  "last_name",
  "email",
  "phone",
  "gender",
  "birthdate",
  "alt_id",
  "enrolled",
  "guardian_name",
  "guardian_phone",
  "guardian_relation",
  "guardian_email",
  "guardian_aadhaar",
  "address",
  "father_name",
  "father_occupation",
  "father_employer",
  "father_income",
  "father_phone",
  "father_email",
  "father_aadhaar",
  "mother_name",
  "mother_occupation",
  "mother_employer",
  "mother_income",
  "mother_phone",
  "mother_email",
  "mother_aadhaar",
  "blood_group",
  "nationality",
  "religion",
  "category",
  "cwsn",
  "mother_tongue",
  "aadhaar",
  "apaar_id",
  "pen",
  "permanent_address",
  "photo",
  "emergency_contact",
  "medical_notes",
  "card_uid",
  "admission_date",
  "admission_class",
  "previous_school",
  "previous_board",
  "tc_number",
  "migration_number",
  "verification_status",
  "status",
] as const;
const lockedStudentFields = new Set([
  "first_name",
  "middle_name",
  "last_name",
  "father_name",
  "mother_name",
  "birthdate",
  "gender",
  "category",
  "cwsn",
]);
const studentBody = z
  .object({
    first_name: z.string().trim().min(1),
    last_name: z.string().trim().min(1),
  })
  .passthrough();
const staffBody = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  profile: z.string().optional(),
  title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  join_date: z.string().nullable().optional(),
  employee_id: z.string().nullable().optional(),
});
const classBody = z.object({
  name: z.string().trim().min(1),
  grade_level: z.string().nullable().optional(),
});
const sectionBody = z.object({
  class_id: z.number().int().positive(),
  name: z.string().trim().min(1),
  teacher_id: z.number().int().nullable().optional(),
  room_id: z.number().int().nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
});
const yearBody = z.object({
  label: z.string().trim().min(1),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});
const termBody = yearBody.extend({ year_id: z.number().int().positive() });
const idBody = z.object({ id: z.number().int().positive() });
const rosterBody = z.object({
  section_id: z.number().int().positive(),
  student_id: z.number().int().positive(),
});
const schoolBody = z.object({
  name: z.string().trim().min(1),
  academic_year: z.string(),
  type: z.string().optional(),
  address: z.string().nullable().optional(),
  principal_name: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  cert_bg: z.string().nullable().optional(),
  affiliation_no: z.string().nullable().optional(),
  school_code: z.string().nullable().optional(),
  udise_code: z.string().nullable().optional(),
});
const timetableBody = z.object({
  section_id: z.number().int().positive(),
  period_id: z.number().int().positive(),
  day_of_week: z.number().int().min(0).max(6),
  subject_id: z.number().int().nullable(),
  staff_id: z.number().int().nullable(),
  room_id: z.number().int().nullable(),
});
const timetableKeyBody = timetableBody.pick({
  section_id: true,
  period_id: true,
  day_of_week: true,
});
const periodBody = z.object({
  label: z.string().trim().min(1),
  period_type: z.enum(["period", "break"]),
  start_time: z.string(),
  end_time: z.string(),
});
const periodsBody = z.object({ periods: z.array(periodBody).max(50) });
const teacherSubjectBody = z.object({
  staff_id: z.number().int().positive(),
  subject_id: z.number().int().positive(),
  priority: z.number().int().min(1).max(3),
});
const floorPlanBody = z.object({
  name: z.string().optional(),
  data: z.unknown(),
});
const facultyPlanBase = z.object({
  period_type: z.enum(["daily", "weekly", "monthly"]),
  title: z.string().trim().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  section_id: z.number().int().nullable().optional(),
  subject_id: z.number().int().nullable().optional(),
  lessons: z.string().nullable().optional(),
  activities: z.string().nullable().optional(),
  schedule: z.string().nullable().optional(),
  objectives: z.string().nullable().optional(),
  resources: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["draft", "ready", "completed"]).optional(),
});
const facultyPlanBody = facultyPlanBase.refine(
  (body) => body.end_date >= body.start_date,
  { message: "end_date must be on or after start_date" },
);
const attendanceMarkBody = z.object({
  section_id: z.number().int().positive(),
  date: z.string().min(1),
  period_id: z.number().int(),
  records: z
    .array(
      z.object({
        student_id: z.number().int().positive(),
        status: z.enum(["present", "absent", "late", "excused"]),
        note: z.string().nullable().optional(),
      }),
    )
    .max(500),
});
const attendanceWarnBody = z.object({
  student_id: z.number().int().positive(),
  attendance_pct: z.number().min(0).max(100).optional(),
});
const examBody = z.object({
  name: z.string().trim().min(1),
  exam_type: z.string().optional(),
  academic_year_id: z.number().int().nullable().optional(),
  term_id: z.number().int().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});
const examScheduleBody = z.object({
  exam_id: z.number().int().positive(),
  subject_id: z.number().int().nullable(),
  section_id: z.number().int().nullable(),
  date: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  room_id: z.number().int().nullable(),
  invigilator_id: z.number().int().nullable(),
});
const examMarksBody = z.object({
  exam_id: z.number().int().positive(),
  records: z
    .array(
      z.object({
        student_id: z.number().int().positive(),
        subject_id: z.number().int().positive(),
        marks_obtained: z.number().min(0).nullable(),
        max_marks: z.number().positive(),
        grade: z.string().nullable().optional(),
        remarks: z.string().nullable().optional(),
      }),
    )
    .max(1000),
});
const archiveBody = z.object({
  academic_year: z.string().min(1),
  exam_name: z.string().min(1),
  material_type: z.string().min(1),
  subject: z.string().optional(),
  class_name: z.string().optional(),
  document: z.string().optional(),
  retention_until: z.string().optional(),
  notes: z.string().optional(),
});
const practicalBody = z.object({
  subject: z.string().min(1),
  class_name: z.string().optional(),
  exam_date: z.string().optional(),
  batch: z.string().optional(),
  internal_examiner: z.string().optional(),
  external_examiner: z.string().optional(),
  lab: z.string().optional(),
  max_marks: z.number().positive().optional(),
  evidence: z.string().optional(),
  geo: z.string().optional(),
  notes: z.string().optional(),
});
const practicalMarkBody = z.object({
  student_name: z.string().trim().min(1),
  marks: z.number().min(0).optional(),
});
const complianceBody = z.object({
  scope: z.string().min(1),
  staff_id: z.number().int().nullable().optional(),
  cert_type: z.string().min(1),
  authority: z.string().optional(),
  reference_no: z.string().optional(),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
  document: z.string().optional(),
  notes: z.string().optional(),
});
const portalAccountBody = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    password: z.string().min(8),
    role: z.enum(["teacher", "parent", "student"]),
    name: z.string().trim().min(1),
    staff_id: z.number().int().positive().nullable().optional(),
    student_ids: z.array(z.number().int().positive()).max(12).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.role === "teacher" && !body.staff_id)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Teacher accounts require a staff profile",
      });
    if (body.role === "student" && body.student_ids?.length !== 1)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Student accounts require exactly one student profile",
      });
    if (body.role === "parent" && !body.student_ids?.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Parent accounts require at least one student",
      });
  });
const resetPasswordBody = z.object({ password: z.string().min(8) });

export class ApiRouter {
  private readonly lms: LmsRouter;
  private readonly finance: FinanceRouter;
  private readonly operations: OperationsRouter;
  private readonly staffOps: StaffOpsRouter;
  private readonly coordination: CoordinationRouter;
  private readonly backup: BackupRouter;
  private readonly imports: ImportRouter;
  private readonly admin: AdminRouter;
  private readonly records: RecordsRouter;
  private readonly cocurricular: CocurricularRouter;
  private readonly substitutions: SubstitutionRouter;
  private readonly statutory: StatutoryRouter;
  private readonly supabase: SupabaseRouter;
  public constructor(
    private readonly databasePath: () => string,
    private readonly auth: AuthService,
  ) {
    this.lms = new LmsRouter(databasePath, auth);
    this.finance = new FinanceRouter(databasePath, auth);
    this.operations = new OperationsRouter(databasePath, auth);
    this.staffOps = new StaffOpsRouter(databasePath, auth);
    this.coordination = new CoordinationRouter(databasePath, auth);
    this.backup = new BackupRouter(databasePath, auth);
    this.imports = new ImportRouter(databasePath, auth);
    this.admin = new AdminRouter(databasePath, auth);
    this.records = new RecordsRouter(databasePath, auth);
    this.cocurricular = new CocurricularRouter(databasePath, auth);
    this.substitutions = new SubstitutionRouter(databasePath, auth);
    this.statutory = new StatutoryRouter(databasePath, auth);
    this.supabase = new SupabaseRouter(databasePath, auth);
  }

  public async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      const url = new URL(request.path, "http://leos.local");
      const path = url.pathname;

      if (request.method === "GET" && (path === "/" || path === "/health")) {
        return this.ok({ ok: true, status: "ok", service: "leos-typescript" });
      }
      if (request.method === "POST" && path === "/auth/login") {
        return this.created(
          await this.auth.login(loginBody.parse(request.body)),
          200,
        );
      }
      if (request.method === "GET" && path === "/auth/me") {
        return this.ok({ user: this.auth.me(this.token(request)) });
      }
      if (request.method === "POST" && path === "/auth/logout") {
        const token = this.token(request);
        this.auth.requireUserId(token);
        this.auth.logout(token);
        return this.ok({ ok: true });
      }

      this.auth.requireUserId(request.token);
      const account = this.auth.accountContext(request.token);
      if (
        ["parent", "student"].includes(account.role) &&
        path !== "/portal/profile" &&
        !path.startsWith("/lms/")
      ) {
        throw new Error(
          "Insufficient privileges. Portal accounts are limited to their linked profile and learning spaces.",
        );
      }
      this.authorizeStaffRoute(request, path);
      this.authorizeClientSurface(request, path);

      const supabaseResponse = await this.supabase.handle(request, path);
      if (supabaseResponse) return supabaseResponse;

      const backupResponse = await this.backup.handle(request, path);
      if (backupResponse) return backupResponse;
      const importResponse = this.imports.handle(request, path);
      if (importResponse) return importResponse;
      const adminResponse = this.admin.handle(request, url);
      if (adminResponse) return adminResponse;
      const recordsResponse = this.records.handle(request, url);
      if (recordsResponse) return recordsResponse;
      const cocurricularResponse = this.cocurricular.handle(request, url);
      if (cocurricularResponse) return cocurricularResponse;
      const substitutionResponse = this.substitutions.handle(request, url);
      if (substitutionResponse) return substitutionResponse;
      const statutoryResponse = this.statutory.handle(request, path);
      if (statutoryResponse) return statutoryResponse;

      const lmsResponse = this.lms.handle(request, path);
      if (lmsResponse) return lmsResponse;
      const financeResponse = this.finance.handle(request, url);
      if (financeResponse) return financeResponse;
      const operationsResponse = this.operations.handle(request, url);
      if (operationsResponse) return operationsResponse;
      const staffOpsResponse = this.staffOps.handle(request, url);
      if (staffOpsResponse) return staffOpsResponse;
      const coordinationResponse = this.coordination.handle(request, url);
      if (coordinationResponse) return coordinationResponse;

      if (request.method === "GET" && path === "/school") return this.school();
      if (request.method === "POST" && path === "/school")
        return this.saveSchool(request);
      if (request.method === "GET" && path === "/dashboard/stats")
        return this.dashboardStats();
      if (request.method === "GET" && path === "/dashboard/today")
        return this.dashboardToday();
      if (request.method === "GET" && path === "/dashboard/meetings-today")
        return this.meetingsToday();
      if (request.method === "GET" && path === "/dashboard/agenda")
        return this.dashboardAgenda();
      if (request.method === "GET" && path === "/dashboard/focus")
        return this.dashboardFocus();
      if (request.method === "GET" && path === "/students")
        return this.students(url);
      if (request.method === "POST" && path === "/students")
        return this.createStudent(request);
      if (request.method === "GET" && path === "/students/by-card")
        return this.studentByCard(url);
      if (
        request.method === "GET" &&
        /^\/students\/\d+\/attendance$/.test(path)
      )
        return this.studentAttendance(Number(path.split("/")[2]));
      if (request.method === "GET" && /^\/students\/\d+$/.test(path)) {
        return this.student(Number(path.split("/")[2]));
      }
      if (request.method === "POST" && /^\/students\/\d+\/update$/.test(path))
        return this.updateStudent(request, Number(path.split("/")[2]));
      if (request.method === "GET" && path === "/staff") return this.staff(url);
      if (request.method === "POST" && path === "/staff")
        return this.createStaff(request);
      if (request.method === "POST" && /^\/staff\/\d+\/update$/.test(path))
        return this.updateStaff(request, Number(path.split("/")[2]));
      if (request.method === "GET" && path === "/courses")
        return this.courses();
      if (request.method === "POST" && path === "/courses")
        return this.createCourse(request);
      if (
        request.method === "POST" &&
        /^\/courses\/\d+\/(update|delete)$/.test(path)
      ) {
        return this.changeCourse(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      }
      if (request.method === "GET" && path === "/subjects")
        return this.subjects(url);
      if (request.method === "POST" && path === "/subjects")
        return this.createSubject(request);
      if (
        request.method === "POST" &&
        /^\/subjects\/\d+\/(update|delete)$/.test(path)
      ) {
        return this.changeSubject(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      }
      if (request.method === "GET" && path === "/classrooms")
        return this.classrooms();
      if (request.method === "GET" && path === "/classes")
        return this.classes();
      if (request.method === "GET" && path === "/sections")
        return this.sections();
      if (request.method === "POST" && path === "/classes")
        return this.createClass(request);
      if (
        request.method === "POST" &&
        /^\/classes\/\d+\/(update|delete)$/.test(path)
      )
        return this.changeClass(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      if (request.method === "POST" && path === "/sections")
        return this.createSection(request);
      if (
        request.method === "POST" &&
        /^\/sections\/\d+\/(update|delete)$/.test(path)
      )
        return this.changeSection(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      if (request.method === "GET" && path === "/section-students")
        return this.sectionStudents(url);
      if (request.method === "POST" && path === "/section-students")
        return this.changeRoster(request, false);
      if (request.method === "POST" && path === "/section-students/remove")
        return this.changeRoster(request, true);
      if (request.method === "GET" && path === "/academic-years")
        return this.academicYears();
      if (request.method === "GET" && path === "/academic-years/active")
        return this.activeAcademicYear();
      if (request.method === "POST" && path === "/academic-years")
        return this.createAcademicYear(request);
      if (request.method === "POST" && path === "/academic-years/activate")
        return this.changeAcademicYear(request, "activate");
      if (request.method === "POST" && path === "/academic-years/close")
        return this.changeAcademicYear(request, "close");
      if (request.method === "POST" && path === "/terms")
        return this.createTerm(request);
      if (request.method === "POST" && path === "/terms/delete")
        return this.changeTerm(request, "delete");
      if (request.method === "POST" && path === "/terms/activate")
        return this.changeTerm(request, "activate");
      if (request.method === "GET" && path === "/timetable")
        return this.timetable(url);
      if (request.method === "GET" && path === "/timetable/day")
        return this.timetableDay(url);
      if (request.method === "POST" && path === "/timetable")
        return this.setTimetable(request);
      if (request.method === "POST" && path === "/timetable/clear")
        return this.clearTimetable(request);
      if (request.method === "GET" && path === "/timetable/quota")
        return this.timetableQuota(url);
      if (request.method === "GET" && path === "/timetable/teacher-load")
        return this.teacherLoad();
      if (request.method === "GET" && path === "/periods")
        return this.periods();
      if (request.method === "POST" && path === "/periods")
        return this.savePeriods(request);
      if (request.method === "GET" && path === "/teacher-subjects")
        return this.teacherSubjects();
      if (request.method === "POST" && path === "/teacher-subjects")
        return this.assignTeacherSubject(request);
      if (request.method === "POST" && path === "/teacher-subjects/remove")
        return this.removeTeacherSubject(request);
      if (request.method === "GET" && path === "/floorplan")
        return this.floorPlan();
      if (request.method === "POST" && path === "/floorplan")
        return this.saveFloorPlan(request);
      if (request.method === "GET" && path === "/faculty-plans")
        return this.facultyPlans(request, url);
      if (request.method === "POST" && path === "/faculty-plans")
        return this.createFacultyPlan(request);
      if (
        request.method === "POST" &&
        /^\/faculty-plans\/\d+\/(update|delete)$/.test(path)
      )
        return this.changeFacultyPlan(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      if (request.method === "GET" && path === "/attendance")
        return this.attendance(url);
      if (request.method === "POST" && path === "/attendance/mark")
        return this.markAttendance(request);
      if (request.method === "GET" && path === "/attendance/summary")
        return this.attendanceSummary(url);
      if (request.method === "GET" && path === "/attendance/alerts")
        return this.attendanceAlerts();
      if (request.method === "POST" && path === "/attendance/warn")
        return this.warnAttendance(request);
      if (request.method === "GET" && path === "/exams") return this.exams(url);
      if (request.method === "POST" && path === "/exams")
        return this.createExam(request);
      if (
        request.method === "POST" &&
        /^\/exams\/\d+\/(update|delete)$/.test(path)
      )
        return this.changeExam(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      if (request.method === "GET" && path === "/exam-schedules")
        return this.examSchedules(url);
      if (request.method === "POST" && path === "/exam-schedules")
        return this.saveExamSchedule(request);
      if (request.method === "GET" && path === "/exam-marks")
        return this.examMarks(url);
      if (request.method === "POST" && path === "/exam-marks")
        return this.saveExamMarks(request);
      if (request.method === "GET" && path === "/exam-marks/report")
        return this.examMarksReport(url);
      if (request.method === "GET" && path === "/exam-archives")
        return this.examArchives(url);
      if (request.method === "POST" && path === "/exam-archives")
        return this.createExamArchive(request);
      if (request.method === "GET" && /^\/exam-archives\/\d+$/.test(path))
        return this.examArchive(Number(path.split("/")[2]));
      if (
        request.method === "POST" &&
        /^\/exam-archives\/\d+\/(dispose|delete)$/.test(path)
      )
        return this.changeExamArchive(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/dispose"),
        );
      if (request.method === "GET" && path === "/practical-exams")
        return this.practicalExams();
      if (request.method === "POST" && path === "/practical-exams")
        return this.createPracticalExam(request);
      if (request.method === "GET" && /^\/practical-exams\/\d+$/.test(path))
        return this.practicalExam(Number(path.split("/")[2]));
      if (
        request.method === "POST" &&
        /^\/practical-exams\/\d+\/marks$/.test(path)
      )
        return this.createPracticalMark(request, Number(path.split("/")[2]));
      if (
        request.method === "POST" &&
        /^\/practical-exams\/\d+\/marks\/\d+\/delete$/.test(path)
      )
        return this.deletePracticalMark(
          request,
          Number(path.split("/")[2]),
          Number(path.split("/")[4]),
        );
      if (
        request.method === "POST" &&
        /^\/practical-exams\/\d+\/(lock|delete)$/.test(path)
      )
        return this.changePracticalExam(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/lock"),
        );
      if (request.method === "GET" && path === "/compliance-certs")
        return this.complianceCertificates(url);
      if (request.method === "POST" && path === "/compliance-certs")
        return this.saveComplianceCertificate(request);
      if (request.method === "GET" && /^\/compliance-certs\/\d+$/.test(path))
        return this.complianceCertificate(Number(path.split("/")[2]));
      if (
        request.method === "POST" &&
        /^\/compliance-certs\/\d+\/(update|delete)$/.test(path)
      )
        return this.changeComplianceCertificate(
          request,
          Number(path.split("/")[2]),
          path.endsWith("/delete"),
        );
      if (request.method === "GET" && path === "/portal/profile")
        return this.portalProfile(request);
      if (request.method === "GET" && path === "/portal/accounts")
        return this.portalAccounts(request);
      if (request.method === "POST" && path === "/portal/accounts")
        return await this.createPortalAccount(request);
      if (
        request.method === "POST" &&
        /^\/portal\/accounts\/\d+\/reset-password$/.test(path)
      )
        return await this.resetPortalPassword(
          request,
          Number(path.split("/")[3]),
        );
      if (
        request.method === "POST" &&
        /^\/portal\/accounts\/\d+\/delete$/.test(path)
      )
        return this.deletePortalAccount(request, Number(path.split("/")[3]));

      return this.response(404, {
        error: `TypeScript endpoint not migrated: ${request.method} ${path}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof z.ZodError
        ? 422
        : /Invalid credentials|Authentication required|Invalid or expired session/i.test(message)
          ? 401
          : /Insufficient privileges|available only on the host desktop|available on the desktop or LAN web/i.test(message)
            ? 403
            : 500;
      return this.response(status, { error: message });
    }
  }

  /** Enforce staff access before any route parses input or touches data. */
  private authorizeStaffRoute(request: ApiRequest, path: string): void {
    // LMS and personal-profile handlers apply record ownership/link scoping.
    if (path.startsWith("/lms/") || path === "/portal/profile") return;

    const policies: Array<[RegExp, number]> = [
      [/^\/(?:admin|audit-log|roles|backup|import|integrations\/supabase|portal\/accounts)(?:\/|$)/, 1],
      [/^\/school(?:\/|$)/, request.method === "GET" ? 4 : 1],
      [/^\/(?:fee-heads|fee-structures|fee-payments|fees|scholarships|payroll)(?:\/|$)/, 2],
      [/^\/(?:staff|departments|leave)(?:\/|$)/, 2],
      [
        /^\/(?:courses|subjects|classrooms|classes|sections|section-students|academic-years|terms|periods|teacher-subjects|floorplan)(?:\/|$)/,
        2,
      ],
      [
        /^\/(?:exams|exam-schedules|exam-marks|exam-archives|practical-exams|compliance-certs|compliance)(?:\/|$)/,
        2,
      ],
      [/^\/students(?:\/|$)/, request.method === "GET" ? 3 : 2],
      [/^\/timetable(?:\/|$)/, request.method === "GET" ? 3 : 2],
      [/^\/attendance\/mark$/, 4],
      [/^\/attendance(?:\/|$)/, 3],
      [/^\/faculty-plans(?:\/|$)/, 4],
      [
        /^\/(?:transport|issued|visitors|library|announcements|meetings|tasks|reminders|activities|activity-staff|activity-sections|activity-expenses|letters|certificates|student-documents|student-marks|board-registrations|student-communications|sports|clubs|club-members|substitutions)(?:\/|$)/,
        3,
      ],
    ];

    const policy = policies.find(([pattern]) => pattern.test(path));
    // Unknown reads remain visible to staff so dispatch can return a useful
    // 404. Unknown mutations fail closed at L2.
    this.auth.requireLevel(
      request.token,
      policy?.[1] ?? (request.method === "GET" ? 4 : 2),
    );
  }

  private authorizeClientSurface(request: ApiRequest, path: string): void {
    if (!request.source?.startsWith("lan")) return;
    const desktopOnly =
      /^\/(?:admin|audit-log|roles|backup|import|integrations|hardware|school)(?:\/|$)/;
    if (desktopOnly.test(path))
      throw new Error("This administration feature is available only on the host desktop.");

    if (request.source !== "lan-android" || request.method === "GET") return;
    const androidDayToDay = [
      /^\/attendance\/(?:mark|warn)$/,
      /^\/faculty-plans(?:\/|$)/,
      /^\/lms\/submissions(?:\/|$)/,
      /^\/(?:tasks|reminders)(?:\/|$)/,
    ];
    if (!androidDayToDay.some((pattern) => pattern.test(path)))
      throw new Error(
        "This data-entry feature is available on the desktop or LAN web application.",
      );
  }

  private school(): ApiResponse {
    return this.withDatabase((database) => {
      const school =
        database.prepare("SELECT * FROM schools ORDER BY id LIMIT 1").get() ??
        null;
      return this.ok({ school });
    });
  }

  private saveSchool(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 1);
    const body = schoolBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT id FROM schools ORDER BY id LIMIT 1")
        .pluck()
        .get() as number | undefined;
      const values = [
        body.name,
        body.academic_year,
        body.type ?? "school",
        body.address ?? null,
        body.principal_name ?? null,
        body.logo ?? null,
        body.signature ?? null,
        body.cert_bg ?? null,
        body.affiliation_no ?? null,
        body.school_code ?? null,
        body.udise_code ?? null,
      ];
      let id: number;
      if (current === undefined) {
        const result = database
          .prepare(
            `INSERT INTO schools(name,academic_year,type,address,principal_name,logo,signature,cert_bg,affiliation_no,school_code,udise_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(...values);
        id = Number(result.lastInsertRowid);
      } else {
        database
          .prepare(
            `UPDATE schools SET name=?,academic_year=?,type=?,address=?,principal_name=?,logo=?,signature=?,cert_bg=?,affiliation_no=?,school_code=?,udise_code=? WHERE id=?`,
          )
          .run(...values, current);
        id = current;
      }
      this.audit(database, actor, "school.update", "school", id);
      return this.ok({ ok: true });
    });
  }

  private dashboardStats(): ApiResponse {
    return this.withDatabase((database) => {
      const scalar = (sql: string): number =>
        Number(database.prepare(sql).pluck().get() ?? 0);
      return this.ok({
        students: scalar("SELECT COUNT(*) FROM students"),
        staff: scalar("SELECT COUNT(*) FROM staff"),
        sections: scalar("SELECT COUNT(*) FROM sections"),
        pending_fees: scalar(
          `SELECT COUNT(DISTINCT s.id) FROM students s
           JOIN (SELECT DISTINCT ss.student_id, se.class_id FROM section_students ss JOIN sections se ON se.id=ss.section_id) sc ON sc.student_id=s.id
           JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id=sc.class_id)
           WHERE fs.amount > COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id), 0)`,
        ),
      });
    });
  }

  private dashboardToday(): ApiResponse {
    return this.withDatabase((database) => {
      const scalar = (sql: string): number =>
        Number(database.prepare(sql).pluck().get() ?? 0);
      const items = [
        {
          key: "fees",
          count: scalar(`SELECT COUNT(DISTINCT s.id) FROM students s
          JOIN section_students ss ON ss.student_id=s.id JOIN sections se ON se.id=ss.section_id
          JOIN fee_structures fs ON (fs.class_id IS NULL OR fs.class_id=se.class_id)
          WHERE fs.amount > COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.student_id=s.id AND fp.fee_head_id=fs.fee_head_id),0)`),
          label: "Fees outstanding",
          severity: "warning",
          module: "fees",
        },
        {
          key: "leave",
          count: scalar(
            "SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'",
          ),
          label: "Leave requests",
          severity: "info",
          module: "staff-os",
        },
        {
          key: "tasks",
          count: scalar(
            "SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND (due_date IS NULL OR due_date <= date('now'))",
          ),
          label: "Tasks due",
          severity: "danger",
          module: "events",
        },
      ].filter((item) => item.count > 0);
      return this.ok({ items });
    });
  }

  private meetingsToday(): ApiResponse {
    return this.withDatabase((database) => {
      const meetings = database
        .prepare(
          "SELECT id, title, meeting_type, date, start_time, end_time, venue, status FROM meetings WHERE date = date('now') ORDER BY start_time",
        )
        .all();
      return this.ok({ meetings, total: meetings.length });
    });
  }

  private dashboardAgenda(): ApiResponse {
    return this.withDatabase((database) => {
      const meetings = database.prepare(
        `SELECT id, title, meeting_type, date, start_time, venue, status
         FROM meetings WHERE meeting_type = ? AND date >= date('now') AND status != 'cancelled'
         ORDER BY date, start_time LIMIT 5`,
      );
      const events = database
        .prepare(
          `SELECT id, title, activity_type, date, venue, status FROM activities
         WHERE date >= date('now') AND status IN ('planned','confirmed') ORDER BY date LIMIT 6`,
        )
        .all();
      return this.ok({
        department: meetings.all("department"),
        staff: meetings.all("staff"),
        parent: meetings.all("parent"),
        events,
      });
    });
  }

  private dashboardFocus(): ApiResponse {
    return this.withDatabase((database) => {
      const critical = database
        .prepare(
          `SELECT * FROM (
           SELECT 'reminder' AS kind, id, title, tag, due_date FROM reminders WHERE done=0 AND tag='critical'
           UNION ALL
           SELECT 'task' AS kind, id, title, priority AS tag, due_date FROM tasks
             WHERE status NOT IN ('completed','cancelled') AND priority='critical'
         ) ORDER BY (due_date IS NULL), due_date LIMIT 10`,
        )
        .all();
      const due = database
        .prepare(
          `SELECT * FROM (
           SELECT 'reminder' AS kind, id, title, tag, due_date FROM reminders WHERE done=0 AND due_date IS NOT NULL
           UNION ALL
           SELECT 'task' AS kind, id, title, priority AS tag, due_date FROM tasks
             WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL
         ) ORDER BY due_date LIMIT 10`,
        )
        .all();
      return this.ok({ critical, due });
    });
  }

  private students(url: URL): ApiResponse {
    return this.withDatabase((database) => {
      const query =
        (url.searchParams.get("q") ?? url.searchParams.get("search"))?.trim() ??
        "";
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
      const like = `%${query}%`;
      const where = query
        ? "WHERE first_name || ' ' || last_name LIKE ? OR email LIKE ?"
        : "";
      const params = query ? [like, like, limit, offset] : [limit, offset];
      const students = database
        .prepare(
          `SELECT id, first_name, last_name, email, phone, gender, birthdate
         FROM students ${where} ORDER BY first_name, last_name LIMIT ? OFFSET ?`,
        )
        .all(...params);
      const total = Number(
        database
          .prepare(`SELECT COUNT(*) FROM students ${where}`)
          .pluck()
          .get(...(query ? [like, like] : [])) ?? 0,
      );
      return this.ok({ students, total });
    });
  }

  private student(id: number): ApiResponse {
    return this.withDatabase((database) => {
      const student = database
        .prepare("SELECT * FROM students WHERE id = ?")
        .get(id) as Record<string, unknown> | undefined;
      if (student) student.enrolled = Number(student.enrolled) === 1;
      return student
        ? this.ok({ student })
        : this.response(404, { error: "student not found" });
    });
  }

  private studentByCard(url: URL): ApiResponse {
    const uid = z.string().trim().min(1).parse(url.searchParams.get("uid"));
    return this.withDatabase((database) => {
      const student =
        database
          .prepare(
            "SELECT id,first_name,last_name,card_uid FROM students WHERE card_uid=?",
          )
          .get(uid) ?? null;
      return this.ok({ student });
    });
  }

  private studentAttendance(id: number): ApiResponse {
    return this.withDatabase((database) => {
      const row = database
        .prepare(
          `SELECT COUNT(CASE WHEN status IN ('present','late') THEN 1 END) attended,COUNT(id) total FROM student_attendance WHERE student_id=?`,
        )
        .get(id) as { attended: number; total: number };
      const pct = row.total
        ? Math.round((row.attended / row.total) * 100 * 10) / 10
        : 0;
      return this.ok({
        attended: row.attended,
        total: row.total,
        attendance_pct: pct,
        status:
          row.total < 5
            ? "Insufficient data"
            : pct >= 75
              ? "Eligible"
              : "At risk",
        threshold: 75,
      });
    });
  }

  private createStudent(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = studentBody.parse(request.body) as Record<string, unknown>;
    return this.withWriteDatabase((database) => {
      const columns = studentColumns.filter(
        (column) => body[column] !== undefined,
      );
      const values = columns.map((column) =>
        column === "enrolled"
          ? Number(Boolean(body[column]))
          : body[column] === ""
            ? null
            : body[column],
      );
      const result = database
        .prepare(
          `INSERT INTO students(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
        )
        .run(...values);
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "student.create", "student", id);
      return this.created({ ok: true, id });
    });
  }

  private updateStudent(request: ApiRequest, id: number): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    const columns = studentColumns.filter(
      (column) => body[column] !== undefined,
    );
    if (!columns.length) return this.ok({ ok: true, changed: 0 });
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare(
          `SELECT lock_state,${columns.join(",")} FROM students WHERE id=?`,
        )
        .get(id) as Record<string, unknown> | undefined;
      if (!current) return this.response(404, { error: "student not found" });
      const changed = columns.filter(
        (column) =>
          String(current[column] ?? "") !==
          String(
            column === "enrolled"
              ? Number(Boolean(body[column]))
              : (body[column] ?? ""),
          ),
      );
      const blocked = changed.filter((column) =>
        lockedStudentFields.has(column),
      );
      if (
        current.lock_state === "Locked" &&
        blocked.length &&
        !(
          body.override === true &&
          typeof body.reason === "string" &&
          body.reason.trim()
        )
      ) {
        return this.response(423, {
          error:
            "record is locked; CBSE-locked fields require an override with a reason",
          locked_fields: blocked,
        });
      }
      const values = columns.map((column) =>
        column === "enrolled"
          ? Number(Boolean(body[column]))
          : body[column] === ""
            ? null
            : body[column],
      );
      database
        .prepare(
          `UPDATE students SET ${columns.map((column) => `${column}=?`).join(",")} WHERE id=?`,
        )
        .run(...values, id);
      for (const column of changed) {
        const action =
          current.lock_state === "Locked" && lockedStudentFields.has(column)
            ? "student.locked_override"
            : "student.update";
        this.audit(
          database,
          actor,
          action,
          "student",
          id,
          JSON.stringify({
            field: column,
            old: current[column] ?? null,
            new: body[column] ?? null,
            reason: body.reason ?? null,
          }),
        );
      }
      return this.ok({ ok: true, changed: changed.length });
    });
  }

  private staff(url: URL): ApiResponse {
    return this.withDatabase((database) => {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const like = `%${query}%`;
      const where = query
        ? "WHERE first_name || ' ' || last_name LIKE ? OR email LIKE ?"
        : "";
      const staff = database
        .prepare(
          `SELECT id, first_name, last_name, email, phone, profile, title, department, employee_id, join_date
         FROM staff ${where} ORDER BY first_name, last_name`,
        )
        .all(...(query ? [like, like] : []));
      return this.ok({ staff, total: staff.length });
    });
  }

  private createStaff(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = staffBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          `INSERT INTO staff(first_name,last_name,email,phone,profile,title,department,join_date,employee_id) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          body.first_name,
          body.last_name,
          body.email || null,
          body.phone || null,
          body.profile || "teacher",
          body.title || null,
          body.department || null,
          body.join_date || null,
          body.employee_id || null,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "staff.create", "staff", id);
      return this.created({ ok: true, id });
    });
  }

  private updateStaff(request: ApiRequest, id: number): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = staffBody.partial().parse(request.body);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT * FROM staff WHERE id=?")
        .get(id) as Record<string, unknown> | undefined;
      if (!current) return this.response(404, { error: "staff not found" });
      const value = (key: keyof typeof body) =>
        body[key] === undefined ? current[key] : body[key] || null;
      database
        .prepare(
          `UPDATE staff SET first_name=?,last_name=?,email=?,phone=?,profile=?,title=?,department=?,join_date=?,employee_id=? WHERE id=?`,
        )
        .run(
          value("first_name"),
          value("last_name"),
          value("email"),
          value("phone"),
          value("profile"),
          value("title"),
          value("department"),
          value("join_date"),
          value("employee_id"),
          id,
        );
      this.audit(database, actor, "staff.update", "staff", id);
      return this.ok({ ok: true });
    });
  }

  private courses(): ApiResponse {
    return this.withDatabase((database) => {
      const courses = database
        .prepare(
          `SELECT c.id, c.name, (SELECT COUNT(*) FROM subjects s WHERE s.course_id=c.id) AS subjects
         FROM courses c ORDER BY c.name`,
        )
        .all();
      return this.ok({ courses, total: courses.length });
    });
  }

  private createCourse(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = courseBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare("INSERT INTO courses(name) VALUES(?)")
        .run(body.name);
      this.audit(
        database,
        actor,
        "course.create",
        "course",
        Number(result.lastInsertRowid),
      );
      return this.created({ ok: true, id: Number(result.lastInsertRowid) });
    });
  }

  private changeCourse(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((database) => {
      if (remove) {
        const operation = database.transaction(() => {
          database
            .prepare("UPDATE subjects SET course_id=NULL WHERE course_id=?")
            .run(id);
          database.prepare("DELETE FROM courses WHERE id=?").run(id);
          this.audit(database, actor, "course.delete", "course", id);
        });
        operation();
      } else {
        const body = courseBody.parse(request.body);
        const result = database
          .prepare("UPDATE courses SET name=? WHERE id=?")
          .run(body.name, id);
        if (!result.changes)
          return this.response(404, { error: "course not found" });
        this.audit(database, actor, "course.update", "course", id);
      }
      return this.ok({ ok: true });
    });
  }

  private subjects(url: URL): ApiResponse {
    return this.withDatabase((database) => {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const like = `%${query}%`;
      const subjects = database
        .prepare(
          `SELECT id, course_id, name, code, type, weekly_periods, is_lab, mandatory FROM subjects
         ${query ? "WHERE name LIKE ? OR code LIKE ?" : ""} ORDER BY name`,
        )
        .all(...(query ? [like, like] : []));
      return this.ok({ subjects, total: subjects.length });
    });
  }

  private createSubject(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = subjectBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          `INSERT INTO subjects(course_id,name,code,type,weekly_periods,is_lab,mandatory)
         VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          body.course_id ?? null,
          body.name,
          body.code ?? null,
          body.type ?? null,
          body.weekly_periods ?? 0,
          body.is_lab ? 1 : 0,
          body.mandatory === false ? 0 : 1,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "subject.create", "subject", id);
      return this.created({ ok: true, id });
    });
  }

  private changeSubject(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((database) => {
      if (remove) {
        const operation = database.transaction(() => {
          database
            .prepare("DELETE FROM teacher_subjects WHERE subject_id=?")
            .run(id);
          database
            .prepare(
              "UPDATE timetable_entries SET subject_id=NULL WHERE subject_id=?",
            )
            .run(id);
          database.prepare("DELETE FROM subjects WHERE id=?").run(id);
          this.audit(database, actor, "subject.delete", "subject", id);
        });
        operation();
      } else {
        const body = subjectBody.partial().parse(request.body);
        const current = database
          .prepare("SELECT * FROM subjects WHERE id=?")
          .get(id) as Record<string, unknown> | undefined;
        if (!current) return this.response(404, { error: "subject not found" });
        database
          .prepare(
            `UPDATE subjects SET course_id=?,name=?,code=?,type=?,weekly_periods=?,is_lab=?,mandatory=? WHERE id=?`,
          )
          .run(
            body.course_id === undefined ? current.course_id : body.course_id,
            body.name ?? current.name,
            body.code === undefined ? current.code : body.code,
            body.type === undefined ? current.type : body.type,
            body.weekly_periods ?? current.weekly_periods,
            body.is_lab === undefined ? current.is_lab : Number(body.is_lab),
            body.mandatory === undefined
              ? current.mandatory
              : Number(body.mandatory),
            id,
          );
        this.audit(database, actor, "subject.update", "subject", id);
      }
      return this.ok({ ok: true });
    });
  }

  private classrooms(): ApiResponse {
    return this.withDatabase((database) => {
      const classrooms = database
        .prepare(
          "SELECT id,name,code,capacity,room_type,is_active FROM classrooms ORDER BY name",
        )
        .all();
      return this.ok({ classrooms, total: classrooms.length });
    });
  }

  private classes(): ApiResponse {
    return this.withDatabase((database) => {
      const classes = (
        database
          .prepare("SELECT id,name,grade_level FROM classes ORDER BY id")
          .all() as Array<Record<string, unknown>>
      ).map((row) => ({
        ...row,
        sections: database
          .prepare(
            `SELECT s.id,s.name,s.capacity,
          CASE WHEN st.id IS NULL THEN NULL ELSE trim(COALESCE(st.first_name,'') || ' ' || COALESCE(st.last_name,'')) END teacher,
          r.name room FROM sections s LEFT JOIN staff st ON st.id=s.teacher_id LEFT JOIN classrooms r ON r.id=s.room_id
          WHERE s.class_id=? ORDER BY s.name`,
          )
          .all(row.id),
      }));
      return this.ok({ classes, total: classes.length });
    });
  }

  private createClass(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = classBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare("INSERT INTO classes(name,grade_level) VALUES(?,?)")
        .run(body.name, body.grade_level ?? null);
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "class.create", "class", id);
      return this.created({ ok: true, id });
    });
  }

  private changeClass(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT * FROM classes WHERE id=?")
        .get(id) as Record<string, unknown> | undefined;
      if (!current) return this.response(404, { error: "class not found" });
      if (remove) {
        database.transaction(() => {
          database
            .prepare(
              "DELETE FROM timetable_entries WHERE section_id IN (SELECT id FROM sections WHERE class_id=?)",
            )
            .run(id);
          database
            .prepare(
              "DELETE FROM section_students WHERE section_id IN (SELECT id FROM sections WHERE class_id=?)",
            )
            .run(id);
          database.prepare("DELETE FROM sections WHERE class_id=?").run(id);
          database.prepare("DELETE FROM classes WHERE id=?").run(id);
        })();
      } else {
        const body = classBody.partial().parse(request.body);
        database
          .prepare("UPDATE classes SET name=?,grade_level=? WHERE id=?")
          .run(
            body.name ?? current.name,
            body.grade_level === undefined
              ? current.grade_level
              : body.grade_level,
            id,
          );
      }
      this.audit(
        database,
        actor,
        remove ? "class.delete" : "class.update",
        "class",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private sections(): ApiResponse {
    return this.withDatabase((database) => {
      const sections = database
        .prepare(
          `SELECT s.id,s.class_id,s.name,s.teacher_id,s.capacity,s.room_id,
        c.name class_name,trim(coalesce(st.first_name,'')||' '||coalesce(st.last_name,'')) teacher,r.name room
        FROM sections s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN staff st ON st.id=s.teacher_id
        LEFT JOIN classrooms r ON r.id=s.room_id ORDER BY c.name,s.name`,
        )
        .all();
      return this.ok({ sections, total: sections.length });
    });
  }

  private createSection(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = sectionBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "INSERT INTO sections(class_id,name,teacher_id,capacity,room_id) VALUES(?,?,?,?,?)",
        )
        .run(
          body.class_id,
          body.name,
          body.teacher_id ?? null,
          body.capacity ?? null,
          body.room_id ?? null,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "section.create", "section", id);
      return this.created({ ok: true, id });
    });
  }

  private changeSection(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT * FROM sections WHERE id=?")
        .get(id) as Record<string, unknown> | undefined;
      if (!current) return this.response(404, { error: "section not found" });
      if (remove) {
        database.transaction(() => {
          database
            .prepare("DELETE FROM timetable_entries WHERE section_id=?")
            .run(id);
          database
            .prepare("DELETE FROM section_students WHERE section_id=?")
            .run(id);
          database.prepare("DELETE FROM sections WHERE id=?").run(id);
        })();
      } else {
        const body = sectionBody
          .omit({ class_id: true })
          .partial()
          .parse(request.body);
        const value = (key: keyof typeof body) =>
          body[key] === undefined ? current[key] : body[key];
        database
          .prepare(
            "UPDATE sections SET name=?,teacher_id=?,capacity=?,room_id=? WHERE id=?",
          )
          .run(
            value("name"),
            value("teacher_id"),
            value("capacity"),
            value("room_id"),
            id,
          );
      }
      this.audit(
        database,
        actor,
        remove ? "section.delete" : "section.update",
        "section",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private sectionStudents(url: URL): ApiResponse {
    const sectionId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("section_id"));
    return this.withDatabase((database) => {
      const students = database
        .prepare(
          `SELECT s.id,s.first_name,s.last_name,s.email,s.gender,ss.enrolled_date
        FROM section_students ss JOIN students s ON s.id=ss.student_id WHERE ss.section_id=? ORDER BY s.first_name,s.last_name`,
        )
        .all(sectionId);
      return this.ok({ students, total: students.length });
    });
  }

  private changeRoster(request: ApiRequest, remove: boolean): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = rosterBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      if (remove)
        database
          .prepare(
            "DELETE FROM section_students WHERE section_id=? AND student_id=?",
          )
          .run(body.section_id, body.student_id);
      else
        database
          .prepare(
            `INSERT INTO section_students(section_id,student_id,enrolled_date) VALUES(?,?,date('now')) ON CONFLICT(section_id,student_id) DO NOTHING`,
          )
          .run(body.section_id, body.student_id);
      database
        .prepare(
          remove
            ? "UPDATE students SET enrolled=CASE WHEN EXISTS(SELECT 1 FROM section_students WHERE student_id=?) THEN 1 ELSE 0 END WHERE id=?"
            : "UPDATE students SET enrolled=1 WHERE id=?",
        )
        .run(...(remove ? [body.student_id, body.student_id] : [body.student_id]));
      this.audit(
        database,
        actor,
        remove ? "section.student.remove" : "section.student.enroll",
        "students",
        body.student_id,
      );
      return this.ok({ ok: true });
    });
  }

  private yearWithTerms(
    database: Database.Database,
    id: number,
  ): Record<string, unknown> | null {
    const year = database
      .prepare(
        "SELECT id,label,start_date,end_date,is_active,is_closed FROM academic_years WHERE id=?",
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!year) return null;
    year.is_active = Number(year.is_active) === 1;
    year.is_closed = Number(year.is_closed) === 1;
    year.terms = (
      database
        .prepare(
          "SELECT id,year_id,label,start_date,end_date,is_active FROM terms WHERE year_id=? ORDER BY start_date,id",
        )
        .all(id) as Array<Record<string, unknown>>
    ).map((term) => ({ ...term, is_active: Number(term.is_active) === 1 }));
    return year;
  }

  private academicYears(): ApiResponse {
    return this.withDatabase((database) => {
      const ids = database
        .prepare(
          "SELECT id FROM academic_years ORDER BY start_date DESC,id DESC",
        )
        .pluck()
        .all() as number[];
      const years = ids
        .map((id) => this.yearWithTerms(database, id))
        .filter(Boolean);
      return this.ok({ years, total: years.length });
    });
  }

  private activeAcademicYear(): ApiResponse {
    return this.withDatabase((database) => {
      const id = database
        .prepare("SELECT id FROM academic_years WHERE is_active=1 LIMIT 1")
        .pluck()
        .get() as number | undefined;
      return this.ok({
        year: id === undefined ? null : this.yearWithTerms(database, id),
      });
    });
  }

  private createAcademicYear(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = yearBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "INSERT INTO academic_years(label,start_date,end_date,is_active,is_closed) VALUES(?,?,?,0,0)",
        )
        .run(body.label, body.start_date ?? null, body.end_date ?? null);
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "academic_year.create", "academic_year", id);
      return this.created({ ok: true, id });
    });
  }

  private changeAcademicYear(
    request: ApiRequest,
    action: "activate" | "close",
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const { id } = idBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const year = database
        .prepare("SELECT is_closed FROM academic_years WHERE id=?")
        .get(id) as { is_closed: number } | undefined;
      if (!year)
        return this.response(404, { error: "academic year not found" });
      if (action === "activate" && year.is_closed)
        return this.response(409, {
          error: "Cannot activate a closed academic year",
        });
      if (action === "activate")
        database.transaction(() => {
          database.prepare("UPDATE academic_years SET is_active=0").run();
          database
            .prepare("UPDATE academic_years SET is_active=1 WHERE id=?")
            .run(id);
        })();
      else
        database
          .prepare(
            "UPDATE academic_years SET is_closed=1,is_active=0 WHERE id=?",
          )
          .run(id);
      this.audit(
        database,
        actor,
        `academic_year.${action}`,
        "academic_year",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private createTerm(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = termBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "INSERT INTO terms(year_id,label,start_date,end_date,is_active) VALUES(?,?,?,?,0)",
        )
        .run(
          body.year_id,
          body.label,
          body.start_date ?? null,
          body.end_date ?? null,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "term.create", "term", id);
      return this.created({ ok: true, id });
    });
  }

  private changeTerm(
    request: ApiRequest,
    action: "activate" | "delete",
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const { id } = idBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const term = database
        .prepare("SELECT year_id FROM terms WHERE id=?")
        .get(id) as { year_id: number } | undefined;
      if (!term) return this.response(404, { error: "term not found" });
      if (action === "delete")
        database.prepare("DELETE FROM terms WHERE id=?").run(id);
      else
        database.transaction(() => {
          database
            .prepare("UPDATE terms SET is_active=0 WHERE year_id=?")
            .run(term.year_id);
          database.prepare("UPDATE terms SET is_active=1 WHERE id=?").run(id);
        })();
      this.audit(database, actor, `term.${action}`, "term", id);
      return this.ok({ ok: true });
    });
  }

  private timetable(url: URL): ApiResponse {
    const sectionId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("section_id"));
    return this.withDatabase((database) => {
      const entries = database
        .prepare(
          `SELECT te.id,te.section_id,te.period_id,te.day_of_week,te.subject_id,
        subj.name subject_name,subj.code subject_code,subj.type subject_type,te.staff_id,
        CASE WHEN st.id IS NULL THEN NULL ELSE trim(COALESCE(st.first_name,'') || ' ' || COALESCE(st.last_name,'')) END teacher_name,
        te.room_id,r.name room_name FROM timetable_entries te LEFT JOIN subjects subj ON subj.id=te.subject_id
        LEFT JOIN staff st ON st.id=te.staff_id LEFT JOIN classrooms r ON r.id=te.room_id
        WHERE te.section_id=? ORDER BY te.day_of_week,te.period_id`,
        )
        .all(sectionId);
      return this.ok({ entries, total: entries.length });
    });
  }

  private setTimetable(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = timetableBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      if (body.staff_id !== null) {
        const conflict = database
          .prepare(
            `SELECT sec.name section_name,c.name class_name FROM timetable_entries te
          JOIN sections sec ON sec.id=te.section_id LEFT JOIN classes c ON c.id=sec.class_id
          WHERE te.staff_id=? AND te.period_id=? AND te.day_of_week=? AND te.section_id!=? LIMIT 1`,
          )
          .get(
            body.staff_id,
            body.period_id,
            body.day_of_week,
            body.section_id,
          ) as { section_name: string; class_name: string } | undefined;
        if (conflict)
          return this.response(409, {
            error: "teacher_conflict",
            message: `Teacher already assigned in this slot (${conflict.class_name} – Sec ${conflict.section_name})`,
          });
      }
      if (body.room_id !== null) {
        const conflict = database
          .prepare(
            `SELECT 1 FROM timetable_entries WHERE room_id=? AND period_id=? AND day_of_week=? AND section_id!=? LIMIT 1`,
          )
          .get(body.room_id, body.period_id, body.day_of_week, body.section_id);
        if (conflict)
          return this.response(409, {
            error: "room_conflict",
            message: "Room already booked for this slot by another section",
          });
      }
      database
        .prepare(
          `INSERT INTO timetable_entries(section_id,period_id,day_of_week,subject_id,staff_id,room_id) VALUES(?,?,?,?,?,?)
        ON CONFLICT(section_id,period_id,day_of_week) DO UPDATE SET subject_id=excluded.subject_id,staff_id=excluded.staff_id,room_id=excluded.room_id`,
        )
        .run(
          body.section_id,
          body.period_id,
          body.day_of_week,
          body.subject_id,
          body.staff_id,
          body.room_id,
        );
      this.audit(database, actor, "timetable.set", "section", body.section_id);
      return this.ok({ ok: true });
    });
  }

  private clearTimetable(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = timetableKeyBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      database
        .prepare(
          "DELETE FROM timetable_entries WHERE section_id=? AND period_id=? AND day_of_week=?",
        )
        .run(body.section_id, body.period_id, body.day_of_week);
      this.audit(
        database,
        actor,
        "timetable.clear",
        "section",
        body.section_id,
      );
      return this.ok({ ok: true });
    });
  }

  private timetableQuota(url: URL): ApiResponse {
    const sectionId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("section_id"));
    return this.withDatabase((database) => {
      const subjects = (
        database
          .prepare(
            `SELECT s.id,s.name,s.code,COALESCE(s.weekly_periods,0) target,
        (SELECT COUNT(*) FROM timetable_entries te WHERE te.subject_id=s.id AND te.section_id=?) scheduled
        FROM subjects s WHERE s.weekly_periods>0 ORDER BY s.name`,
          )
          .all(sectionId) as Array<Record<string, unknown>>
      ).map((row) => ({
        ...row,
        status:
          Number(row.scheduled) === Number(row.target)
            ? "met"
            : Number(row.scheduled) < Number(row.target)
              ? "under"
              : "over",
      }));
      return this.ok({ subjects, total: subjects.length });
    });
  }

  private teacherLoad(): ApiResponse {
    return this.withDatabase((database) => {
      const teachers = (
        database
          .prepare(
            `SELECT te.staff_id,trim(COALESCE(st.first_name,'') || ' ' || COALESCE(st.last_name,'')) teacher_name,COUNT(*) total_periods
        FROM timetable_entries te JOIN staff st ON st.id=te.staff_id WHERE te.staff_id IS NOT NULL GROUP BY te.staff_id ORDER BY total_periods DESC,st.first_name`,
          )
          .all() as Array<Record<string, unknown>>
      ).map((teacher) => ({
        ...teacher,
        sections: database
          .prepare(
            `SELECT c.name || ' – Sec ' || sec.name section,COUNT(*) periods
          FROM timetable_entries te JOIN sections sec ON sec.id=te.section_id JOIN classes c ON c.id=sec.class_id
          WHERE te.staff_id=? GROUP BY te.section_id ORDER BY periods DESC`,
          )
          .all(teacher.staff_id),
      }));
      return this.ok({ teachers, total: teachers.length });
    });
  }

  private periods(): ApiResponse {
    return this.withDatabase((database) => {
      const periods = database
        .prepare(
          "SELECT id,label,period_type,start_time,end_time,sort_order FROM periods ORDER BY sort_order",
        )
        .all();
      return this.ok({ periods, total: periods.length });
    });
  }

  private savePeriods(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const { periods } = periodsBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      database.transaction(() => {
        database.prepare("DELETE FROM timetable_entries").run();
        database.prepare("DELETE FROM periods").run();
        const insert = database.prepare(
          "INSERT INTO periods(label,period_type,start_time,end_time,sort_order) VALUES(?,?,?,?,?)",
        );
        periods.forEach((period, index) =>
          insert.run(
            period.label,
            period.period_type,
            period.start_time,
            period.end_time,
            index,
          ),
        );
      })();
      this.audit(
        database,
        actor,
        "periods.replace",
        "periods",
        undefined,
        JSON.stringify({ count: periods.length }),
      );
      return this.ok({ ok: true });
    });
  }

  private teacherSubjects(): ApiResponse {
    return this.withDatabase((database) => {
      const subjects = (
        database
          .prepare(
            "SELECT id,name,code,type,weekly_periods FROM subjects ORDER BY name",
          )
          .all() as Array<Record<string, unknown>>
      ).map((subject) => ({
        ...subject,
        assignments: database
          .prepare(
            `SELECT ts.id,ts.staff_id,ts.priority,trim(COALESCE(st.first_name,'') || ' ' || COALESCE(st.last_name,'')) teacher
          FROM teacher_subjects ts JOIN staff st ON st.id=ts.staff_id WHERE ts.subject_id=? ORDER BY ts.priority`,
          )
          .all(subject.id),
      }));
      return this.ok({ subjects, total: subjects.length });
    });
  }

  private assignTeacherSubject(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = teacherSubjectBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const count = Number(
        database
          .prepare(
            "SELECT COUNT(*) FROM teacher_subjects WHERE subject_id=? AND staff_id!=?",
          )
          .pluck()
          .get(body.subject_id, body.staff_id),
      );
      if (count >= 3)
        return this.response(422, { error: "Maximum 3 teachers per subject" });
      database
        .prepare(
          `INSERT INTO teacher_subjects(staff_id,subject_id,priority) VALUES(?,?,?) ON CONFLICT(staff_id,subject_id) DO UPDATE SET priority=excluded.priority`,
        )
        .run(body.staff_id, body.subject_id, body.priority);
      const id = Number(
        database
          .prepare(
            "SELECT id FROM teacher_subjects WHERE staff_id=? AND subject_id=?",
          )
          .pluck()
          .get(body.staff_id, body.subject_id),
      );
      this.audit(
        database,
        actor,
        "teacher_subject.assign",
        "teacher_subject",
        id,
      );
      return this.ok({ ok: true, id });
    });
  }

  private removeTeacherSubject(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const { id } = idBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      database.prepare("DELETE FROM teacher_subjects WHERE id=?").run(id);
      this.audit(
        database,
        actor,
        "teacher_subject.remove",
        "teacher_subject",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private floorPlan(): ApiResponse {
    return this.withDatabase((database) => {
      const plan = database
        .prepare("SELECT id,name,data FROM floorplans ORDER BY id LIMIT 1")
        .get() as
        | { id: number; name: string | null; data: string | null }
        | undefined;
      return this.ok({
        plan: plan
          ? { ...plan, data: plan.data ? JSON.parse(plan.data) : null }
          : null,
      });
    });
  }

  private saveFloorPlan(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = floorPlanBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const existing = database
        .prepare("SELECT id FROM floorplans ORDER BY id LIMIT 1")
        .pluck()
        .get() as number | undefined;
      const data = JSON.stringify(body.data);
      let id: number;
      if (existing === undefined)
        id = Number(
          database
            .prepare("INSERT INTO floorplans(name,data) VALUES(?,?)")
            .run(body.name ?? "Floor Plan", data).lastInsertRowid,
        );
      else {
        id = existing;
        database
          .prepare("UPDATE floorplans SET name=?,data=? WHERE id=?")
          .run(body.name ?? "Floor Plan", data, id);
      }
      this.audit(database, actor, "floorplan.save", "floorplan", id);
      return this.ok({ ok: true, id });
    });
  }

  private facultyPlans(request: ApiRequest, url: URL): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 4);
    const period = url.searchParams.get("period_type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return this.withDatabase((database) => {
      const plans = database
        .prepare(
          `SELECT fp.*,s.name subject_name,
        CASE WHEN sec.id IS NULL THEN NULL ELSE c.name || ' – ' || sec.name END section_name,u.name faculty_name
        FROM faculty_plans fp LEFT JOIN subjects s ON s.id=fp.subject_id LEFT JOIN sections sec ON sec.id=fp.section_id
        LEFT JOIN classes c ON c.id=sec.class_id LEFT JOIN users u ON u.id=fp.created_by
        WHERE fp.created_by=? AND (? IS NULL OR fp.period_type=?) AND (? IS NULL OR fp.end_date>=?) AND (? IS NULL OR fp.start_date<=?)
        ORDER BY fp.start_date DESC,fp.id DESC`,
        )
        .all(actor, period, period, from, from, to, to);
      return this.ok({ plans, total: plans.length });
    });
  }

  private createFacultyPlan(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 4);
    const body = facultyPlanBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          `INSERT INTO faculty_plans(period_type,title,start_date,end_date,section_id,subject_id,lessons,activities,schedule,objectives,resources,assessment,notes,status,created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          body.period_type,
          body.title,
          body.start_date,
          body.end_date,
          body.section_id ?? null,
          body.subject_id ?? null,
          body.lessons ?? null,
          body.activities ?? null,
          body.schedule ?? null,
          body.objectives ?? null,
          body.resources ?? null,
          body.assessment ?? null,
          body.notes ?? null,
          body.status ?? "draft",
          actor,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "faculty_plan.create", "faculty_plan", id);
      return this.created({ ok: true, id });
    });
  }

  private changeFacultyPlan(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 4);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT * FROM faculty_plans WHERE id=? AND created_by=?")
        .get(id, actor) as Record<string, unknown> | undefined;
      if (!current)
        return this.response(404, { error: "faculty plan not found" });
      if (remove)
        database
          .prepare("DELETE FROM faculty_plans WHERE id=? AND created_by=?")
          .run(id, actor);
      else {
        const body = facultyPlanBase.partial().parse(request.body);
        const keys = Object.keys(body);
        const start = String(body.start_date ?? current.start_date);
        const end = String(body.end_date ?? current.end_date);
        if (end < start)
          return this.response(422, {
            error: "end_date must be on or after start_date",
          });
        if (keys.length)
          database
            .prepare(
              `UPDATE faculty_plans SET ${keys.map((key) => `${key}=?`).join(",")},updated_at=datetime('now') WHERE id=? AND created_by=?`,
            )
            .run(
              ...keys.map(
                (key) => (body as Record<string, unknown>)[key] ?? null,
              ),
              id,
              actor,
            );
      }
      this.audit(
        database,
        actor,
        remove ? "faculty_plan.delete" : "faculty_plan.update",
        "faculty_plan",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private attendance(url: URL): ApiResponse {
    const sectionId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("section_id"));
    const date = z.string().min(1).parse(url.searchParams.get("date"));
    const periodId = z
      .string()
      .regex(/^-?\d+$/)
      .transform(Number)
      .parse(url.searchParams.get("period_id"));
    return this.withDatabase((database) => {
      const students = database
        .prepare(
          `SELECT s.id student_id,s.first_name,s.last_name,COALESCE(sa.status,'unmarked') status,sa.note
        FROM section_students ss JOIN students s ON s.id=ss.student_id LEFT JOIN student_attendance sa
        ON sa.student_id=ss.student_id AND sa.date=? AND sa.period_id=? WHERE ss.section_id=? ORDER BY s.first_name,s.last_name`,
        )
        .all(date, periodId, sectionId);
      return this.ok({
        students,
        section_id: sectionId,
        date,
        period_id: periodId,
      });
    });
  }

  private timetableDay(url: URL): ApiResponse {
    const day = z.coerce
      .number()
      .int()
      .min(0)
      .max(6)
      .parse(url.searchParams.get("day") ?? 0);
    return this.withDatabase((database) => {
      const entries = database
        .prepare(
          `SELECT te.id,te.section_id,
        trim(coalesce(c.name,'')||' — '||coalesce(sec.name,'')) section_label,
        te.period_id,p.label period_label,p.start_time,p.end_time,p.sort_order,
        subj.name subject_name,subj.code subject_code,
        trim(coalesce(st.first_name,'')||' '||coalesce(st.last_name,'')) teacher_name,
        te.room_id,r.name room_name
        FROM timetable_entries te
        LEFT JOIN sections sec ON sec.id=te.section_id LEFT JOIN classes c ON c.id=sec.class_id
        LEFT JOIN periods p ON p.id=te.period_id LEFT JOIN subjects subj ON subj.id=te.subject_id
        LEFT JOIN staff st ON st.id=te.staff_id LEFT JOIN classrooms r ON r.id=te.room_id
        WHERE te.day_of_week=? ORDER BY p.sort_order,p.start_time,sec.name`,
        )
        .all(day);
      return this.ok({ entries, total: entries.length, day });
    });
  }

  private markAttendance(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 4);
    const body = attendanceMarkBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const valid = new Set(
        database
          .prepare("SELECT student_id FROM section_students WHERE section_id=?")
          .pluck()
          .all(body.section_id) as number[],
      );
      const invalid = body.records.find(
        (record) => !valid.has(record.student_id),
      );
      if (invalid)
        return this.response(422, {
          error: `student ${invalid.student_id} is not enrolled in this section`,
        });
      const upsert =
        database.prepare(`INSERT INTO student_attendance(student_id,section_id,date,period_id,status,marked_by,note) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(student_id,date,period_id) DO UPDATE SET section_id=excluded.section_id,status=excluded.status,marked_by=excluded.marked_by,note=excluded.note,marked_at=datetime('now')`);
      database.transaction(() => {
        for (const record of body.records)
          upsert.run(
            record.student_id,
            body.section_id,
            body.date,
            body.period_id,
            record.status,
            actor,
            record.note ?? null,
          );
      })();
      this.audit(
        database,
        actor,
        "attendance.mark",
        "section",
        body.section_id,
        JSON.stringify({
          date: body.date,
          period_id: body.period_id,
          saved: body.records.length,
        }),
      );
      return this.ok({ ok: true, saved: body.records.length });
    });
  }

  private attendanceSummary(url: URL): ApiResponse {
    const sectionId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("section_id"));
    const from = url.searchParams.get("from") ?? "1900-01-01";
    const to = url.searchParams.get("to") ?? "2099-12-31";
    if (to < from)
      return this.response(422, { error: "to must be on or after from" });
    return this.withDatabase((database) => {
      const summary = (
        database
          .prepare(
            `SELECT ss.student_id,s.first_name,s.last_name,
        COUNT(CASE WHEN sa.status='present' THEN 1 END) present_days,COUNT(CASE WHEN sa.status='absent' THEN 1 END) absent_days,
        COUNT(CASE WHEN sa.status='late' THEN 1 END) late_days,COUNT(CASE WHEN sa.status='excused' THEN 1 END) excused_days,COUNT(sa.id) total_marked
        FROM section_students ss JOIN students s ON s.id=ss.student_id LEFT JOIN student_attendance sa
        ON sa.student_id=ss.student_id AND sa.section_id=ss.section_id AND sa.date>=? AND sa.date<=?
        WHERE ss.section_id=? GROUP BY ss.student_id,s.first_name,s.last_name ORDER BY s.first_name,s.last_name`,
          )
          .all(from, to, sectionId) as Array<Record<string, unknown>>
      ).map((row) => ({
        ...row,
        attendance_pct: Number(row.total_marked)
          ? Math.round(
              ((Number(row.present_days) + Number(row.late_days)) /
                Number(row.total_marked)) *
                100 *
                10,
            ) / 10
          : 0,
      }));
      return this.ok({ summary, section_id: sectionId, from, to });
    });
  }

  private attendanceAlerts(): ApiResponse {
    return this.withDatabase((database) => {
      const alerts = (
        database
          .prepare(
            `SELECT s.id student_id,s.first_name,s.last_name,sec.id section_id,sec.name section_name,c.name class_name,
        COUNT(CASE WHEN sa.status IN ('present','late') THEN 1 END) attended,COUNT(sa.id) total
        FROM section_students ss JOIN students s ON s.id=ss.student_id JOIN sections sec ON sec.id=ss.section_id JOIN classes c ON c.id=sec.class_id
        LEFT JOIN student_attendance sa ON sa.student_id=ss.student_id AND sa.section_id=ss.section_id GROUP BY s.id,ss.section_id
        HAVING COUNT(sa.id)>5 AND CAST(COUNT(CASE WHEN sa.status IN ('present','late') THEN 1 END) AS REAL)/COUNT(sa.id)<0.75
        ORDER BY CAST(COUNT(CASE WHEN sa.status IN ('present','late') THEN 1 END) AS REAL)/COUNT(sa.id) LIMIT 50`,
          )
          .all() as Array<Record<string, unknown>>
      ).map((row) => ({
        ...row,
        attendance_pct:
          Math.round((Number(row.attended) / Number(row.total)) * 100 * 10) /
          10,
      }));
      return this.ok({ alerts, total: alerts.length });
    });
  }

  private warnAttendance(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 3);
    const body = attendanceWarnBody.parse(request.body);
    const message =
      body.attendance_pct === undefined
        ? "Attendance is below the 75% required for board-exam eligibility. Please ensure regular attendance."
        : `Attendance is ${body.attendance_pct}%, below the 75% required for board-exam eligibility. Please ensure regular attendance.`;
    return this.withWriteDatabase((database) => {
      const exists = database
        .prepare("SELECT 1 FROM students WHERE id=?")
        .get(body.student_id);
      if (!exists) return this.response(404, { error: "student not found" });
      database
        .prepare(
          `INSERT INTO student_communications(student_id,channel,direction,subject,body) VALUES(?,'Circular','Outgoing','Attendance shortage — board eligibility',?)`,
        )
        .run(body.student_id, message);
      this.audit(
        database,
        actor,
        "attendance.warn",
        "student",
        body.student_id,
        JSON.stringify({
          attendance_pct: body.attendance_pct ?? null,
          rule: "CBSE 75%",
        }),
      );
      return this.ok({ ok: true });
    });
  }

  private exams(url: URL): ApiResponse {
    const year = url.searchParams.get("year_id");
    return this.withDatabase((database) => {
      const exams = database
        .prepare(
          `SELECT id,name,exam_type,academic_year_id,term_id,start_date,end_date,created_at FROM exams WHERE (? IS NULL OR academic_year_id=?) ORDER BY start_date DESC,name`,
        )
        .all(year, year);
      return this.ok({ exams, total: exams.length });
    });
  }

  private createExam(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = examBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "INSERT INTO exams(name,exam_type,academic_year_id,term_id,start_date,end_date) VALUES(?,?,?,?,?,?)",
        )
        .run(
          body.name,
          body.exam_type ?? "unit",
          body.academic_year_id ?? null,
          body.term_id ?? null,
          body.start_date ?? null,
          body.end_date ?? null,
        );
      const id = Number(result.lastInsertRowid);
      this.audit(database, actor, "exam.create", "exam", id);
      return this.created({ ok: true, id });
    });
  }

  private changeExam(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((database) => {
      const current = database
        .prepare("SELECT * FROM exams WHERE id=?")
        .get(id) as Record<string, unknown> | undefined;
      if (!current) return this.response(404, { error: "exam not found" });
      if (remove)
        database.transaction(() => {
          database.prepare("DELETE FROM exam_marks WHERE exam_id=?").run(id);
          database
            .prepare("DELETE FROM exam_schedules WHERE exam_id=?")
            .run(id);
          database.prepare("DELETE FROM exams WHERE id=?").run(id);
        })();
      else {
        const body = examBody.partial().parse(request.body);
        const value = (key: keyof typeof body) =>
          body[key] === undefined ? current[key] : body[key];
        database
          .prepare(
            "UPDATE exams SET name=?,exam_type=?,academic_year_id=?,term_id=?,start_date=?,end_date=? WHERE id=?",
          )
          .run(
            value("name"),
            value("exam_type"),
            value("academic_year_id"),
            value("term_id"),
            value("start_date"),
            value("end_date"),
            id,
          );
      }
      this.audit(
        database,
        actor,
        remove ? "exam.delete" : "exam.update",
        "exam",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private examSchedules(url: URL): ApiResponse {
    const examId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("exam_id"));
    return this.withDatabase((database) => {
      const schedules = database
        .prepare(
          `SELECT es.id,es.exam_id,es.subject_id,subj.name subject_name,subj.code subject_code,es.section_id,sec.name section_name,c.name class_name,es.date,es.start_time,es.end_time,es.room_id,r.name room_name,es.invigilator_id,CASE WHEN st.id IS NULL THEN NULL ELSE trim(COALESCE(st.first_name,'') || ' ' || COALESCE(st.last_name,'')) END invigilator_name FROM exam_schedules es LEFT JOIN subjects subj ON subj.id=es.subject_id LEFT JOIN sections sec ON sec.id=es.section_id LEFT JOIN classes c ON c.id=sec.class_id LEFT JOIN classrooms r ON r.id=es.room_id LEFT JOIN staff st ON st.id=es.invigilator_id WHERE es.exam_id=? ORDER BY es.date,es.start_time,subj.name`,
        )
        .all(examId);
      return this.ok({ schedules, total: schedules.length });
    });
  }

  private saveExamSchedule(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = examScheduleBody.parse(request.body);
    return this.withWriteDatabase((database) => {
      database
        .prepare(
          `INSERT INTO exam_schedules(exam_id,subject_id,section_id,date,start_time,end_time,room_id,invigilator_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(exam_id,subject_id,section_id) DO UPDATE SET date=excluded.date,start_time=excluded.start_time,end_time=excluded.end_time,room_id=excluded.room_id,invigilator_id=excluded.invigilator_id`,
        )
        .run(
          body.exam_id,
          body.subject_id,
          body.section_id,
          body.date,
          body.start_time,
          body.end_time,
          body.room_id,
          body.invigilator_id,
        );
      this.audit(database, actor, "exam.schedule", "exam", body.exam_id);
      return this.ok({ ok: true });
    });
  }

  private examMarks(url: URL): ApiResponse {
    const examId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("exam_id"));
    const subject = url.searchParams.get("subject_id");
    return this.withDatabase((database) => {
      const marks = subject
        ? database
            .prepare(
              `SELECT em.id,? exam_id,s.id student_id,s.first_name,s.last_name,subj.id subject_id,subj.name subject_name,subj.code subject_code,em.marks_obtained,COALESCE(em.max_marks,100) max_marks,em.grade,em.remarks FROM students s JOIN section_students ss ON ss.student_id=s.id JOIN exam_schedules es ON es.section_id=ss.section_id AND es.exam_id=? AND es.subject_id=? JOIN subjects subj ON subj.id=? LEFT JOIN exam_marks em ON em.exam_id=? AND em.student_id=s.id AND em.subject_id=? GROUP BY s.id ORDER BY s.first_name,s.last_name`,
            )
            .all(examId, examId, subject, subject, examId, subject)
        : database
            .prepare(
              `SELECT em.id,em.exam_id,em.student_id,s.first_name,s.last_name,em.subject_id,subj.name subject_name,subj.code subject_code,em.marks_obtained,em.max_marks,em.grade,em.remarks FROM exam_marks em JOIN students s ON s.id=em.student_id LEFT JOIN subjects subj ON subj.id=em.subject_id WHERE em.exam_id=? ORDER BY s.first_name,s.last_name`,
            )
            .all(examId);
      return this.ok({ marks, total: marks.length });
    });
  }

  private saveExamMarks(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const body = examMarksBody.parse(request.body);
    const excessive = body.records.find(
      (record) =>
        record.marks_obtained !== null &&
        record.marks_obtained > record.max_marks,
    );
    if (excessive)
      return this.response(422, {
        error: `marks_obtained cannot exceed max_marks for student ${excessive.student_id}`,
      });
    return this.withWriteDatabase((database) => {
      const upsert = database.prepare(
        `INSERT INTO exam_marks(exam_id,student_id,subject_id,marks_obtained,max_marks,grade,remarks) VALUES(?,?,?,?,?,?,?) ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET marks_obtained=excluded.marks_obtained,max_marks=excluded.max_marks,grade=excluded.grade,remarks=excluded.remarks`,
      );
      database.transaction(() => {
        for (const row of body.records)
          upsert.run(
            body.exam_id,
            row.student_id,
            row.subject_id,
            row.marks_obtained,
            row.max_marks,
            row.grade ?? null,
            row.remarks ?? null,
          );
      })();
      this.audit(
        database,
        actor,
        "exam.marks.save",
        "exam",
        body.exam_id,
        JSON.stringify({ saved: body.records.length }),
      );
      return this.ok({ ok: true, saved: body.records.length });
    });
  }

  private examMarksReport(url: URL): ApiResponse {
    const examId = z.coerce
      .number()
      .int()
      .positive()
      .parse(url.searchParams.get("exam_id"));
    const section = url.searchParams.get("section_id");
    return this.withDatabase((database) => {
      const report = (
        database
          .prepare(
            `SELECT em.student_id,s.first_name,s.last_name,SUM(em.marks_obtained) total_obtained,SUM(em.max_marks) total_max,COUNT(em.id) subjects_count FROM exam_marks em JOIN students s ON s.id=em.student_id WHERE em.exam_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM section_students ss WHERE ss.student_id=em.student_id AND ss.section_id=?)) GROUP BY em.student_id,s.first_name,s.last_name ORDER BY CASE WHEN SUM(em.max_marks)>0 THEN SUM(em.marks_obtained)/SUM(em.max_marks) ELSE 0 END DESC`,
          )
          .all(examId, section, section) as Array<Record<string, unknown>>
      ).map((row) => ({
        ...row,
        percentage: Number(row.total_max)
          ? Math.round(
              (Number(row.total_obtained) / Number(row.total_max)) * 100 * 10,
            ) / 10
          : 0,
      }));
      return this.ok({ report, total: report.length });
    });
  }

  private examArchives(url: URL): ApiResponse {
    const year = url.searchParams.get("year");
    return this.withDatabase((database) => {
      const archives = (
        database
          .prepare(
            `SELECT id,academic_year,exam_name,material_type,subject,class_name,retention_until,disposed,disposed_at,notes,CASE WHEN retention_until IS NULL OR retention_until='' THEN NULL ELSE CAST(julianday(retention_until)-julianday('now') AS INTEGER) END days_left,CASE WHEN document IS NULL OR document='' THEN 0 ELSE 1 END has_document FROM exam_archives WHERE (? IS NULL OR academic_year=?) ORDER BY (retention_until IS NULL),retention_until`,
          )
          .all(year, year) as Array<Record<string, unknown>>
      ).map((row) => {
        const disposed = Number(row.disposed) === 1;
        const days = row.days_left === null ? null : Number(row.days_left);
        return {
          ...row,
          disposed,
          has_document: Number(row.has_document) === 1,
          status: disposed
            ? "Disposed"
            : days !== null && days < 0
              ? "Due for disposal"
              : "Retained",
        };
      });
      return this.ok({
        archives,
        total: archives.length,
        due: archives.filter((row) => row.status === "Due for disposal").length,
      });
    });
  }
  private examArchive(id: number): ApiResponse {
    return this.withDatabase((database) => {
      const archive = database
        .prepare("SELECT id,exam_name,document FROM exam_archives WHERE id=?")
        .get(id);
      return archive
        ? this.ok({ archive })
        : this.response(404, { error: "archive not found" });
    });
  }
  private createExamArchive(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const b = archiveBody.parse(request.body);
    return this.withWriteDatabase((d) => {
      const r = d
        .prepare(
          "INSERT INTO exam_archives(academic_year,exam_name,material_type,subject,class_name,document,retention_until,notes) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          b.academic_year,
          b.exam_name,
          b.material_type,
          b.subject || null,
          b.class_name || null,
          b.document || null,
          b.retention_until || null,
          b.notes || null,
        );
      const id = Number(r.lastInsertRowid);
      this.audit(d, actor, "archive.create", "exam_archive", id);
      return this.created({ ok: true, id });
    });
  }
  private changeExamArchive(
    request: ApiRequest,
    id: number,
    dispose: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((d) => {
      const found = d.prepare("SELECT 1 FROM exam_archives WHERE id=?").get(id);
      if (!found) return this.response(404, { error: "archive not found" });
      if (dispose)
        d.prepare(
          "UPDATE exam_archives SET disposed=1,disposed_at=datetime('now'),document=NULL WHERE id=?",
        ).run(id);
      else d.prepare("DELETE FROM exam_archives WHERE id=?").run(id);
      this.audit(
        d,
        actor,
        dispose ? "archive.dispose" : "archive.delete",
        "exam_archive",
        id,
      );
      return this.ok({ ok: true });
    });
  }

  private practicalExams(): ApiResponse {
    return this.withDatabase((d) => {
      const exams = (
        d
          .prepare(
            `SELECT p.id,p.subject,p.class_name,p.exam_date,p.batch,p.internal_examiner,p.external_examiner,p.lab,p.max_marks,p.marks_locked,p.locked_at,p.geo,CASE WHEN p.evidence IS NULL OR p.evidence='' THEN 0 ELSE 1 END has_evidence,(SELECT COUNT(*) FROM practical_marks pm WHERE pm.practical_exam_id=p.id) marks_count FROM practical_exams p ORDER BY p.exam_date DESC,p.id DESC`,
          )
          .all() as Array<Record<string, unknown>>
      ).map((r) => ({
        ...r,
        marks_locked: Number(r.marks_locked) === 1,
        has_evidence: Number(r.has_evidence) === 1,
        status:
          Number(r.marks_locked) === 1
            ? "Locked"
            : Number(r.marks_count) > 0
              ? "Marks uploaded"
              : "Scheduled",
      }));
      return this.ok({ exams, total: exams.length });
    });
  }
  private practicalExam(id: number): ApiResponse {
    return this.withDatabase((d) => {
      const exam = d
        .prepare(
          "SELECT id,subject,class_name,exam_date,batch,internal_examiner,external_examiner,lab,max_marks,marks_locked,locked_at,geo,evidence,notes FROM practical_exams WHERE id=?",
        )
        .get(id) as Record<string, unknown> | undefined;
      if (!exam)
        return this.response(404, { error: "practical exam not found" });
      const marks = d
        .prepare(
          "SELECT id,student_name,marks FROM practical_marks WHERE practical_exam_id=? ORDER BY id",
        )
        .all(id);
      exam.marks_locked = Number(exam.marks_locked) === 1;
      exam.status = exam.marks_locked
        ? "Locked"
        : marks.length
          ? "Marks uploaded"
          : "Scheduled";
      return this.ok({ exam, marks });
    });
  }
  private createPracticalExam(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const b = practicalBody.parse(request.body);
    return this.withWriteDatabase((d) => {
      const r = d
        .prepare(
          "INSERT INTO practical_exams(subject,class_name,exam_date,batch,internal_examiner,external_examiner,lab,max_marks,evidence,geo,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          b.subject,
          b.class_name || null,
          b.exam_date || null,
          b.batch || null,
          b.internal_examiner || null,
          b.external_examiner || null,
          b.lab || null,
          b.max_marks ?? null,
          b.evidence || null,
          b.geo || null,
          b.notes || null,
        );
      const id = Number(r.lastInsertRowid);
      this.audit(d, actor, "practical.create", "practical_exam", id);
      return this.created({ ok: true, id });
    });
  }
  private createPracticalMark(
    request: ApiRequest,
    examId: number,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const b = practicalMarkBody.parse(request.body);
    return this.withWriteDatabase((d) => {
      const exam = d
        .prepare(
          "SELECT marks_locked,max_marks FROM practical_exams WHERE id=?",
        )
        .get(examId) as
        | { marks_locked: number; max_marks: number | null }
        | undefined;
      if (!exam)
        return this.response(404, { error: "practical exam not found" });
      if (exam.marks_locked)
        return this.response(423, {
          error: "marks are locked and cannot be changed",
        });
      if (
        b.marks !== undefined &&
        exam.max_marks !== null &&
        b.marks > exam.max_marks
      )
        return this.response(422, {
          error: "marks cannot exceed maximum marks",
        });
      const r = d
        .prepare(
          "INSERT INTO practical_marks(practical_exam_id,student_name,marks) VALUES(?,?,?)",
        )
        .run(examId, b.student_name, b.marks ?? null);
      const id = Number(r.lastInsertRowid);
      this.audit(d, actor, "practical.mark.create", "practical_exam", examId);
      return this.created({ ok: true, id });
    });
  }
  private deletePracticalMark(
    request: ApiRequest,
    examId: number,
    markId: number,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((d) => {
      const locked =
        Number(
          d
            .prepare("SELECT marks_locked FROM practical_exams WHERE id=?")
            .pluck()
            .get(examId) ?? 0,
        ) === 1;
      if (locked)
        return this.response(423, {
          error: "marks are locked and cannot be changed",
        });
      d.prepare(
        "DELETE FROM practical_marks WHERE id=? AND practical_exam_id=?",
      ).run(markId, examId);
      this.audit(d, actor, "practical.mark.delete", "practical_exam", examId);
      return this.ok({ ok: true });
    });
  }
  private changePracticalExam(
    request: ApiRequest,
    id: number,
    lock: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((d) => {
      const exam = d
        .prepare("SELECT marks_locked FROM practical_exams WHERE id=?")
        .get(id) as { marks_locked: number } | undefined;
      if (!exam)
        return this.response(404, { error: "practical exam not found" });
      if (lock) {
        if (exam.marks_locked)
          return this.response(409, { error: "already locked" });
        d.prepare(
          "UPDATE practical_exams SET marks_locked=1,locked_at=datetime('now') WHERE id=?",
        ).run(id);
      } else
        d.transaction(() => {
          d.prepare(
            "DELETE FROM practical_marks WHERE practical_exam_id=?",
          ).run(id);
          d.prepare("DELETE FROM practical_exams WHERE id=?").run(id);
        })();
      this.audit(
        d,
        actor,
        lock ? "practical.lock" : "practical.delete",
        "practical_exam",
        id,
      );
      return this.ok(lock ? { ok: true, marks_locked: true } : { ok: true });
    });
  }

  private complianceCertificates(url: URL): ApiResponse {
    const scope = url.searchParams.get("scope");
    return this.withDatabase((d) => {
      const certificates = (
        d
          .prepare(
            `SELECT c.id,c.scope,c.staff_id,CASE WHEN st.id IS NULL THEN NULL ELSE trim(COALESCE(st.first_name,'')||' '||COALESCE(st.last_name,'')) END staff_name,c.cert_type,c.authority,c.reference_no,c.issue_date,c.expiry_date,c.notes,CASE WHEN c.expiry_date IS NULL OR c.expiry_date='' THEN NULL ELSE CAST(julianday(c.expiry_date)-julianday('now') AS INTEGER) END days_left,CASE WHEN c.document IS NULL OR c.document='' THEN 0 ELSE 1 END has_document FROM compliance_certificates c LEFT JOIN staff st ON st.id=c.staff_id WHERE (? IS NULL OR c.scope=?) ORDER BY (c.expiry_date IS NULL),c.expiry_date`,
          )
          .all(scope, scope) as Array<Record<string, unknown>>
      ).map((r) => {
        const days = r.days_left === null ? null : Number(r.days_left);
        return {
          ...r,
          has_document: Number(r.has_document) === 1,
          status:
            days === null
              ? "No expiry"
              : days < 0
                ? "Expired"
                : days <= 30
                  ? "Expiring"
                  : "Valid",
        };
      });
      return this.ok({
        certificates,
        total: certificates.length,
        expired: certificates.filter((c) => c.status === "Expired").length,
        expiring: certificates.filter((c) => c.status === "Expiring").length,
      });
    });
  }
  private complianceCertificate(id: number): ApiResponse {
    return this.withDatabase((d) => {
      const certificate = d
        .prepare(
          "SELECT id,cert_type,document FROM compliance_certificates WHERE id=?",
        )
        .get(id);
      return certificate
        ? this.ok({ certificate })
        : this.response(404, { error: "certificate not found" });
    });
  }
  private saveComplianceCertificate(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    const b = complianceBody.parse(request.body);
    return this.withWriteDatabase((d) => {
      const r = d
        .prepare(
          "INSERT INTO compliance_certificates(scope,staff_id,cert_type,authority,reference_no,issue_date,expiry_date,document,notes) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          b.scope,
          b.staff_id ?? null,
          b.cert_type,
          b.authority || null,
          b.reference_no || null,
          b.issue_date || null,
          b.expiry_date || null,
          b.document || null,
          b.notes || null,
        );
      const id = Number(r.lastInsertRowid);
      this.audit(d, actor, "compliance.create", "compliance_certificate", id);
      return this.created({ ok: true, id });
    });
  }
  private changeComplianceCertificate(
    request: ApiRequest,
    id: number,
    remove: boolean,
  ): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 2);
    return this.withWriteDatabase((d) => {
      const found = d
        .prepare("SELECT 1 FROM compliance_certificates WHERE id=?")
        .get(id);
      if (!found) return this.response(404, { error: "certificate not found" });
      if (remove)
        d.prepare("DELETE FROM compliance_certificates WHERE id=?").run(id);
      else {
        const b = complianceBody.parse(request.body);
        d.prepare(
          "UPDATE compliance_certificates SET scope=?,staff_id=?,cert_type=?,authority=?,reference_no=?,issue_date=?,expiry_date=?,notes=? WHERE id=?",
        ).run(
          b.scope,
          b.staff_id ?? null,
          b.cert_type,
          b.authority || null,
          b.reference_no || null,
          b.issue_date || null,
          b.expiry_date || null,
          b.notes || null,
          id,
        );
        if (b.document)
          d.prepare(
            "UPDATE compliance_certificates SET document=? WHERE id=?",
          ).run(b.document, id);
      }
      this.audit(
        d,
        actor,
        remove ? "compliance.delete" : "compliance.update",
        "compliance_certificate",
        id,
      );
      return this.ok({ ok: true, id });
    });
  }

  private portalProfile(request: ApiRequest): ApiResponse {
    const actor = this.auth.requireUserId(request.token);
    return this.withDatabase((database) => {
      const user = database
        .prepare("SELECT id,username,role,name,level FROM users WHERE id=?")
        .get(actor) as Record<string, unknown> | undefined;
      if (!user) return this.response(404, { error: "account not found" });
      const staff =
        database
          .prepare(
            `SELECT st.*, (SELECT COUNT(*) FROM sections sec WHERE sec.teacher_id=st.id) sections_count,
        (SELECT COUNT(*) FROM teacher_subjects ts WHERE ts.staff_id=st.id) subjects_count
        FROM user_staff_links l JOIN staff st ON st.id=l.staff_id WHERE l.user_id=?`,
          )
          .get(actor) ?? null;
      const students = (
        database
          .prepare(
            `SELECT s.*,sec.id section_id,sec.name section_name,c.name class_name,
        (SELECT COUNT(*) FROM student_attendance a WHERE a.student_id=s.id) attendance_total,
        (SELECT COUNT(*) FROM student_attendance a WHERE a.student_id=s.id AND a.status IN ('present','late')) attendance_attended
        FROM user_student_links l JOIN students s ON s.id=l.student_id LEFT JOIN section_students ss ON ss.student_id=s.id
        LEFT JOIN sections sec ON sec.id=ss.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE l.user_id=? ORDER BY s.first_name,s.last_name`,
          )
          .all(actor) as Array<Record<string, unknown>>
      ).map((student) => {
        const total = Number(student.attendance_total);
        const attended = Number(student.attendance_attended);
        return {
          ...student,
          enrolled: Number(student.enrolled) === 1,
          attendance_pct: total
            ? Math.round((attended / total) * 1000) / 10
            : null,
          recent_marks: database
            .prepare(
              "SELECT term,subject,max_marks,marks,grade,remarks FROM student_marks WHERE student_id=? ORDER BY id DESC LIMIT 10",
            )
            .all(student.id),
          communications: database
            .prepare(
              "SELECT id,channel,direction,subject,body,acknowledged,created_at FROM student_communications WHERE student_id=? ORDER BY id DESC LIMIT 10",
            )
            .all(student.id),
        };
      });
      return this.ok({ user, staff, students });
    });
  }

  private portalAccounts(request: ApiRequest): ApiResponse {
    this.auth.requireLevel(request.token, 1);
    return this.withDatabase((database) => {
      const accounts = database
        .prepare(
          `SELECT u.id,u.username,u.role,u.name,u.level,st.id staff_id,
        CASE WHEN st.id IS NULL THEN NULL ELSE trim(COALESCE(st.first_name,'')||' '||COALESCE(st.last_name,'')) END staff_name,
        (SELECT group_concat(trim(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')), ', ') FROM user_student_links usl JOIN students s ON s.id=usl.student_id WHERE usl.user_id=u.id) student_names,
        (SELECT json_group_array(usl.student_id) FROM user_student_links usl WHERE usl.user_id=u.id) student_ids
        FROM users u LEFT JOIN user_staff_links usf ON usf.user_id=u.id LEFT JOIN staff st ON st.id=usf.staff_id
        WHERE u.role IN ('teacher','parent','student') ORDER BY u.role,u.name`,
        )
        .all();
      return this.ok({ accounts, total: accounts.length });
    });
  }

  private async createPortalAccount(request: ApiRequest): Promise<ApiResponse> {
    const actor = this.auth.requireLevel(request.token, 1);
    const body = portalAccountBody.parse(request.body);
    const passwordHash = await hash(body.password, 12);
    return this.withWriteDatabase((database) => {
      if (
        body.staff_id &&
        !database.prepare("SELECT 1 FROM staff WHERE id=?").get(body.staff_id)
      )
        return this.response(422, { error: "staff profile not found" });
      for (const id of body.student_ids ?? [])
        if (!database.prepare("SELECT 1 FROM students WHERE id=?").get(id))
          return this.response(422, {
            error: `student profile ${id} not found`,
          });
      const create = database.transaction(() => {
        const level = body.role === "teacher" ? 2 : 5;
        const result = database
          .prepare(
            "INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,?)",
          )
          .run(body.username, passwordHash, body.role, body.name, level);
        const id = Number(result.lastInsertRowid);
        if (body.staff_id)
          database
            .prepare(
              "INSERT INTO user_staff_links(user_id,staff_id) VALUES(?,?)",
            )
            .run(id, body.staff_id);
        const link = database.prepare(
          "INSERT INTO user_student_links(user_id,student_id,relationship) VALUES(?,?,?)",
        );
        for (const studentId of body.student_ids ?? [])
          link.run(
            id,
            studentId,
            body.role === "parent" ? "parent" : "student",
          );
        this.audit(
          database,
          actor,
          "portal_account.create",
          "user",
          id,
          JSON.stringify({ role: body.role }),
        );
        return id;
      });
      const id = create();
      return this.created({ ok: true, id });
    });
  }

  private async resetPortalPassword(
    request: ApiRequest,
    id: number,
  ): Promise<ApiResponse> {
    const actor = this.auth.requireLevel(request.token, 1);
    const { password } = resetPasswordBody.parse(request.body);
    const passwordHash = await hash(password, 12);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "UPDATE users SET password_hash=? WHERE id=? AND role IN ('teacher','parent','student')",
        )
        .run(passwordHash, id);
      if (!result.changes)
        return this.response(404, { error: "portal account not found" });
      this.audit(database, actor, "portal_account.password_reset", "user", id);
      return this.ok({ ok: true });
    });
  }

  private deletePortalAccount(request: ApiRequest, id: number): ApiResponse {
    const actor = this.auth.requireLevel(request.token, 1);
    return this.withWriteDatabase((database) => {
      const result = database
        .prepare(
          "DELETE FROM users WHERE id=? AND role IN ('teacher','parent','student')",
        )
        .run(id);
      if (!result.changes)
        return this.response(404, { error: "portal account not found" });
      this.audit(database, actor, "portal_account.delete", "user", id);
      return this.ok({ ok: true });
    });
  }

  private withDatabase<T>(operation: (database: Database.Database) => T): T {
    const database = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return operation(database);
    } finally {
      database.close();
    }
  }

  private withWriteDatabase<T>(
    operation: (database: Database.Database) => T,
  ): T {
    const database = new Database(this.databasePath(), { fileMustExist: true });
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    try {
      return operation(database);
    } finally {
      database.close();
    }
  }

  private audit(
    database: Database.Database,
    actor: number,
    action: string,
    resource: string,
    id?: number,
    detail?: string,
  ): void {
    database
      .prepare(
        "INSERT INTO audit_log(user_id,action,resource_type,resource_id,detail) VALUES(?,?,?,?,?)",
      )
      .run(actor, action, resource, id ?? null, detail ?? null);
  }

  private token(request: ApiRequest): string {
    if (!request.token) throw new Error("Authentication required.");
    return request.token;
  }

  private ok(body: unknown): ApiResponse {
    return this.response(200, body);
  }
  private created(body: unknown, status = 201): ApiResponse {
    return this.response(status, body);
  }
  private response(status: number, body: unknown): ApiResponse {
    return apiResponseSchema.parse({ status, body });
  }
}
