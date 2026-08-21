# Delete All Branch Gateways (Edge Agents)

This guide explains how to delete all branch gateways (edge agents) from the Sentinel Grid database.

## ⚠️ WARNING

**This is a DESTRUCTIVE operation that will:**

1. **DELETE all edge agents** from the `edge_agents` table
2. **CASCADE DELETE** the following related data:
   - `edge_commands` - All commands for these agents
   - `operational_health` - Health records for these agents
3. **SET NULL** on the following references:
   - `device_identities.edge_agent_id`
   - `device_ip_observations.edge_agent_id`
   - `camera_discovery_credentials.edge_agent_id`
4. **ORPHAN** the following data (references will point to non-existent agents):
   - `cameras.edge_agent_id` - You may need to manually clean this up
   - `edge_scan_jobs` - Scan jobs will reference deleted agents
   - `camera_discoveries` - Discoveries will reference deleted agents

**Always backup your database before running destructive operations!**

## Methods

### Method 1: Node.js Script (Recommended)

This method is safer as it shows a summary before deletion and requires explicit confirmation.

```bash
# Set your database URL
export DATABASE_URL="postgresql://username:password@host:5432/database"

# For Render.com, get the connection string from:
# https://dashboard.render.com -> Your Database -> "Connect" tab

# Run with confirmation
CONFIRM=yes DATABASE_URL="your-connection-string" node database/scripts/delete-all-edge-agents.js
```

**Windows PowerShell:**
```powershell
$env:DATABASE_URL="postgresql://username:password@host:5432/database"
$env:CONFIRM="yes"
node database/scripts/delete-all-edge-agents.js
```

#### Script Features:
- Shows count of agents before deletion
- Displays affected related data
- Groups agents by branch
- Requires explicit CONFIRM=yes flag
- Wraps deletion in a transaction
- Shows deleted agents after completion

### Method 2: SQL Script (For psql users)

If you prefer using psql directly:

```bash
# Connect and run the script
psql "your-database-connection-string" -f database/scripts/delete-all-edge-agents.sql
```

**Important:** The SQL script is set to ROLLBACK by default for safety. To actually delete:

1. Open `database/scripts/delete-all-edge-agents.sql`
2. Uncomment the `DELETE FROM edge_agents;` line
3. Replace `ROLLBACK;` with `COMMIT;` at the end
4. Save and run the script

### Method 3: Direct SQL (For experienced users)

If you understand the implications and want to delete directly:

```sql
-- In psql or any PostgreSQL client
BEGIN;

-- Check what will be deleted
SELECT COUNT(*) FROM edge_agents;

-- Delete all edge agents (CASCADE will handle related tables)
DELETE FROM edge_agents;

-- Review and commit
COMMIT;
```

## Database Connection Strings

### Local Development
```
postgresql://username:password@localhost:5432/sentinel
```

### Render.com Production
Get your connection string from:
1. Go to https://dashboard.render.com
2. Navigate to your PostgreSQL database
3. Click "Connect" tab
4. Copy the "External Connection String"
5. Format: `postgresql://username:password@hostname.render.com:5432/database`

## Verification

After deletion, verify the results:

```sql
-- Check that edge agents are gone
SELECT COUNT(*) FROM edge_agents;
-- Should return: 0

-- Check orphaned cameras (optional cleanup)
SELECT COUNT(*) FROM cameras WHERE edge_agent_id IS NOT NULL;

-- Check orphaned scan jobs (optional cleanup)
SELECT COUNT(*) FROM edge_scan_jobs;

-- Check orphaned discoveries (optional cleanup)
SELECT COUNT(*) FROM camera_discoveries;
```

## Optional Cleanup

If you want to clean up orphaned references:

```sql
-- Clean up orphaned camera references
UPDATE cameras SET edge_agent_id = NULL WHERE edge_agent_id IS NOT NULL;

-- Delete orphaned scan jobs
DELETE FROM edge_scan_jobs;

-- Delete orphaned camera discoveries
DELETE FROM camera_discoveries;
```

## Troubleshooting

### Error: "Cannot connect to database"

**Solution:** Check your DATABASE_URL environment variable:

```bash
# Print your current DATABASE_URL (sensitive!)
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT 1"
```

### Error: "ECONNREFUSED"

**Solution:** The database server is not running or not accessible:

- **Local:** Start your PostgreSQL server
- **Render.com:** Check the database is online in dashboard
- **Firewall:** Ensure port 5432 is accessible

### Error: "permission denied"

**Solution:** The database user doesn't have DELETE permissions:

```sql
-- Grant delete permission (run as superuser)
GRANT DELETE ON edge_agents TO your_user;
```

## Recovery

If you deleted by mistake and need to restore:

1. **From backup:** Restore your database backup
2. **No backup:** Edge agents will need to be re-registered manually through the UI or API

## Support

For questions or issues:
- Check the Sentinel Grid documentation
- Review the database schema in `database/migrations/`
- Contact your database administrator

---

**Remember:** Always backup before running destructive operations!
