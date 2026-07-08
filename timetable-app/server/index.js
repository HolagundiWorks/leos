import cors from 'cors';
import express from 'express';
import { db, initDb } from './db.js';

initDb();

const app = express();
const PORT = process.env.PORT || 3879;

app.use(cors());
app.use(express.json());

function teacherName(first, last) {
  if (!first) return null;
  return `${first} ${last ?? ''}`.trim();
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Periods / Timings ────────────────────────────────────────────────────────
app.get('/periods', (_req, res) => {
  const periods = db
    .prepare(
      'SELECT id, label, period_type, start_time, end_time, sort_order FROM periods ORDER BY sort_order',
    )
    .all();
  res.json({ periods, total: periods.length });
});

app.post('/periods', (req, res) => {
  const arr = req.body?.periods;
  if (!Array.isArray(arr)) return res.status(422).json({ error: 'periods array required' });
  const del = db.prepare('DELETE FROM periods');
  const ins = db.prepare(
    'INSERT INTO periods(label, period_type, start_time, end_time, sort_order) VALUES(?,?,?,?,?)',
  );
  const tx = db.transaction(() => {
    del.run();
    arr.forEach((p, i) => {
      ins.run(
        p.label ?? 'Period',
        p.period_type ?? 'period',
        p.start_time ?? '08:00',
        p.end_time ?? '08:45',
        i,
      );
    });
  });
  tx();
  res.json({ ok: true });
});

// ─── Subjects ─────────────────────────────────────────────────────────────────
app.get('/subjects', (req, res) => {
  const q = req.query.q?.trim();
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, course_id, name, code, type, weekly_periods, is_lab, mandatory
         FROM subjects WHERE name LIKE ? OR code LIKE ? ORDER BY name`,
      )
      .all(`%${q}%`, `%${q}%`);
  } else {
    rows = db
      .prepare(
        'SELECT id, course_id, name, code, type, weekly_periods, is_lab, mandatory FROM subjects ORDER BY name',
      )
      .all();
  }
  res.json({ subjects: rows, total: rows.length });
});

app.post('/subjects', (req, res) => {
  const { name, code, type, course_id, weekly_periods, is_lab, mandatory } = req.body ?? {};
  if (!name?.trim()) return res.status(422).json({ error: 'name required' });
  const r = db
    .prepare(
      'INSERT INTO subjects(course_id, name, code, type, weekly_periods, is_lab, mandatory) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      course_id ?? null,
      name,
      code ?? null,
      type ?? null,
      weekly_periods ?? 0,
      is_lab ? 1 : 0,
      mandatory !== false ? 1 : 0,
    );
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});

app.post('/subjects/:id/update', (req, res) => {
  const id = Number(req.params.id);
  const v = req.body ?? {};
  const r = db
    .prepare(
      `UPDATE subjects SET course_id=?, name=COALESCE(?,name), code=?, type=?,
       weekly_periods=COALESCE(?,weekly_periods), is_lab=COALESCE(?,is_lab), mandatory=COALESCE(?,mandatory)
       WHERE id=?`,
    )
    .run(
      v.course_id ?? null,
      v.name?.trim() || null,
      v.code ?? null,
      v.type ?? null,
      v.weekly_periods,
      v.is_lab != null ? (v.is_lab ? 1 : 0) : null,
      v.mandatory != null ? (v.mandatory ? 1 : 0) : null,
      id,
    );
  if (r.changes === 0) return res.status(404).json({ error: 'subject not found' });
  res.json({ ok: true });
});

app.post('/subjects/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM teacher_subjects WHERE subject_id=?').run(id);
  db.prepare('UPDATE timetable_entries SET subject_id=NULL WHERE subject_id=?').run(id);
  db.prepare('DELETE FROM subjects WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Courses ──────────────────────────────────────────────────────────────────
app.get('/courses', (_req, res) => {
  const courses = db
    .prepare(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM subjects s WHERE s.course_id = c.id) AS subject_count
       FROM courses c ORDER BY c.name`,
    )
    .all();
  res.json({ courses, total: courses.length });
});

// ─── Staff / Teachers ─────────────────────────────────────────────────────────
app.get('/staff', (req, res) => {
  const q = req.query.q?.trim();
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, first_name, last_name, email FROM staff
         WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? ORDER BY first_name`,
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT id, first_name, last_name, email FROM staff ORDER BY first_name').all();
  }
  res.json({ staff: rows, total: rows.length });
});

app.post('/staff', (req, res) => {
  const { first_name, last_name, email } = req.body ?? {};
  if (!first_name?.trim()) return res.status(422).json({ error: 'first_name required' });
  const r = db
    .prepare('INSERT INTO staff(first_name, last_name, email) VALUES(?,?,?)')
    .run(first_name, last_name ?? null, email ?? null);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});

app.post('/staff/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM teacher_subjects WHERE staff_id=?').run(id);
  db.prepare('UPDATE timetable_entries SET staff_id=NULL WHERE staff_id=?').run(id);
  db.prepare('DELETE FROM staff WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Teacher-Subject mapping ──────────────────────────────────────────────────
app.get('/teacher-subjects', (_req, res) => {
  const subjects = db.prepare('SELECT id, name, code, type FROM subjects ORDER BY name').all();
  const assignments = db
    .prepare(
      `SELECT ts.id, ts.staff_id, ts.subject_id, ts.priority,
              st.first_name, st.last_name
       FROM teacher_subjects ts
       JOIN staff st ON st.id = ts.staff_id`,
    )
    .all();
  const bySubject = new Map();
  for (const a of assignments) {
    if (!bySubject.has(a.subject_id)) bySubject.set(a.subject_id, []);
    bySubject.get(a.subject_id).push({
      id: a.id,
      staff_id: a.staff_id,
      priority: a.priority,
      teacher: teacherName(a.first_name, a.last_name),
    });
  }
  const result = subjects.map((s) => ({
    ...s,
    assignments: bySubject.get(s.id) ?? [],
  }));
  res.json({ subjects: result, total: result.length });
});

app.post('/teacher-subjects', (req, res) => {
  const { staff_id, subject_id, priority } = req.body ?? {};
  if (!staff_id || !subject_id) return res.status(422).json({ error: 'staff_id and subject_id required' });
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM teacher_subjects WHERE subject_id=?')
    .get(subject_id).c;
  if (count >= 3) return res.status(422).json({ error: 'max 3 teachers per subject' });
  try {
    const r = db
      .prepare('INSERT INTO teacher_subjects(staff_id, subject_id, priority) VALUES(?,?,?)')
      .run(staff_id, subject_id, priority ?? 1);
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'teacher already assigned to this subject' });
  }
});

app.post('/teacher-subjects/remove', (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(422).json({ error: 'id required' });
  db.prepare('DELETE FROM teacher_subjects WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Classrooms ───────────────────────────────────────────────────────────────
app.get('/classrooms', (_req, res) => {
  const classrooms = db.prepare('SELECT id, name, capacity FROM classrooms ORDER BY name').all();
  res.json({ classrooms, total: classrooms.length });
});

// ─── Classes & Sections ───────────────────────────────────────────────────────
app.get('/classes', (_req, res) => {
  const classes = db.prepare('SELECT id, name, grade_level, course_id FROM classes ORDER BY id').all();
  const result = classes.map((c) => {
    const sections = db
      .prepare(
        `SELECT s.id, s.name, s.capacity, st.first_name, st.last_name, r.name AS room_name
         FROM sections s
         LEFT JOIN staff st ON st.id = s.teacher_id
         LEFT JOIN classrooms r ON r.id = s.room_id
         WHERE s.class_id = ? ORDER BY s.name`,
      )
      .all(c.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        capacity: s.capacity,
        teacher: teacherName(s.first_name, s.last_name),
        room_name: s.room_name,
      }));
    return { ...c, sections };
  });
  res.json({ classes: result, total: result.length });
});

app.post('/classes', (req, res) => {
  const { name, grade_level, course_id } = req.body ?? {};
  if (!name?.trim()) return res.status(422).json({ error: 'name required' });
  const r = db
    .prepare('INSERT INTO classes(name, grade_level, course_id) VALUES(?,?,?)')
    .run(name, grade_level ?? null, course_id ?? null);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});

app.post('/sections', (req, res) => {
  const { class_id, name, teacher_id, capacity, room_id } = req.body ?? {};
  if (!class_id || !name?.trim()) return res.status(422).json({ error: 'class_id and name required' });
  const r = db
    .prepare('INSERT INTO sections(class_id, name, teacher_id, capacity, room_id) VALUES(?,?,?,?,?)')
    .run(class_id, name, teacher_id ?? null, capacity ?? null, room_id ?? null);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});

// ─── Timetable ────────────────────────────────────────────────────────────────
app.get('/timetable', (req, res) => {
  const sectionId = Number(req.query.section_id);
  if (!sectionId) return res.status(422).json({ error: 'section_id required' });
  const rows = db
    .prepare(
      `SELECT te.id, te.section_id, te.period_id, te.day_of_week,
              te.subject_id, subj.name AS subject_name, subj.code AS subject_code, subj.type AS subject_type,
              te.staff_id, st.first_name, st.last_name,
              te.room_id, r.name AS room_name
       FROM timetable_entries te
       LEFT JOIN subjects subj ON subj.id = te.subject_id
       LEFT JOIN staff st ON st.id = te.staff_id
       LEFT JOIN classrooms r ON r.id = te.room_id
       WHERE te.section_id = ?
       ORDER BY te.day_of_week, te.period_id`,
    )
    .all(sectionId);
  const entries = rows.map((r) => ({
    ...r,
    teacher_name: teacherName(r.first_name, r.last_name),
  }));
  res.json({ entries, total: entries.length });
});

app.get('/timetable/all', (_req, res) => {
  const sections = db
    .prepare(
      `SELECT sec.id, sec.name, c.id AS class_id, c.name AS class_name, c.grade_level
       FROM sections sec JOIN classes c ON c.id = sec.class_id
       ORDER BY c.grade_level, c.name, sec.name`,
    )
    .all();
  const rows = db
    .prepare(
      `SELECT te.id, te.section_id, te.period_id, te.day_of_week,
              te.subject_id, subj.name AS subject_name, subj.code AS subject_code,
              te.staff_id, st.first_name, st.last_name,
              te.room_id, r.name AS room_name
       FROM timetable_entries te
       LEFT JOIN subjects subj ON subj.id = te.subject_id
       LEFT JOIN staff st ON st.id = te.staff_id
       LEFT JOIN classrooms r ON r.id = te.room_id
       ORDER BY te.section_id, te.day_of_week, te.period_id`,
    )
    .all();
  const entries = rows.map((r) => ({
    ...r,
    teacher_name: teacherName(r.first_name, r.last_name),
  }));
  res.json({ sections, entries });
});

app.get('/timetable/quota', (req, res) => {
  const sectionId = Number(req.query.section_id);
  if (!sectionId) return res.status(422).json({ error: 'section_id required' });
  const subjects = db
    .prepare(
      `SELECT s.id, s.name, s.code, s.weekly_periods AS target,
              (SELECT COUNT(*) FROM timetable_entries te WHERE te.subject_id = s.id AND te.section_id = ?) AS scheduled
       FROM subjects s WHERE s.weekly_periods > 0 ORDER BY s.name`,
    )
    .all(sectionId);
  const withStatus = subjects.map((s) => {
    let status = 'under';
    if (s.scheduled === s.target) status = 'met';
    else if (s.scheduled > s.target) status = 'over';
    return { ...s, status };
  });
  res.json({ subjects: withStatus, total: withStatus.length });
});

app.get('/timetable/teacher-load', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT te.staff_id, st.first_name, st.last_name, te.section_id, sec.name AS section_name,
              c.name AS class_name, COUNT(*) AS periods
       FROM timetable_entries te
       JOIN staff st ON st.id = te.staff_id
       JOIN sections sec ON sec.id = te.section_id
       JOIN classes c ON c.id = sec.class_id
       WHERE te.staff_id IS NOT NULL
       GROUP BY te.staff_id, te.section_id
       ORDER BY st.first_name, c.name, sec.name`,
    )
    .all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.staff_id)) {
      map.set(r.staff_id, {
        staff_id: r.staff_id,
        teacher_name: teacherName(r.first_name, r.last_name),
        total_periods: 0,
        sections: [],
      });
    }
    const t = map.get(r.staff_id);
    t.total_periods += r.periods;
    t.sections.push({ section: `${r.class_name} ${r.section_name}`, periods: r.periods });
  }
  const teachers = [...map.values()].sort((a, b) => b.total_periods - a.total_periods);
  res.json({ teachers, total: teachers.length });
});

app.post('/timetable', (req, res) => {
  const { section_id, period_id, day_of_week, subject_id, staff_id, room_id } = req.body ?? {};
  if (!section_id || !period_id) return res.status(422).json({ error: 'section_id and period_id required' });
  if (day_of_week == null || day_of_week < 0 || day_of_week > 6) {
    return res.status(422).json({ error: 'day_of_week 0–6 required' });
  }

  if (staff_id) {
    const conflict = db
      .prepare(
        `SELECT te.section_id FROM timetable_entries te
         WHERE te.staff_id=? AND te.period_id=? AND te.day_of_week=? AND te.section_id!=?`,
      )
      .get(staff_id, period_id, day_of_week, section_id);
    if (conflict) {
      const label = db
        .prepare(
          `SELECT c.name || ' – Sec ' || s.name AS lbl FROM sections s
           JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        )
        .get(conflict.section_id);
      return res.status(409).json({
        error: 'teacher_conflict',
        message: `Teacher already assigned in this slot (${label?.lbl ?? 'another section'})`,
      });
    }
  }

  if (room_id) {
    const conflict = db
      .prepare(
        `SELECT section_id FROM timetable_entries
         WHERE room_id=? AND period_id=? AND day_of_week=? AND section_id!=?`,
      )
      .get(room_id, period_id, day_of_week, section_id);
    if (conflict) {
      return res.status(409).json({
        error: 'room_conflict',
        message: 'Room already booked for this slot by another section',
      });
    }
  }

  db.prepare(
    `INSERT INTO timetable_entries(section_id, period_id, day_of_week, subject_id, staff_id, room_id)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(section_id, period_id, day_of_week) DO UPDATE SET
       subject_id=excluded.subject_id, staff_id=excluded.staff_id, room_id=excluded.room_id`,
  ).run(section_id, period_id, day_of_week, subject_id ?? null, staff_id ?? null, room_id ?? null);
  res.json({ ok: true });
});

app.post('/timetable/clear', (req, res) => {
  const { section_id, period_id, day_of_week } = req.body ?? {};
  if (!section_id || !period_id || day_of_week == null) {
    return res.status(422).json({ error: 'section_id, period_id, day_of_week required' });
  }
  db.prepare(
    'DELETE FROM timetable_entries WHERE section_id=? AND period_id=? AND day_of_week=?',
  ).run(section_id, period_id, day_of_week);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Timetable API running on http://localhost:${PORT}`);
});
