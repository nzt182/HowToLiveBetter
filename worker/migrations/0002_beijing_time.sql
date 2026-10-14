-- 只改变时间的文本表示，不改变真实时刻；重复执行不再修改已转换的 +08:00 行。
UPDATE visits
SET visited_at = strftime('%Y-%m-%dT%H:%M:%f', visited_at, '+8 hours') || '+08:00'
WHERE substr(visited_at, -1) = 'Z'
  AND strftime('%Y-%m-%dT%H:%M:%f', visited_at, '+8 hours') IS NOT NULL;
