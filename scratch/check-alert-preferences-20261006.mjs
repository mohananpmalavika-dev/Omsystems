import pg from 'pg';import {loadConfig} from '/app/dist/src/config.js';
const pool=new pg.Pool({connectionString:loadConfig().DATABASE_URL});
try {
 console.log(JSON.stringify((await pool.query(`SELECT id,username,
 preferences->'alertPopupEnabled' AS popup,preferences->'alertToastEnabled' AS toast,
 preferences->'audioAlertsEnabled' AS audio,preferences->'speechAlertsEnabled' AS speech
 FROM users WHERE status='active' ORDER BY username`)).rows));
} finally {await pool.end();}
