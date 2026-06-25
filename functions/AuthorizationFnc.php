<?php
#**************************************************************************
#  openSIS is a free student information system for public and non-public
#  schools from Open Solutions for Education, Inc. web: www.os4ed.com
#
#  openSIS is  web-based, open source, and comes packed with features that
#  include student demographic info, scheduling, grade book, attendance,
#  report cards, eligibility, transcripts, parent portal,
#  student portal and more.
#
#  Visit the openSIS web site at http://www.opensis.com to learn more.
#  If you have question regarding this system or the license, please send
#  an email to info@os4ed.com.
#
#  This program is released under the terms of the GNU General Public License as
#  published by the Free Software Foundation, version 2 of the License.
#  See license.txt.
#
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.
#
#  You should have received a copy of the GNU General Public License
#  along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#***************************************************************************************

function OpenSISNormalizeId($value)
{
    $value = (int) $value;

    return ($value > 0 ? $value : 0);
}

function OpenSISDenyAccess()
{
    if (function_exists('HackingLog') && !empty($_SESSION['USERNAME'])) {
        HackingLog();
        exit;
    }

    die('Access denied!');
}

function OpenSISGetOwnedMailGroup($group_id)
{
    static $cache = array();

    $group_id = OpenSISNormalizeId($group_id);

    if (!$group_id || !User('USERNAME')) {
        return false;
    }

    if (array_key_exists($group_id, $cache)) {
        return $cache[$group_id];
    }

    $user_name = str_replace("'", "''", User('USERNAME'));
    $group_RET = DBGet(DBQuery(
        "SELECT GROUP_ID,GROUP_NAME,DESCRIPTION,USER_NAME,SCHOOL_ID
           FROM mail_group
          WHERE GROUP_ID='" . $group_id . "'
            AND USER_NAME='" . $user_name . "'
            AND SCHOOL_ID='" . UserSchool() . "'
          LIMIT 1"
    ));

    $cache[$group_id] = ($group_RET[1] ? $group_RET[1] : false);

    return $cache[$group_id];
}

function OpenSISRequireOwnedMailGroup($group_id)
{
    $group_RET = OpenSISGetOwnedMailGroup($group_id);

    if (!$group_RET) {
        OpenSISDenyAccess();
    }

    return $group_RET;
}

function OpenSISUserCanAccessCoursePeriod($course_period_id)
{
    $course_period_id = OpenSISNormalizeId($course_period_id);

    if (!$course_period_id) {
        return false;
    }

    $today = DBDate();
    $sql = "SELECT COURSE_PERIOD_ID
              FROM course_periods
             WHERE COURSE_PERIOD_ID='" . $course_period_id . "'
               AND SCHOOL_ID='" . UserSchool() . "'
               AND SYEAR='" . UserSyear() . "'";

    if (User('PROFILE') == 'teacher') {
        $sql .= " AND (TEACHER_ID='" . UserID() . "' OR SECONDARY_TEACHER_ID='" . UserID() . "')";
    } elseif (User('PROFILE') == 'student') {
        $student_id = OpenSISNormalizeId($_SESSION['STUDENT_ID']);

        if (!$student_id) {
            return false;
        }

        $sql .= " AND COURSE_PERIOD_ID IN (
                    SELECT COURSE_PERIOD_ID
                      FROM schedule
                     WHERE STUDENT_ID='" . $student_id . "'
                       AND SCHOOL_ID='" . UserSchool() . "'
                       AND SYEAR='" . UserSyear() . "'
                       AND START_DATE<='" . $today . "'
                       AND (END_DATE IS NULL OR END_DATE='0000-00-00' OR END_DATE>='" . $today . "')
                  )";
    } elseif (User('PROFILE') == 'parent') {
        $parent_id = OpenSISNormalizeId(UserID());

        if (!$parent_id) {
            return false;
        }

        $sql .= " AND COURSE_PERIOD_ID IN (
                    SELECT s.COURSE_PERIOD_ID
                      FROM schedule s
                      JOIN students_join_people sjp ON sjp.STUDENT_ID=s.STUDENT_ID
                     WHERE sjp.PERSON_ID='" . $parent_id . "'
                       AND s.SCHOOL_ID='" . UserSchool() . "'
                       AND s.SYEAR='" . UserSyear() . "'
                       AND s.START_DATE<='" . $today . "'
                       AND (s.END_DATE IS NULL OR s.END_DATE='0000-00-00' OR s.END_DATE>='" . $today . "')
                  )";
    } elseif (User('PROFILE') != 'admin') {
        return false;
    }

    return (count(DBGet(DBQuery($sql))) > 0);
}

function OpenSISRequireCoursePeriodAccess($course_period_id)
{
    $course_period_id = OpenSISNormalizeId($course_period_id);

    if (!$course_period_id || !OpenSISUserCanAccessCoursePeriod($course_period_id)) {
        OpenSISDenyAccess();
    }

    return $course_period_id;
}

function OpenSISGetAuthorizedStudentIds()
{
    static $cache = array();

    $cache_key = User('PROFILE') . '|' . UserSchool() . '|' . UserSyear() . '|' . UserCoursePeriod() . '|' . UserID() . '|' . OpenSISNormalizeId($_SESSION['STUDENT_ID']);

    if (array_key_exists($cache_key, $cache)) {
        return $cache[$cache_key];
    }

    $today = DBDate();
    $student_ids = array();

    if (User('PROFILE') == 'student') {
        $student_id = OpenSISNormalizeId($_SESSION['STUDENT_ID']);

        if ($student_id) {
            $student_ids[] = $student_id;
        }
    } elseif (User('PROFILE') == 'parent') {
        $parent_id = OpenSISNormalizeId(UserID());
        $student_RET = DBGet(DBQuery(
            "SELECT DISTINCT se.STUDENT_ID
               FROM student_enrollment se
               JOIN students_join_people sjp ON sjp.STUDENT_ID=se.STUDENT_ID
              WHERE sjp.PERSON_ID='" . $parent_id . "'
                AND se.SYEAR='" . UserSyear() . "'
                AND se.START_DATE<='" . $today . "'
                AND (se.END_DATE IS NULL OR se.END_DATE='0000-00-00' OR se.END_DATE>='" . $today . "')
              ORDER BY se.STUDENT_ID"
        ));

        foreach ($student_RET as $student) {
            $student_ids[] = (int) $student['STUDENT_ID'];
        }
    } elseif (User('PROFILE') == 'teacher') {
        $course_period_id = OpenSISNormalizeId(UserCoursePeriod());

        if ($course_period_id && OpenSISUserCanAccessCoursePeriod($course_period_id)) {
            $student_RET = DBGet(DBQuery(
                "SELECT DISTINCT STUDENT_ID
                   FROM schedule
                  WHERE COURSE_PERIOD_ID='" . $course_period_id . "'
                    AND SCHOOL_ID='" . UserSchool() . "'
                    AND SYEAR='" . UserSyear() . "'
                    AND START_DATE<='" . $today . "'
                    AND (END_DATE IS NULL OR END_DATE='0000-00-00' OR END_DATE>='" . $today . "')
                  ORDER BY STUDENT_ID"
            ));

            foreach ($student_RET as $student) {
                $student_ids[] = (int) $student['STUDENT_ID'];
            }
        }
    }

    $cache[$cache_key] = array_values(array_unique(array_filter($student_ids)));

    return $cache[$cache_key];
}

function OpenSISGetStudentCurrentSchool($student_id)
{
    $student_id = OpenSISNormalizeId($student_id);

    if (!$student_id) {
        return 0;
    }

    $today = DBDate();
    $school_RET = DBGet(DBQuery(
        "SELECT SCHOOL_ID
           FROM student_enrollment
          WHERE STUDENT_ID='" . $student_id . "'
            AND SYEAR='" . UserSyear() . "'
            AND START_DATE<='" . $today . "'
            AND (END_DATE IS NULL OR END_DATE='0000-00-00' OR END_DATE>='" . $today . "')
          ORDER BY ID DESC
          LIMIT 1"
    ));

    if (!$school_RET[1]['SCHOOL_ID']) {
        $school_RET = DBGet(DBQuery(
            "SELECT SCHOOL_ID
               FROM student_enrollment
              WHERE STUDENT_ID='" . $student_id . "'
                AND SYEAR='" . UserSyear() . "'
              ORDER BY ID DESC
              LIMIT 1"
        ));
    }

    return (int) $school_RET[1]['SCHOOL_ID'];
}

function OpenSISUserCanAccessStudent($student_id)
{
    $student_id = OpenSISNormalizeId($student_id);

    if (!$student_id) {
        return false;
    }

    if (User('PROFILE') == 'admin') {
        return (count(DBGet(DBQuery("SELECT STUDENT_ID FROM students WHERE STUDENT_ID='" . $student_id . "' LIMIT 1"))) > 0);
    }

    return in_array($student_id, OpenSISGetAuthorizedStudentIds());
}

function OpenSISResolveAuthorizedStudentId($requested_student_id = '')
{
    $requested_student_id = OpenSISNormalizeId($requested_student_id);
    $session_student_id = OpenSISNormalizeId(isset($_SESSION['student_id']) ? $_SESSION['student_id'] : 0);

    if (User('PROFILE') == 'admin') {
        return ($requested_student_id ? $requested_student_id : $session_student_id);
    }

    if ($requested_student_id && OpenSISUserCanAccessStudent($requested_student_id)) {
        return $requested_student_id;
    }

    if ($session_student_id && OpenSISUserCanAccessStudent($session_student_id)) {
        return $session_student_id;
    }

    $student_ids = OpenSISGetAuthorizedStudentIds();

    return ($student_ids[0] ? $student_ids[0] : 0);
}

function OpenSISRequireStudentAccess($student_id)
{
    $student_id = OpenSISNormalizeId($student_id);

    if (!$student_id || !OpenSISUserCanAccessStudent($student_id)) {
        OpenSISDenyAccess();
    }

    return $student_id;
}
