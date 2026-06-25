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

function sqlSecurityFilter($variableName = '', $dbAvailable = 'yes')
{
    // Global connection object for database (if available)
    if ($dbAvailable == 'yes') global $connection;
 
    // Initialize variables
    $variable = $variableName;
    $variableType = gettype($variable);
 
    // SQL Injection patterns to check
    $injectionParams = array(
        'union ', 'select ', 'concat', 'concat_ws', 'create ', 'update ', 'insert ',
        'delete ', 'extract ', 'drop ', 'truncate ', 'where ', 'trim ', 'format ', 
        'union%20', 'select%20', 'create%20', 'update%20', 'insert%20', 'delete%20', 
        'extract%20', 'drop%20', 'truncate%20', 'where%20', 'trim%20', 'format%20', 
        ';', '\'', '--', '../', '..%2f', 'skip-grant-tables', 'sleep(', 'sleep ('
    );
 
    switch ($variableType) {
        case 'string':
            // If the variable is a string, sanitize and escape it
            if ($variable != '') {
                $check_1 = strip_tags($variable); // Strip HTML tags
                $check_2 = addslashes($check_1); // Escape special characters for SQL
                if ($dbAvailable == 'yes') {
                    // Escape using mysqli_real_escape_string if connected to DB
                    $check_3 = mysqli_real_escape_string($connection, $check_2);
                } else {
                    $check_3 = $check_2;
                }
 
                // Check for SQL Injection keywords in the string
                foreach ($injectionParams as $one_check) {
                    if (strpos(strtolower($check_3), $one_check) !== false) {
                        return ''; // Return empty string if suspicious content is found
                    }
                }
 
                // Return the sanitized string with HTML entities encoded to prevent XSS
                return htmlentities($check_3, ENT_QUOTES, 'UTF-8');
            } else {
                return '';
            }
 
        case 'array':
            // Handle arrays by recursively sanitizing keys and values
            if (!empty($variable)) {
                $filter_data = array();
                foreach ($variable as $onekey => $oneval) {
                    // Sanitize key
                    $k_check_1 = strip_tags($onekey);
                    $k_check_2 = addslashes($k_check_1);
                    if ($dbAvailable == 'yes') {
                        $k_check_3 = mysqli_real_escape_string($connection, $k_check_2);
                    } else {
                        $k_check_3 = $k_check_2;
                    }
 
                    // Handle nested arrays recursively (PHP 8.x fix)
                    if (is_array($oneval)) {
                        // Recursively sanitize nested arrays
                        $filter_data[$k_check_3] = sqlSecurityFilter($oneval, $dbAvailable);
                        continue;
                    }
 
                    // Sanitize value if it is a string
                    $v_check_3 = '';
                    if (is_string($oneval)) {
                        $v_check_1 = strip_tags($oneval);
                        $v_check_2 = addslashes($v_check_1);
                        if ($dbAvailable == 'yes') {
                            $v_check_3 = mysqli_real_escape_string($connection, $v_check_2);
                        } else {
                            $v_check_3 = $v_check_2;
                        }
                    }
 
                    // Check key and value for SQLi patterns
                    $checker_k = 0;
                    $checker_v = 0;
                    foreach ($injectionParams as $one_check) {
                        if (strpos(strtolower($k_check_3), $one_check) !== false) {
                            $checker_k++;
                        }
                        if (is_string($oneval) && strpos(strtolower($v_check_3), $one_check) !== false) {
                            $checker_v++;
                        }
                    }
 
                    // If any key or value is suspicious, remove it
                    if ($checker_k != 0 || $checker_v != 0) {
                        unset($variable[$onekey]);
                    } else {
                        // Otherwise, encode it safely
                        unset($variable[$onekey]);
                        $filter_data[$k_check_3] = htmlentities($v_check_3, ENT_QUOTES, 'UTF-8');
                    }
                }
                return $filter_data;
            } else {
                return array();
            }
 
        case 'object':
            // Handle objects similarly to arrays
            if (!empty((array)$variable)) {
                $filter_data = array();
                foreach ($variable as $onekey => $oneval) {
                    $k_check_1 = strip_tags($onekey);
                    $k_check_2 = addslashes($k_check_1);
                    if ($dbAvailable == 'yes') {
                        $k_check_3 = mysqli_real_escape_string($connection, $k_check_2);
                    } else {
                        $k_check_3 = $k_check_2;
                    }
 
                    // Sanitize object values if they are strings
                    if (is_string($oneval)) {
                        $v_check_1 = strip_tags($oneval);
                        $v_check_2 = addslashes($v_check_1);
                        if ($dbAvailable == 'yes') {
                            $v_check_3 = mysqli_real_escape_string($connection, $v_check_2);
                        } else {
                            $v_check_3 = $v_check_2;
                        }
                    }
 
                    // Check object properties for SQL injection patterns
                    $checker_k = 0;
                    $checker_v = 0;
                    foreach ($injectionParams as $one_check) {
                        if (strpos(strtolower($k_check_3), $one_check) !== false) {
                            $checker_k++;
                        }
                        if (is_string($oneval) && strpos(strtolower($v_check_3), $one_check) !== false) {
                            $checker_v++;
                        }
                    }
 
                    // If any property or value is suspicious, remove it
                    if ($checker_k != 0 || $checker_v != 0) {
                        unset($variable->$onekey);
                    } else {
                        // Otherwise, safely store the cleaned data
                        unset($variable->$onekey);
                        $filter_data[$k_check_3] = htmlentities($v_check_3, ENT_QUOTES, 'UTF-8');
                    }
                }
                return $filter_data;
            } else {
                return array();
            }
 
        default:
            return '';
    }
}
