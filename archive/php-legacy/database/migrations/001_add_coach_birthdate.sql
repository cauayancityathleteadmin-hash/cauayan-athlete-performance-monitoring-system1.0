-- Add the field required by coach registration to existing installations.
SET @has_birthdate := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'coaches'
      AND COLUMN_NAME = 'birthdate'
);
SET @add_birthdate_sql := IF(
    @has_birthdate = 0,
    'ALTER TABLE coaches ADD COLUMN birthdate DATE NULL AFTER suffix',
    'SELECT 1'
);
PREPARE add_birthdate FROM @add_birthdate_sql;
EXECUTE add_birthdate;
DEALLOCATE PREPARE add_birthdate;

UPDATE coaches SET birthdate = '2000-01-01' WHERE birthdate IS NULL;
ALTER TABLE coaches MODIFY COLUMN birthdate DATE NOT NULL;
