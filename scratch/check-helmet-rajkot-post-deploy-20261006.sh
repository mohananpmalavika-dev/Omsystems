#!/usr/bin/env bash
set -eu
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const h=await(await fetch('http://localhost:8092/health')).json();
const s=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),detectorVersion:s.match(/super\("helmet", "([^"]+)"\)/)?.[1],
 aiState:h.aiState,helmet:h.pipeline?.detectors?.helmet,notifications:h.notifications}));
JS
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';import {createClient} from 'redis';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
try{
 const id='6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7';
 const {rows}=await db.query(`SELECT c.id,c.status,c.edge_agent_id,e.status AS edge_status,e.last_seen_at AS edge_last_seen_at
 FROM cameras c LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE c.id=$1`,[id]);
 console.log('CAMERA',JSON.stringify(rows));
 console.log('CACHE_TTL',await redis.ttl(`analytics:latest-frame:${id}`));
 console.log('POST_DEPLOY',JSON.stringify((await db.query(`SELECT detection_type,model_version,count(*) AS count,max(occurred_at) AS latest
 FROM analytics_events WHERE camera_id=$1 AND occurred_at > '2026-10-06T13:16:30Z' GROUP BY detection_type,model_version`,[id])).rows));
 console.log('ALERTS_POST_DEPLOY',JSON.stringify((await db.query(`SELECT created_at,status,title FROM analytics_alerts
 WHERE camera_id=$1 AND title ILIKE '%helmet%' AND created_at > '2026-10-06T13:16:30Z' ORDER BY created_at`,[id])).rows));
 console.log('ALL_ALERT_COUNTS_POST_DEPLOY',JSON.stringify((await db.query(`SELECT detection_type,model_version,count(*) AS count FROM analytics_events
 WHERE detection_type IN ('helmet','helmet-worn') AND occurred_at > '2026-10-06T13:16:30Z' GROUP BY detection_type,model_version`)).rows));
}finally{await redis.quit();await db.end();}
JS
date -u
cat /tmp/sentinel-helmet-rajkot-1.2.2-20261006/deployed.txt
