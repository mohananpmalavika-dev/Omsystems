import { execSync } from 'node:child_process';

const duplicateIds = [
  '9c8c0914-452c-44a3-8ca3-7e07482fbbce',
  'b11c23c5-c0e2-49c4-bcb7-19bcfebbcd66',
  'fb9fbf75-4009-4ef1-9e13-a85d4042f410',
  '6a949b74-113a-4545-9566-3813fd96540b',
  'c5a1b894-900e-486d-a2dc-1ff1e6b956fc',
  '0ab3ebd0-505a-4752-b327-006f208e209e',
  'eda4dbac-3fc9-4b83-8e65-d1993dbb0be8',
  'b89d7170-5982-41b5-9a8a-274ddc31b836'
];

const checkScript = `
DO $$
DECLARE
    r RECORD;
    cnt BIGINT;
    dup_ids UUID[] := ARRAY['${duplicateIds.join("','")}']::uuid[];
BEGIN
    FOR r IN (
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'cameras'
    ) LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE %I = ANY($1)', r.table_name, r.column_name)
        INTO cnt
        USING dup_ids;
        IF cnt > 0 THEN
            RAISE NOTICE 'Table % (col %) has % rows referencing duplicates', r.table_name, r.column_name, cnt;
        END IF;
    END LOOP;
END $$;
`;

const b64 = Buffer.from(checkScript).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
