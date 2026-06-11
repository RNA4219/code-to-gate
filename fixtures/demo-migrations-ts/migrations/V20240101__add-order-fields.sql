-- Flyway-style migration without transaction signals
-- Triggers: DB_MIGRATION_NO_TRANSACTION_SIGNAL, DB_ROLLBACK_NOT_EVIDENCED

-- No BEGIN/COMMIT wrapper, no transaction safety
-- Dangerous: Multiple statements without transaction protection

ALTER TABLE orders ADD COLUMN status VARCHAR(50);
ALTER TABLE orders ADD COLUMN processed_at TIMESTAMP;
DROP TABLE temp_orders_backup;