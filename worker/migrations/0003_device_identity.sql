-- 旧访问记录保留 NULL，由管理员登记的设备表决定是否属于本人。
ALTER TABLE visits ADD COLUMN device_id TEXT;

CREATE INDEX IF NOT EXISTS visits_device_id_idx ON visits (device_id);

CREATE TABLE IF NOT EXISTS owner_devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
