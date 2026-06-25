-- Give the application user enough privileges for the web installer, which
-- can CREATE / DROP the database and creates triggers, procedures and events.
CREATE USER IF NOT EXISTS 'opensis'@'%' IDENTIFIED BY 'opensis_pw';
GRANT ALL PRIVILEGES ON *.* TO 'opensis'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
