# LEOS demonstration school

Generate the portable demonstration school with:

```powershell
npm run demo:create --prefix desktop
```

The generated `LEOS-Demo-School.leosdb` is intentionally ignored by Git because
school archives may contain private information. This dataset contains invented
people and demonstration-only records.

Demo credentials:

| Purpose | Username | Password |
| --- | --- | --- |
| Database master key | — | `DemoSchool@2026` |
| Administrator | `admin` | `Demo@2026` |
| Teacher | `teacher.demo` | `Demo@2026` |
| Parent | `parent.demo` | `Demo@2026` |
| Student | `student.demo` | `Demo@2026` |

Never reuse these credentials for a real school.
