import { execSync } from 'node:child_process';

const duplicateNodeIds = [
  '264e7203-1399-46fa-a651-750a3ab22499',
  'a69b476e-b355-4e50-bce9-a52cd0ff68ab',
  '7939cb15-4426-4463-a519-031644a7edb3',
  'edf30416-b410-4e34-b3d2-aa265075b2af',
  '1a0fd477-e767-4c80-95f9-eb5794e93acc',
  '93f70b14-2def-47f1-8043-505b59deed95',
  'f3e66c24-3327-43bd-a13a-b887385ff816',
  '9cdc53e0-73bc-437f-b38d-adab5aae3318'
];

const checkScript = `
DO $$
DECLARE
    r RECORD;
    cnt BIGINT;
    dup_node_ids UUID[] := ARRAY['${duplicateNodeIds.join("','")}']::uuid[];
BEGIN
    FOR r IN (
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'resource_nodes'
    ) LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE %I = ANY($1)', r.table_name, r.column_name)
        INTO cnt
        USING dup_node_ids;
        IF cnt > 0 THEN
            RAISE NOTICE 'Table % (col %) has % rows referencing duplicate nodes', r.table_name, r.column_name, cnt;
        END IF;
    END LOOP;
END $$;
`;

const b64 = Buffer.from(checkScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
