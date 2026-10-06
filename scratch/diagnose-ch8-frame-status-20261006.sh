#!/usr/bin/env bash
set -eu
sudo docker exec -i sentinel-gcp-control-plane node --input-type=module <<'JS'
import pg from 'pg';
import {createClient} from 'redis';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const redis=createClient({url:process.env.REDIS_URL});await redis.connect();
try {
 console.log('CHECKED_AT',new Date().toISOString());
 const cameras=(await db.query(`SELECT c.id,c.status,c.recorder_channel,c.channel,cn.name,b.name AS branch_name,
 c.edge_agent_id,e.name AS edge_name,e.status AS edge_status,e.last_seen_at AS edge_last_seen_at,e.version
 FROM cameras c JOIN resource_nodes cn ON cn.id=c.resource_node_id JOIN resource_nodes b ON b.id=c.branch_node_id
 LEFT JOIN edge_agents e ON e.id=c.edge_agent_id WHERE c.recorder_channel=8 OR c.channel=8`)).rows;
 for(const c of cameras){
  const raw=await redis.get(`analytics:latest-frame:${c.id}`),frame=raw?JSON.parse(raw):null;
  console.log('CAMERA',JSON.stringify({...c,frameTtlSeconds:await redis.ttl(`analytics:latest-frame:${c.id}`),
    frameCapturedAt:frame?.capturedAt??null}));
  console.log('HELMET_RULES',JSON.stringify((await db.query(`SELECT detection_type,enabled,min_confidence,
    min_duration_seconds,cooldown_seconds,schedule,archived_at FROM analytics_rules
    WHERE camera_id=$1 AND detection_type IN ('helmet','helmet-worn')`,[c.id])).rows));
  console.log('LATEST_HELMET_EVENT',JSON.stringify((await db.query(`SELECT detection_type,occurred_at,model_version,status
    FROM analytics_events WHERE camera_id=$1 AND detection_type IN ('helmet','helmet-worn') ORDER BY occurred_at DESC LIMIT 1`,[c.id])).rows));
  console.log('LATEST_HELMET_ALERT',JSON.stringify((await db.query(`SELECT title,created_at,status FROM analytics_alerts
    WHERE camera_id=$1 AND title ILIKE '%helmet%' ORDER BY created_at DESC LIMIT 1`,[c.id])).rows));
 }
}finally{await redis.quit();await db.end();}
JS
