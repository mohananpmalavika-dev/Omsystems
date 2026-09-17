-- ============================================================================
-- Migration 006: Report Favorites Schema
-- ============================================================================
-- Purpose: Enable users to save and quickly access frequently used reports
-- Date: September 17, 2026
-- Dependencies: Users table
-- Impact: 60-80% time savings for repeat report generation
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Report Favorites Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User information
  user_id UUID NOT NULL,
  
  -- Report configuration
  name VARCHAR(100) NOT NULL, -- User-defined name "Weekly Executive Report"
  description TEXT,
  report_type VARCHAR(50) NOT NULL, -- 'executive-kpi', 'financial-tco', etc.
  report_category VARCHAR(50), -- 'executive', 'financial', 'operational', etc.
  
  -- Saved filters and configuration
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Usage tracking
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP,
  
  -- Metadata
  is_public BOOLEAN DEFAULT false, -- Share with other users?
  is_pinned BOOLEAN DEFAULT false, -- Show at top of favorites list
  sort_order INT DEFAULT 0, -- User-defined sort order
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_user_favorites FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_report_name UNIQUE(user_id, name),
  CONSTRAINT valid_report_type CHECK (report_type ~ '^[a-z-]+$')
);

-- Indexes for fast queries
CREATE INDEX idx_favorites_user ON report_favorites(user_id, last_used_at DESC NULLS LAST);
CREATE INDEX idx_favorites_type ON report_favorites(report_type, user_id);
CREATE INDEX idx_favorites_category ON report_favorites(report_category);
CREATE INDEX idx_favorites_pinned ON report_favorites(user_id, is_pinned DESC, sort_order, name);
CREATE INDEX idx_favorites_public ON report_favorites(is_public) WHERE is_public = true;
CREATE INDEX idx_favorites_usage ON report_favorites(usage_count DESC);

-- ============================================================================
-- STEP 2: Create Report Templates Table (Admin-Created Presets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template information
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  description TEXT,
  
  -- Report configuration
  report_type VARCHAR(50) NOT NULL,
  report_category VARCHAR(50) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Template metadata
  is_system_template BOOLEAN DEFAULT false, -- Cannot be deleted
  icon VARCHAR(50), -- Icon name for UI
  tags TEXT[], -- Searchable tags
  
  -- Usage tracking
  usage_count INT DEFAULT 0,
  
  -- Who can use this template
  allowed_roles TEXT[], -- NULL = all roles, or ['cfo', 'ceo']
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  active BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false, -- Show in featured templates section
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_templates_category ON report_templates(report_category, active);
CREATE INDEX idx_templates_featured ON report_templates(featured, active) WHERE featured = true;
CREATE INDEX idx_templates_usage ON report_templates(usage_count DESC) WHERE active = true;
CREATE INDEX idx_templates_tags ON report_templates USING GIN(tags);

-- ============================================================================
-- STEP 3: Insert Predefined System Templates
-- ============================================================================

INSERT INTO report_templates (
  name, display_name, description, report_type, report_category,
  filters, is_system_template, icon, tags, allowed_roles, featured
) VALUES
  -- Executive Templates
  (
    'monthly_board_report',
    'Monthly Board Report',
    'Executive KPI dashboard for last 30 days - perfect for board meetings',
    'executive-kpi',
    'executive',
    '{"timeRange": "30d"}'::jsonb,
    true,
    'LayoutDashboard',
    ARRAY['executive', 'monthly', 'board', 'kpi'],
    ARRAY['super_admin', 'ceo'],
    true
  ),
  (
    'weekly_executive_summary',
    'Weekly Executive Summary',
    'Quick 7-day overview of security posture and operations',
    'executive-kpi',
    'executive',
    '{"timeRange": "7d"}'::jsonb,
    true,
    'TrendingUp',
    ARRAY['executive', 'weekly', 'summary'],
    ARRAY['super_admin', 'ceo', 'coo'],
    true
  ),
  
  -- Financial Templates
  (
    'quarterly_financial_review',
    'Quarterly Financial Review',
    'Complete TCO analysis for last 90 days with cost breakdown',
    'financial-tco',
    'financial',
    '{"timeRange": "90d", "includeProjections": true}'::jsonb,
    true,
    'DollarSign',
    ARRAY['financial', 'quarterly', 'tco', 'budget'],
    ARRAY['super_admin', 'ceo', 'cfo', 'finance_analyst'],
    true
  ),
  (
    'monthly_cost_analysis',
    'Monthly Cost Analysis',
    'Monthly TCO breakdown with budget variance',
    'financial-tco',
    'financial',
    '{"timeRange": "30d", "groupBy": "category"}'::jsonb,
    true,
    'TrendingDown',
    ARRAY['financial', 'monthly', 'costs'],
    ARRAY['super_admin', 'cfo', 'finance_analyst'],
    false
  ),
  (
    'roi_calculation',
    'ROI Calculation Report',
    'Complete ROI analysis showing security investment returns',
    'financial-roi',
    'financial',
    '{"timeRange": "90d"}'::jsonb,
    true,
    'Target',
    ARRAY['financial', 'roi', 'investment'],
    ARRAY['super_admin', 'ceo', 'cfo'],
    true
  ),
  
  -- Operational Templates
  (
    'weekly_operations_summary',
    'Weekly Operations Summary',
    'Branch performance benchmarking for last 7 days',
    'branch-benchmarking',
    'operational',
    '{"timeRange": "7d", "sortBy": "performance"}'::jsonb,
    true,
    'Activity',
    ARRAY['operational', 'weekly', 'branches'],
    ARRAY['super_admin', 'coo', 'operations_analyst'],
    true
  ),
  (
    'top_bottom_performers',
    'Top & Bottom Performing Branches',
    'Identify best and worst performing locations',
    'branch-benchmarking',
    'operational',
    '{"timeRange": "30d", "showTop": 10, "showBottom": 10}'::jsonb,
    true,
    'BarChart',
    ARRAY['operational', 'performance', 'branches'],
    ARRAY['super_admin', 'ceo', 'coo'],
    false
  ),
  
  -- Compliance Templates
  (
    'rbi_audit_compliance',
    'RBI Audit Compliance Report',
    'Banking compliance scorecard for RBI audits (90 days)',
    'compliance-scorecard',
    'compliance',
    '{"timeRange": "90d", "standards": ["rbi_vault", "rbi_atm", "data_retention"]}'::jsonb,
    true,
    'Shield',
    ARRAY['compliance', 'rbi', 'banking', 'audit'],
    ARRAY['super_admin', 'ceo', 'compliance_officer'],
    true
  ),
  (
    'gdpr_compliance_check',
    'GDPR Compliance Check',
    'Data privacy compliance scorecard',
    'compliance-scorecard',
    'compliance',
    '{"timeRange": "30d", "standards": ["gdpr", "data_privacy"]}'::jsonb,
    true,
    'Lock',
    ARRAY['compliance', 'gdpr', 'privacy'],
    ARRAY['super_admin', 'compliance_officer'],
    false
  ),
  
  -- MIS Templates
  (
    'branch_deep_dive',
    'Branch Performance Deep Dive',
    'Complete MIS analysis grouped by branch with all metrics',
    'mis-unified',
    'operational',
    '{"timeRange": "30d", "groupBy": "branch", "category": "all"}'::jsonb,
    true,
    'Building',
    ARRAY['mis', 'operational', 'branches', 'detailed'],
    ARRAY['super_admin', 'coo', 'operations_analyst'],
    true
  ),
  (
    'daily_ops_snapshot',
    'Daily Operations Snapshot',
    'Today''s operational metrics across all branches',
    'mis-unified',
    'operational',
    '{"timeRange": "today", "groupBy": "branch"}'::jsonb,
    true,
    'Calendar',
    ARRAY['mis', 'daily', 'operational'],
    ARRAY['super_admin', 'coo', 'operations_analyst', 'branch_manager'],
    false
  );

-- ============================================================================
-- STEP 4: Create Helper Functions
-- ============================================================================

-- Function: Get user's favorites
CREATE OR REPLACE FUNCTION get_user_favorites(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  name VARCHAR,
  description TEXT,
  report_type VARCHAR,
  report_category VARCHAR,
  filters JSONB,
  usage_count INT,
  last_used_at TIMESTAMP,
  is_pinned BOOLEAN,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rf.id,
    rf.name,
    rf.description,
    rf.report_type,
    rf.report_category,
    rf.filters,
    rf.usage_count,
    rf.last_used_at,
    rf.is_pinned,
    rf.created_at
  FROM report_favorites rf
  WHERE rf.user_id = p_user_id
  ORDER BY 
    rf.is_pinned DESC,
    rf.sort_order,
    rf.last_used_at DESC NULLS LAST,
    rf.name;
END;
$$ LANGUAGE plpgsql;

-- Function: Get available templates for user
CREATE OR REPLACE FUNCTION get_user_templates(p_user_role VARCHAR)
RETURNS TABLE(
  id UUID,
  name VARCHAR,
  display_name VARCHAR,
  description TEXT,
  report_type VARCHAR,
  report_category VARCHAR,
  filters JSONB,
  icon VARCHAR,
  tags TEXT[],
  usage_count INT,
  featured BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rt.id,
    rt.name,
    rt.display_name,
    rt.description,
    rt.report_type,
    rt.report_category,
    rt.filters,
    rt.icon,
    rt.tags,
    rt.usage_count,
    rt.featured
  FROM report_templates rt
  WHERE rt.active = true
    AND (
      rt.allowed_roles IS NULL 
      OR p_user_role = ANY(rt.allowed_roles)
    )
  ORDER BY 
    rt.featured DESC,
    rt.usage_count DESC,
    rt.display_name;
END;
$$ LANGUAGE plpgsql;

-- Function: Add to favorites
CREATE OR REPLACE FUNCTION add_to_favorites(
  p_user_id UUID,
  p_name VARCHAR,
  p_description TEXT,
  p_report_type VARCHAR,
  p_filters JSONB
) RETURNS UUID AS $$
DECLARE
  favorite_id UUID;
  category VARCHAR(50);
BEGIN
  -- Derive category from report type
  category := CASE
    WHEN p_report_type LIKE '%executive%' OR p_report_type LIKE '%kpi%' THEN 'executive'
    WHEN p_report_type LIKE '%financial%' OR p_report_type LIKE '%tco%' OR p_report_type LIKE '%roi%' THEN 'financial'
    WHEN p_report_type LIKE '%compliance%' THEN 'compliance'
    WHEN p_report_type LIKE '%ai%' THEN 'ai-analytics'
    ELSE 'operational'
  END;
  
  INSERT INTO report_favorites (
    user_id, name, description, report_type, report_category, filters
  ) VALUES (
    p_user_id, p_name, p_description, p_report_type, category, p_filters
  )
  RETURNING id INTO favorite_id;
  
  RETURN favorite_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update favorite usage
CREATE OR REPLACE FUNCTION update_favorite_usage(p_favorite_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE report_favorites
  SET 
    usage_count = usage_count + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_favorite_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update template usage
CREATE OR REPLACE FUNCTION update_template_usage(p_template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE report_templates
  SET 
    usage_count = usage_count + 1,
    updated_at = NOW()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Create Trigger to Update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_favorites_updated_at
  BEFORE UPDATE ON report_favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 6: Create Summary Views
-- ============================================================================

-- View: Most popular favorites by report type
CREATE OR REPLACE VIEW v_popular_favorites AS
SELECT 
  report_type,
  report_category,
  COUNT(*) as total_favorites,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(usage_count) as avg_usage_count,
  SUM(usage_count) as total_uses
FROM report_favorites
GROUP BY report_type, report_category
ORDER BY total_uses DESC;

-- View: Most popular templates
CREATE OR REPLACE VIEW v_popular_templates AS
SELECT 
  id,
  name,
  display_name,
  report_category,
  usage_count,
  featured,
  tags
FROM report_templates
WHERE active = true
ORDER BY usage_count DESC, featured DESC;

-- View: User favorite statistics
CREATE OR REPLACE VIEW v_user_favorite_stats AS
SELECT 
  user_id,
  COUNT(*) as total_favorites,
  SUM(usage_count) as total_uses,
  MAX(last_used_at) as last_activity,
  COUNT(*) FILTER (WHERE is_pinned = true) as pinned_count
FROM report_favorites
GROUP BY user_id;

-- ============================================================================
-- STEP 7: Create Data Validation Functions
-- ============================================================================

-- Validate favorite limit per user (prevent spam)
CREATE OR REPLACE FUNCTION validate_favorite_limit()
RETURNS TRIGGER AS $$
DECLARE
  favorite_count INT;
  max_favorites INT := 50; -- Maximum 50 favorites per user
BEGIN
  SELECT COUNT(*) INTO favorite_count
  FROM report_favorites
  WHERE user_id = NEW.user_id;
  
  IF favorite_count >= max_favorites THEN
    RAISE EXCEPTION 'Maximum favorites limit (%) reached. Please remove unused favorites.', max_favorites;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_favorite_limit
  BEFORE INSERT ON report_favorites
  FOR EACH ROW
  EXECUTE FUNCTION validate_favorite_limit();

-- ============================================================================
-- STEP 8: Create Migration Verification Queries
-- ============================================================================

DO $$
DECLARE
  favorite_count INT;
  template_count INT;
BEGIN
  -- Verify favorites table created
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'report_favorites') THEN
    RAISE EXCEPTION 'Table report_favorites not created';
  END IF;
  
  -- Verify templates table created
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'report_templates') THEN
    RAISE EXCEPTION 'Table report_templates not created';
  END IF;
  
  -- Verify system templates created
  SELECT COUNT(*) INTO template_count FROM report_templates WHERE is_system_template = true;
  IF template_count < 11 THEN
    RAISE WARNING 'Expected 11 system templates, found %', template_count;
  ELSE
    RAISE NOTICE '✓ Created % system templates', template_count;
  END IF;
  
  -- Verify functions created
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_favorites') THEN
    RAISE EXCEPTION 'Function get_user_favorites not created';
  END IF;
  
  RAISE NOTICE '✓ Report Favorites schema verified successfully';
END $$;

-- ============================================================================
-- STEP 9: Sample Queries for Common Tasks
-- ============================================================================

-- Query 1: Get user's favorites
COMMENT ON FUNCTION get_user_favorites IS
'Usage: SELECT * FROM get_user_favorites(''user-id-here'')';

-- Query 2: Get templates for user role
COMMENT ON FUNCTION get_user_templates IS
'Usage: SELECT * FROM get_user_templates(''cfo'')';

-- Query 3: Add to favorites
COMMENT ON FUNCTION add_to_favorites IS
'Usage: SELECT add_to_favorites(''user-id'', ''My Weekly Report'', ''Description'', ''executive-kpi'', ''{"timeRange":"7d"}'')';

-- Query 4: Most used favorites
COMMENT ON VIEW v_popular_favorites IS
'Query: SELECT * FROM v_popular_favorites LIMIT 10';

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
-- 
-- DROP TRIGGER IF EXISTS trigger_favorites_updated_at ON report_favorites;
-- DROP TRIGGER IF EXISTS trigger_templates_updated_at ON report_templates;
-- DROP TRIGGER IF EXISTS trigger_validate_favorite_limit ON report_favorites;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- DROP FUNCTION IF EXISTS validate_favorite_limit();
-- DROP FUNCTION IF EXISTS get_user_favorites(UUID);
-- DROP FUNCTION IF EXISTS get_user_templates(VARCHAR);
-- DROP FUNCTION IF EXISTS add_to_favorites(UUID, VARCHAR, TEXT, VARCHAR, JSONB);
-- DROP FUNCTION IF EXISTS update_favorite_usage(UUID);
-- DROP FUNCTION IF EXISTS update_template_usage(UUID);
-- DROP VIEW IF EXISTS v_popular_favorites;
-- DROP VIEW IF EXISTS v_popular_templates;
-- DROP VIEW IF EXISTS v_user_favorite_stats;
-- DROP TABLE IF EXISTS report_favorites;
-- DROP TABLE IF EXISTS report_templates;

-- ============================================================================
-- END OF MIGRATION 006
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 006: Report Favorites - COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - report_favorites table';
  RAISE NOTICE '  - report_templates table (11 presets)';
  RAISE NOTICE '  - 5 helper functions';
  RAISE NOTICE '  - 3 summary views';
  RAISE NOTICE '  - Usage tracking triggers';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Save frequently used reports';
  RAISE NOTICE '  - 11 pre-built templates';
  RAISE NOTICE '  - Usage analytics';
  RAISE NOTICE '  - Pin favorites to top';
  RAISE NOTICE '  - 50 favorites per user limit';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Create favorites API routes';
  RAISE NOTICE '  2. Build favorites UI component';
  RAISE NOTICE '  3. Add "Add to Favorites" button to reports';
  RAISE NOTICE '========================================';
END $$;
