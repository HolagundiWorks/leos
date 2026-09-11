const { mkdirSync, rmSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { hashSync } = require("bcryptjs");
const Database = require("../dist/sqlite").default;
const { SchoolFileService } = require("../dist/school-files");
const { AuthService } = require("../dist/auth");

const output = resolve(process.argv[2] || "../demo/LEOS-Demo-School.leosdb");
const work = resolve(dirname(output), ".leos-demo-work.sqlite");
const verifyWork = resolve(dirname(output), ".leos-demo-verify.sqlite");
const MASTER_KEY = "DemoSchool@2026";
const PASSWORD = "Demo@2026";

async function main() {
  mkdirSync(dirname(output), { recursive: true });
  rmSync(work, { force: true });
  rmSync(verifyWork, { force: true });
  const files = new SchoolFileService(() => work);
  await files.createArchive({
    path: output,
    masterKey: MASTER_KEY,
    schoolName: "Saraswati Valley School",
    institutionType: "school",
    academicYear: "2026-27",
    adminPassword: PASSWORD,
  });

  const db = new Database(work, { fileMustExist: true });
  try {
    db.transaction(() => {
      db.prepare(`UPDATE schools SET address=?, principal_name=?, affiliation_no=?, school_code=?, udise_code=? WHERE id=1`)
        .run("Vijayanagar, Bengaluru, Karnataka 560040", "Dr. Meera Rao", "SVS/KA/2026/1042", "SVS-001", "29200123456");
      db.prepare("INSERT INTO academic_years(label,start_date,end_date,is_active) VALUES(?,?,?,1)").run("2026-27", "2026-06-01", "2027-04-10");
      db.prepare("INSERT INTO terms(year_id,label,start_date,end_date,is_active) VALUES(1,?,?,?,1)").run("Term 1", "2026-06-01", "2026-10-15");

      const departments = ["Administration", "Languages", "Mathematics", "Science", "Social Science"];
      for (const name of departments) db.prepare("INSERT INTO departments(name) VALUES(?)").run(name);
      const staff = [
        ["Meera", "Rao", "principal@demo.leos.local", "Principal", "Administration", "EMP001", 1],
        ["Ananya", "Sharma", "ananya@demo.leos.local", "English Teacher", "Languages", "EMP002", 2],
        ["Raghav", "Kulkarni", "raghav@demo.leos.local", "Mathematics Teacher", "Mathematics", "EMP003", 3],
        ["Farah", "Khan", "farah@demo.leos.local", "Science Teacher", "Science", "EMP004", 4],
        ["Joseph", "D'Souza", "joseph@demo.leos.local", "Social Science Teacher", "Social Science", "EMP005", 5],
      ];
      for (const row of staff) db.prepare("INSERT INTO staff(first_name,last_name,email,title,department,employee_id,department_id,join_date,phone) VALUES(?,?,?,?,?,?,?,?,?)").run(...row.slice(0, 8), "+91 90000 00000");

      const demoHash = hashSync(PASSWORD, 12);
      const teacherUser = Number(db.prepare("INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,?)").run("teacher.demo", demoHash, "teacher", "Ananya Sharma", 3).lastInsertRowid);
      db.prepare("INSERT INTO user_staff_links(user_id,staff_id) VALUES(?,2)").run(teacherUser);
      const parentUser = Number(db.prepare("INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,?)").run("parent.demo", demoHash, "parent", "Kavya Iyer", 5).lastInsertRowid);
      const studentUser = Number(db.prepare("INSERT INTO users(username,password_hash,role,name,level) VALUES(?,?,?,?,?)").run("student.demo", demoHash, "student", "Aarav Iyer", 5).lastInsertRowid);

      db.prepare("INSERT INTO courses(name) VALUES(?)").run("Middle School Programme");
      for (const row of [["Grade 7", "Grade 7", 1], ["Grade 8", "Grade 8", 1]]) db.prepare("INSERT INTO classes(name,grade_level,course_id) VALUES(?,?,?)").run(...row);
      for (const row of [["Room 201", "R201", 36, "classroom"], ["Room 202", "R202", 36, "classroom"], ["Science Lab", "LAB1", 30, "laboratory"]]) db.prepare("INSERT INTO classrooms(name,code,capacity,room_type) VALUES(?,?,?,?)").run(...row);
      db.prepare("INSERT INTO sections(class_id,name,teacher_id,capacity,room_id) VALUES(1,'A',2,32,1)").run();
      db.prepare("INSERT INTO sections(class_id,name,teacher_id,capacity,room_id) VALUES(2,'A',4,32,2)").run();

      const subjects = [["English", "ENG7", "theory", 5, 0], ["Mathematics", "MAT7", "theory", 6, 0], ["Science", "SCI7", "theory", 6, 1], ["Social Science", "SOC7", "theory", 5, 0]];
      for (const row of subjects) db.prepare("INSERT INTO subjects(course_id,name,code,type,weekly_periods,is_lab) VALUES(1,?,?,?,?,?)").run(...row);
      for (const row of [[2,1],[3,2],[4,3],[5,4]]) db.prepare("INSERT INTO teacher_subjects(staff_id,subject_id) VALUES(?,?)").run(...row);

      const students = [
        ["Aarav","Iyer","aarav@demo.leos.local","Male","2013-05-14","SVS26001","Kavya Iyer","+91 91111 10001"],
        ["Aditi","Patil","aditi@demo.leos.local","Female","2013-08-21","SVS26002","Nitin Patil","+91 91111 10002"],
        ["Arjun","Nair","arjun@demo.leos.local","Male","2013-02-09","SVS26003","Lakshmi Nair","+91 91111 10003"],
        ["Diya","Shetty","diya@demo.leos.local","Female","2013-11-30","SVS26004","Prakash Shetty","+91 91111 10004"],
        ["Ishaan","Gupta","ishaan@demo.leos.local","Male","2013-06-17","SVS26005","Ritu Gupta","+91 91111 10005"],
        ["Meher","Ali","meher@demo.leos.local","Female","2013-09-05","SVS26006","Sameer Ali","+91 91111 10006"],
        ["Nikhil","Hegde","nikhil@demo.leos.local","Male","2012-04-12","SVS26007","Sunita Hegde","+91 91111 10007"],
        ["Riya","Menon","riya@demo.leos.local","Female","2012-07-26","SVS26008","Ajay Menon","+91 91111 10008"],
        ["Sai","Reddy","sai@demo.leos.local","Male","2012-12-08","SVS26009","Deepa Reddy","+91 91111 10009"],
        ["Sara","Thomas","sara@demo.leos.local","Female","2012-03-19","SVS26010","Mary Thomas","+91 91111 10010"],
        ["Vihaan","Joshi","vihaan@demo.leos.local","Male","2012-10-02","SVS26011","Amita Joshi","+91 91111 10011"],
        ["Zoya","Ahmed","zoya@demo.leos.local","Female","2012-01-23","SVS26012","Nazia Ahmed","+91 91111 10012"],
      ];
      const insertStudent = db.prepare("INSERT INTO students(first_name,last_name,email,gender,birthdate,alt_id,enrolled,guardian_name,guardian_phone,guardian_relation,address,admission_date,nationality,status,lock_state) VALUES(?,?,?,?,?,?,1,?,?,'Parent','Bengaluru, Karnataka','2026-06-01','Indian','Active','Verified')");
      students.forEach((row, index) => { insertStudent.run(...row); db.prepare("INSERT INTO section_students(section_id,student_id,enrolled_date) VALUES(?,?,?)").run(index < 6 ? 1 : 2, index + 1, "2026-06-01"); });
      db.prepare("INSERT INTO user_student_links(user_id,student_id,relationship) VALUES(?,1,'parent')").run(parentUser);
      db.prepare("INSERT INTO user_student_links(user_id,student_id,relationship) VALUES(?,1,'student')").run(studentUser);

      const periods = [["Period 1","08:45","09:30",1],["Period 2","09:30","10:15",2],["Period 3","10:30","11:15",3],["Period 4","11:15","12:00",4],["Period 5","13:00","13:45",5],["Period 6","13:45","14:30",6]];
      periods.forEach(row => db.prepare("INSERT INTO periods(label,start_time,end_time,sort_order) VALUES(?,?,?,?)").run(...row));
      for (let day=1; day<=5; day++) for (let period=1; period<=4; period++) db.prepare("INSERT INTO timetable_entries(section_id,period_id,day_of_week,subject_id,staff_id,room_id) VALUES(?,?,?,?,?,1)").run(1,period,day,period,period+1);
      for (let student=1; student<=6; student++) for (let period=1; period<=4; period++) db.prepare("INSERT INTO student_attendance(student_id,section_id,date,period_id,status,marked_by) VALUES(?,?,?,?,?,1)").run(student,1,"2026-09-11",period,student===5&&period===1?"late":"present");

      db.prepare("INSERT INTO faculty_plans(period_type,title,start_date,end_date,section_id,subject_id,lessons,activities,schedule,objectives,resources,assessment,status,created_by) VALUES('weekly',?,?,?,?,?,?,?,?,?,?,?,'published',?)")
        .run("Fractions in daily life", "2026-09-07", "2026-09-11", 1, 2, "Equivalent fractions and comparison", "Market-price group exercise", "Six periods", "Apply fractions to practical problems", "Workbook and fraction cards", "Exit ticket", teacherUser);
      db.prepare("INSERT INTO lms_spaces(title,description,subject_id,section_id,created_by,is_published) VALUES(?,?,?,?,?,1)").run("Grade 7 Mathematics", "Lessons and assignments for Section A", 2, 1, teacherUser);
      db.prepare("INSERT INTO lms_modules(space_id,title,description,sort_order,is_published) VALUES(1,'Fractions','Core concepts and applications',1,1)").run();
      db.prepare("INSERT INTO lms_lessons(module_id,title,content,objectives,resources,sort_order,is_published) VALUES(1,'Equivalent fractions','Read the examples and complete the guided practice.','Identify and generate equivalent fractions.','Textbook chapter 4',1,1)").run();
      db.prepare("INSERT INTO lms_assignments(space_id,module_id,title,instructions,due_date,max_points,is_published) VALUES(1,1,'Fraction journal','Record three examples of fractions used at home.','2026-09-14',20,1)").run();
      db.prepare("INSERT INTO lms_submissions(assignment_id,student_id,content,status,score,feedback,graded_by,graded_at) VALUES(1,1,'Cooking measurements and sharing fruit.','graded',18,'Clear practical examples.',?,datetime('now'))").run(teacherUser);

      db.prepare("INSERT INTO announcements(title,body,audience,is_draft,published_at,created_by) VALUES('Parent orientation','Orientation is scheduled in the auditorium on Saturday at 10:00.','all',0,'2026-09-10 09:00:00',1)").run();
      db.prepare("INSERT INTO activities(title,activity_type,date,venue,description,status,created_by) VALUES('Science museum visit','field_visit','2026-09-25','Visvesvaraya Museum','Grade 7 experiential learning visit','planned',1)").run();
      db.prepare("INSERT INTO tasks(title,description,assigned_to,department_id,due_date,priority,status,created_by) VALUES('Prepare Term 1 question bank','Submit moderated questions to the academic coordinator',2,2,'2026-09-18','high','in_progress',1)").run();
      db.prepare("INSERT INTO reminders(title,tag,due_date,notes,created_by) VALUES('Parent orientation','event','2026-09-13','Confirm auditorium seating and welcome desk',1)").run();
      db.prepare("INSERT INTO library_books(title,author,isbn,category,total_copies,available_copies) VALUES('The Blue Umbrella','Ruskin Bond','9788129117116','Fiction',4,3)").run();
      db.prepare("INSERT INTO fee_heads(name,description) VALUES('Tuition Fee','Annual academic tuition')").run();
      db.prepare("INSERT INTO fee_structures(academic_year_id,class_id,fee_head_id,amount,due_date) VALUES(1,1,1,36000,'2026-06-15')").run();
      db.prepare("INSERT INTO fee_payments(student_id,fee_head_id,academic_year_id,amount_paid,payment_date,payment_mode,receipt_no,collected_by) VALUES(1,1,1,18000,'2026-06-10','upi','SVS-R-1001',1)").run();
    })();
  } finally { db.close(); }

  const saved = await files.saveArchive(output);
  const verifier = new SchoolFileService(() => verifyWork);
  await verifier.openArchive({ path: output, masterKey: MASTER_KEY });
  const auth = new AuthService(() => verifyWork);
  await auth.unlock(MASTER_KEY);
  const login = await auth.login({ username: "admin", password: PASSWORD });
  const school = auth.inspectSchool();
  const verify = new Database(verifyWork, { readonly: true, fileMustExist: true });
  const counts = {};
  for (const table of ["students","staff","classes","sections","subjects","student_attendance","faculty_plans","lms_spaces","tasks","reminders"]) counts[table] = verify.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  verify.close();
  rmSync(work, { force: true });
  rmSync(verifyWork, { force: true });
  console.log(JSON.stringify({ path: saved.path, checksum: saved.checksum, school: school.name, admin: login.user.username, counts }, null, 2));
}

main().catch(error => { rmSync(work, { force: true }); rmSync(verifyWork, { force: true }); console.error(error); process.exitCode = 1; });
