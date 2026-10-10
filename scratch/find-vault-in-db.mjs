import { execSync } from 'child_process';

const sql = `
DO $$
DECLARE
    r RECORD;
    t text;
    sql_text text;
    cnt bigint;
BEGIN
    FOR r IN (
        SELECT table_schema, table_name, column_name 
        FROM information_schema.columns 
        WHERE data_type IN ('text', 'character varying', 'jsonb')
          AND table_schema = 'public'
    ) LOOP
        BEGIN
            sql_text := format('SELECT count(*) FROM %I.%I WHERE %I::text ILIKE ''%%vault%%''', 
                               r.table_schema, r.table_name, r.column_name);
            EXECUTE sql_text INTO cnt;
            IF cnt > 0 THEN
                RAISE NOTICE 'Found % in %.%: %', cnt, r.table_name, r.column_name, cnt;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
