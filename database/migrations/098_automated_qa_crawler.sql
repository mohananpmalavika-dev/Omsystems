-- 098_automated_qa_crawler.sql
-- KryptoVision Automated User Flow Recorder & QA Crawler Subsystem

CREATE TABLE IF NOT EXISTS qa_runs (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  starting_path TEXT NOT NULL DEFAULT '/',
  user_role VARCHAR(64) NOT NULL DEFAULT 'admin',
  username VARCHAR(255),
  password_encrypted TEXT,
  browser VARCHAR(32) NOT NULL DEFAULT 'chromium',
  device_profile VARCHAR(64) NOT NULL DEFAULT 'Desktop 1920x1080',
  viewport_width INT NOT NULL DEFAULT 1920,
  viewport_height INT NOT NULL DEFAULT 1080,
  max_pages INT NOT NULL DEFAULT 250,
  max_depth INT NOT NULL DEFAULT 10,
  page_timeout_sec INT NOT NULL DEFAULT 30,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  overall_score INT,
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  summary_stats JSONB DEFAULT '{}'::jsonb,
  auth_status VARCHAR(64) DEFAULT 'NOT_REQUIRED',
  error_message TEXT,
  tenant_id VARCHAR(64),
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_status ON qa_runs(status);
CREATE INDEX IF NOT EXISTS idx_qa_runs_created_at ON qa_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_runs_target_url ON qa_runs(target_url);

CREATE TABLE IF NOT EXISTS qa_pages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  page_hash VARCHAR(64),
  depth INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'NOT_TESTED',
  load_time_ms INT,
  dom_content_loaded_ms INT,
  network_idle_ms INT,
  is_blank BOOLEAN NOT NULL DEFAULT FALSE,
  screenshot_path TEXT,
  element_count INT NOT NULL DEFAULT 0,
  interactive_count INT NOT NULL DEFAULT 0,
  tested_interactive_count INT NOT NULL DEFAULT 0,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  crawled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qa_pages_run_id ON qa_pages(run_id);
CREATE INDEX IF NOT EXISTS idx_qa_pages_url ON qa_pages(run_id, url);

CREATE TABLE IF NOT EXISTS qa_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES qa_pages(id) ON DELETE CASCADE,
  action_type VARCHAR(32) NOT NULL,
  selector TEXT,
  element_text TEXT,
  aria_label TEXT,
  role VARCHAR(64),
  is_safe BOOLEAN NOT NULL DEFAULT TRUE,
  safety_classification VARCHAR(32) NOT NULL DEFAULT 'SAFE',
  status VARCHAR(32) NOT NULL DEFAULT 'SKIPPED',
  load_time_ms INT,
  screenshot_before TEXT,
  screenshot_after TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_actions_run_id ON qa_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_qa_actions_page_id ON qa_actions(page_id);

CREATE TABLE IF NOT EXISTS qa_edges (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  from_page_id TEXT NOT NULL REFERENCES qa_pages(id) ON DELETE CASCADE,
  to_page_id TEXT NOT NULL REFERENCES qa_pages(id) ON DELETE CASCADE,
  action_id TEXT REFERENCES qa_actions(id) ON DELETE SET NULL,
  label TEXT,
  edge_type VARCHAR(32) NOT NULL DEFAULT 'navigation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_edges_run_id ON qa_edges(run_id);
CREATE INDEX IF NOT EXISTS idx_qa_edges_from_to ON qa_edges(from_page_id, to_page_id);

CREATE TABLE IF NOT EXISTS qa_issues (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES qa_pages(id) ON DELETE CASCADE,
  severity VARCHAR(16) NOT NULL,
  category VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  page_url TEXT,
  action_description TEXT,
  expected TEXT,
  actual TEXT,
  screenshot_path TEXT,
  video_timestamp_sec FLOAT,
  trace_path TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_issues_run_id ON qa_issues(run_id);
CREATE INDEX IF NOT EXISTS idx_qa_issues_severity ON qa_issues(run_id, severity);
CREATE INDEX IF NOT EXISTS idx_qa_issues_category ON qa_issues(run_id, category);

CREATE TABLE IF NOT EXISTS qa_console_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_url TEXT,
  severity VARCHAR(16) NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack TEXT,
  occurrences INT NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_console_events_run_id ON qa_console_events(run_id);

CREATE TABLE IF NOT EXISTS qa_network_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_url TEXT,
  method VARCHAR(16),
  url TEXT NOT NULL,
  status INT,
  duration_ms INT,
  resource_type VARCHAR(32),
  failure_reason TEXT,
  occurrences INT NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_network_events_run_id ON qa_network_events(run_id);

CREATE TABLE IF NOT EXISTS qa_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  artifact_type VARCHAR(32) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(128),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_artifacts_run_id ON qa_artifacts(run_id);

CREATE TABLE IF NOT EXISTS qa_accessibility_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  impact VARCHAR(16) NOT NULL,
  rule_id VARCHAR(128) NOT NULL,
  description TEXT,
  help_url TEXT,
  nodes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_accessibility_run_id ON qa_accessibility_results(run_id);

CREATE TABLE IF NOT EXISTS qa_performance_metrics (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  dom_content_loaded_ms INT,
  load_ms INT,
  network_idle_ms INT,
  first_meaningful_paint_ms INT,
  rating VARCHAR(16) NOT NULL DEFAULT 'Good',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_performance_run_id ON qa_performance_metrics(run_id);
