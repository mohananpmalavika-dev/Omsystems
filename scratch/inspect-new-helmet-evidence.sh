set -e
sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid <<'SQL'
SELECT id,occurred_at,confidence,model_version,snapshot_reference,metadata FROM analytics_events WHERE id='495a0460-55e4-4937-9ad8-7cc88a8b47bd';
SELECT column_name FROM information_schema.columns WHERE table_name='analytics_evidence_assets' ORDER BY ordinal_position;
SQL
