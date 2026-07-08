import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.TIMETABLE_DATA_DIR ?? join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'timetable.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  name TEXT,
  code TEXT,
  type TEXT,
  weekly_periods INTEGER DEFAULT 0,
  is_lab INTEGER DEFAULT 0,
  mandatory INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  priority INTEGER DEFAULT 1,
  UNIQUE(staff_id, subject_id)
);

CREATE TABLE IF NOT EXISTS classrooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capacity INTEGER
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  grade_level TEXT,
  course_id INTEGER
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  teacher_id INTEGER,
  capacity INTEGER,
  room_id INTEGER
);

CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  period_type TEXT DEFAULT 'period',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  subject_id INTEGER,
  staff_id INTEGER,
  room_id INTEGER,
  UNIQUE(section_id, period_id, day_of_week)
);
`;

export function initDb() {
  db.exec(SCHEMA);
  const count = (sql) => db.prepare(sql).pluck().get();
  if (count('SELECT COUNT(*) FROM periods') === 0) seedPeriods();
  if (count('SELECT COUNT(*) FROM courses') === 0) seedAcademics();
  if (count('SELECT COUNT(*) FROM staff') === 0) seedStaff();
  if (count('SELECT COUNT(*) FROM classrooms') === 0) seedClassrooms();
  if (count('SELECT COUNT(*) FROM classes') === 0) seedClasses();
  if (count('SELECT COUNT(*) FROM teacher_subjects') === 0) seedTeacherSubjects();
}

function seedPeriods() {
  const slots = [
    ['Assembly', 'break', '08:00', '08:15'],
    ['Period 1', 'period', '08:15', '09:00'],
    ['Period 2', 'period', '09:00', '09:45'],
    ['Period 3', 'period', '09:45', '10:30'],
    ['Short Break', 'break', '10:30', '10:45'],
    ['Period 4', 'period', '10:45', '11:30'],
    ['Period 5', 'period', '11:30', '12:15'],
    ['Lunch Break', 'break', '12:15', '13:00'],
    ['Period 6', 'period', '13:00', '13:45'],
    ['Period 7', 'period', '13:45', '14:30'],
    ['Period 8', 'period', '14:30', '15:15'],
  ];
  const ins = db.prepare(
    'INSERT INTO periods(label, period_type, start_time, end_time, sort_order) VALUES(?,?,?,?,?)',
  );
  slots.forEach((s, i) => ins.run(...s, i));
}

function seedAcademics() {
  const courseId = db.prepare('INSERT INTO courses(name) VALUES(?)').run('CBSE — Class 8').lastInsertRowid;
  const subjects = [
    ['English', 'ENG', 'Language', 5, 0],
    ['Kannada', 'KAN', 'Language', 4, 0],
    ['Hindi', 'HIN', 'Language', 4, 0],
    ['Mathematics', 'MAT', 'Core', 6, 0],
    ['Science', 'SCI', 'Core', 6, 0],
    ['Social Science', 'SOC', 'Core', 5, 0],
    ['Computer Science', 'CMP', 'Lab', 3, 1],
    ['Physical Education', 'PED', 'Sports', 2, 0],
  ];
  const ins = db.prepare(
    'INSERT INTO subjects(course_id, name, code, type, weekly_periods, is_lab) VALUES(?,?,?,?,?,?)',
  );
  for (const [name, code, type, wp, lab] of subjects) {
    ins.run(courseId, name, code, type, wp, lab);
  }
}

function seedStaff() {
  const teachers = [
    ['Anika', 'Sharma', 'anika@school.edu'],
    ['David', 'Kumar', 'david@school.edu'],
    ['Priya', 'Nair', 'priya@school.edu'],
    ['Rahul', 'Mehta', 'rahul@school.edu'],
    ['Sneha', 'Reddy', 'sneha@school.edu'],
    ['Imran', 'Khan', 'imran@school.edu'],
    ['Lakshmi', 'Iyer', 'lakshmi@school.edu'],
  ];
  const ins = db.prepare('INSERT INTO staff(first_name, last_name, email) VALUES(?,?,?)');
  for (const t of teachers) ins.run(...t);
}

function seedClassrooms() {
  const rooms = [
    ['Room 101', 40],
    ['Room 102', 38],
    ['Lab 201', 30],
    ['Sports Ground', 100],
  ];
  const ins = db.prepare('INSERT INTO classrooms(name, capacity) VALUES(?,?)');
  for (const r of rooms) ins.run(...r);
}

function seedClasses() {
  const classes = [
    ['Class 6', '6', null],
    ['Class 7', '7', null],
    ['Class 8', '8', 1],
  ];
  const insClass = db.prepare('INSERT INTO classes(name, grade_level, course_id) VALUES(?,?,?)');
  const insSec = db.prepare(
    'INSERT INTO sections(class_id, name, teacher_id, capacity, room_id) VALUES(?,?,?,?,?)',
  );
  for (const [name, grade, course] of classes) {
    const classId = insClass.run(name, grade, course).lastInsertRowid;
    insSec.run(classId, 'A', 1, 40, 1);
    insSec.run(classId, 'B', 2, 38, 2);
  }
}

function seedTeacherSubjects() {
  const entries = [
    ['English', 2, 1], ['English', 3, 2],
    ['Kannada', 4, 1],
    ['Hindi', 5, 1],
    ['Mathematics', 6, 1], ['Mathematics', 3, 2],
    ['Science', 7, 1], ['Science', 8, 2],
    ['Social Science', 4, 1],
    ['Computer Science', 7, 1], ['Computer Science', 2, 2],
    ['Physical Education', 8, 1],
  ];
  const getSubj = db.prepare('SELECT id FROM subjects WHERE name = ?');
  const ins = db.prepare(
    'INSERT INTO teacher_subjects(staff_id, subject_id, priority) VALUES(?,?,?)',
  );
  for (const [subjName, staffId, priority] of entries) {
    const row = getSubj.get(subjName);
    if (row) ins.run(staffId, row.id, priority);
  }
}
