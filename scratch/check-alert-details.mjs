import { runRemote } from './remote-exec.mjs';

const cmd = `
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, title, rule_id, camera_id, confidence, created_at FROM analytics_alerts WHERE id = 'a09277d3-0c6e-40e6-846f-44ad84af3929';"
sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "SELECT id, name, detection_type, enabled FROM analytics_rules WHERE id = (SELECT rule_id FROM analytics_alerts WHERE id = 'a09277d3-0c6e-40e6-846f-44ad84af3929');"
`;

console.log(runRemote(cmd));
