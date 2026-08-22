-- ============================================
-- Activity Tracking Verification Queries
-- Run these to diagnose tracking issues
-- ============================================

-- 1. Check if ANY sessions exist
SELECT COUNT(*) as total_sessions,
       MIN(login_time) as first_session,
       MAX(login_time) as last_session
FROM user_activity_sessions;

-- 2. Check recent sessions (last 30 days)
SELECT 
  DATE(login_time) as date,
  COUNT(*) as session_count,
  COUNT(DISTINCT user_id) as unique_users
FROM user_activity_sessions
WHERE login_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(login_time)
ORDER BY date DESC;

-- 3. Check if specific user has any activity
SELECT 
  u.display_name,
  u.identity_subject as username,
  COUNT(s.id) as total_sessions,
  MAX(s.login_time) as last_session
FROM users u
LEFT JOIN user_activity_sessions s ON s.user_id = u.id
GROUP BY u.id, u.display_name, u.identity_subject
ORDER BY total_sessions DESC
LIMIT 20;

-- 4. Check page visits
SELECT COUNT(*) as total_page_visits,
       MIN(visit_start_time) as first_visit,
       MAX(visit_start_time) as last_visit
FROM user_page_visits;

-- 5. Check action log
SELECT COUNT(*) as total_actions,
       MIN(action_time) as first_action,
       MAX(action_time) as last_action
FROM user_action_log;

-- 6. Check daily summaries
SELECT summary_date,
       COUNT(*) as users_with_activity,
       SUM(total_sessions) as total_sessions,
       SUM(total_actions) as total_actions
FROM user_activity_daily_summary
WHERE summary_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY summary_date
ORDER BY summary_date DESC;

-- 7. Check current online users
SELECT * FROM user_current_activity
WHERE is_online = true;

-- 8. Check active sessions (not logged out)
SELECT 
  s.*,
  u.display_name,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.last_activity_time))::INT as seconds_since_activity
FROM user_activity_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.logout_time IS NULL
ORDER BY s.last_activity_time DESC;

-- 9. Check if tracking is working for a specific date
SELECT 
  's.summary_date',
  u.display_name,
  s.total_sessions,
  s.total_actions,
  s.total_page_visits,
  s.control_room_sessions
FROM user_activity_daily_summary s
JOIN users u ON u.id = s.user_id
WHERE s.summary_date = '2025-02-08'  -- Adjust this date
ORDER BY s.total_sessions DESC;

-- 10. Check if heartbeat is working
SELECT 
  user_id,
  session_id,
  last_activity_time,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity_time))::INT as seconds_ago
FROM user_current_activity
ORDER BY last_activity_time DESC;
