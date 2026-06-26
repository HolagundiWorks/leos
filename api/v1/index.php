<?php
// HCW-SMS API v1 — JSON front controller (wrapper over openSIS / MariaDB).
// Routes (all JSON):
//   GET  /api/v1/                 health
//   POST /api/v1/auth/login       { username, password } -> { token, user }
//   GET  /api/v1/auth/me          (Bearer) -> { user }
//   GET  /api/v1/dashboard/summary(Bearer) -> { summary }

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/auth.php';

cors();

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$route = trim((string) preg_replace('#^.*/api/v1#', '', $uri), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Dynamic routes (regex) before the static switch.
if ($method === 'GET' && preg_match('#^students/(\d+)$#', $route, $m)) {
    require_user();
    json_out(['student' => student_detail((int) $m[1])]);
}

switch ("$method $route") {
    case 'GET ':
    case 'GET health':
        json_out(['ok' => true, 'service' => 'hcw-sms-api', 'version' => 'v1']);

    case 'POST auth/login':
        $b = body_json();
        $username = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');
        if ($username === '' || $password === '') {
            fail('username and password required', 422);
        }
        $user = login_user($username, $password);
        if (!$user) {
            fail('invalid credentials', 401);
        }
        json_out(['token' => issue_token($user), 'user' => $user]);

    case 'GET auth/me':
        $p = require_user();
        json_out(['user' => [
            'id' => $p['sub'] ?? null,
            'username' => $p['username'] ?? null,
            'profile' => $p['profile'] ?? null,
            'name' => $p['name'] ?? null,
        ]]);

    case 'GET dashboard/summary':
        require_user();
        json_out(['summary' => dashboard_summary()]);

    case 'GET dashboard/today':
        require_user();
        json_out(['items' => dashboard_today()]);

    case 'GET students':
        require_user();
        $q = trim((string) ($_GET['q'] ?? ''));
        $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        json_out(students_list($q, $limit, $offset));

    case 'GET staff':
        require_user();
        $q = trim((string) ($_GET['q'] ?? ''));
        $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        json_out(staff_list($q, $limit, $offset));

    default:
        fail('not found: ' . $method . ' ' . $route, 404);
}

function dashboard_summary(): array
{
    return [
        'students' => (int) db_scalar('SELECT COUNT(DISTINCT STUDENT_ID) FROM students'),
        'staff'    => (int) db_scalar('SELECT COUNT(DISTINCT STAFF_ID) FROM staff'),
        'schools'  => (int) db_scalar('SELECT COUNT(*) FROM schools'),
        'courses'  => (int) db_scalar('SELECT COUNT(DISTINCT COURSE_ID) FROM courses'),
    ];
}

// Active "needs attention" work queue computed from the live data.
function dashboard_today(): array
{
    $totalStudents = (int) db_scalar('SELECT COUNT(*) FROM students');
    $enrolled = (int) db_scalar('SELECT COUNT(DISTINCT STUDENT_ID) FROM student_enrollment');
    $notEnrolled = max(0, $totalStudents - $enrolled);
    $courses = (int) db_scalar('SELECT COUNT(*) FROM courses');
    $grades = (int) db_scalar('SELECT COUNT(*) FROM school_gradelevels');
    $noContact = (int) db_scalar(
        "SELECT COUNT(*) FROM students WHERE (email IS NULL OR email='') AND (phone IS NULL OR phone='')"
    );

    $items = [];
    if ($notEnrolled > 0) {
        $items[] = ['key' => 'enroll', 'count' => $notEnrolled, 'label' => 'students not enrolled in a class', 'severity' => 'warning', 'module' => 'students'];
    }
    if ($grades === 0) {
        $items[] = ['key' => 'grades', 'count' => 0, 'label' => 'Define grade levels for the school', 'severity' => 'info', 'module' => 'settings'];
    }
    if ($courses === 0) {
        $items[] = ['key' => 'courses', 'count' => 0, 'label' => 'Set up your first course', 'severity' => 'info', 'module' => 'courses'];
    }
    if ($noContact > 0) {
        $items[] = ['key' => 'contact', 'count' => $noContact, 'label' => 'students missing email and phone', 'severity' => 'warning', 'module' => 'students'];
    }
    return $items;
}

function students_list(string $q, int $limit, int $offset): array
{
    $where = '';
    $params = [];
    if ($q !== '') {
        $where = "WHERE CONCAT(first_name, ' ', last_name) LIKE ? OR email LIKE ?";
        $like = '%' . $q . '%';
        $params = [$like, $like];
    }
    $total = (int) db_scalar("SELECT COUNT(*) FROM students $where", $params);
    // $limit/$offset are clamped ints above, so inlining them is injection-safe
    // (mysqli can't bind LIMIT/OFFSET placeholders portably).
    $rows = db_rows(
        "SELECT student_id AS id, first_name, last_name, email, phone, gender, birthdate
           FROM students $where
           ORDER BY first_name, last_name
           LIMIT $limit OFFSET $offset",
        $params
    );
    return ['students' => $rows, 'total' => $total];
}

function student_detail(int $id): array
{
    $row = db_row(
        'SELECT student_id AS id, first_name, middle_name, last_name, email, phone,
                gender, birthdate, alt_id
           FROM students WHERE student_id=? LIMIT 1',
        [(string) $id]
    );
    if (!$row) {
        fail('student not found', 404);
    }
    return $row;
}

function staff_list(string $q, int $limit, int $offset): array
{
    $where = '';
    $params = [];
    if ($q !== '') {
        $where = "WHERE CONCAT(first_name, ' ', last_name) LIKE ? OR email LIKE ? OR title LIKE ?";
        $like = '%' . $q . '%';
        $params = [$like, $like, $like];
    }
    $total = (int) db_scalar("SELECT COUNT(*) FROM staff $where", $params);
    $rows = db_rows(
        "SELECT staff_id AS id, first_name, last_name, email, phone, profile, title
           FROM staff $where
           ORDER BY first_name, last_name
           LIMIT $limit OFFSET $offset",
        $params
    );
    return ['staff' => $rows, 'total' => $total];
}
