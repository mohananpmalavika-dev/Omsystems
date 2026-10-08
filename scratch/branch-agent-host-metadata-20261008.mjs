import pg from 'pg';import {loadConfig} from '/app/dist/src/config.js';
const db=new pg.Client({connectionString:loadConfig().DATABASE_URL});await db.connect();
try{
 const columns=(await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='edge_agents' ORDER BY ordinal_position`)).rows.map(r=>r.column_name);
 const agents=(await db.query(`SELECT id,name,hostname,platform,architecture,started_at,last_restart_at,last_restart_reason
 FROM edge_agents e WHERE id IN ('9f108498-4dd5-4a21-b810-eec9e538953c','2b4fe162-6c1a-413e-9596-1eac2e1bcf88','839d2a88-2b36-4e34-bd99-6cb247e196a5')`)).rows;
 console.log(JSON.stringify({columns,agents},null,2));
}finally{await db.end();}
