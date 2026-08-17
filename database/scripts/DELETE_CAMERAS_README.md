# Delete Cameras and Edge Agents

This directory contains scripts to safely delete cameras and edge agents from the database.

## ⚠️ Important Warnings

- **IRREVERSIBLE**: Deletion is permanent. Make backups before running.
- **CASCADE**: Deletes all related data (live sessions, discoveries, etc.)
- **PRODUCTION**: Use extreme caution in production environments.

## Scripts Available

### 1. Interactive TypeScript (Recommended)

**File:** `delete-cameras-interactive.ts`

Full-featured interactive script with preview, backup, and rollback.

```bash
# Preview what will be deleted (dry run)
tsx database/scripts/delete-cameras-interactive.ts --dry-run

# Delete all cameras and edge agents
tsx database/scripts/delete-cameras-interactive.ts

# Delete with backup
tsx database/scripts/delete-cameras-interactive.ts --backup

# Delete for specific tenant
tsx database/scripts/delete-cameras-interactive.ts --tenant-id <uuid>

# Combine options
tsx database/scripts/delete-cameras-interactive.ts --backup --tenant-id <uuid>
```

**Features:**
- ✓ Preview counts before deletion
- ✓ Optional backup tables
- ✓ Transaction with rollback on error
- ✓ Confirmation prompt
- ✓ Tenant filtering
- ✓ Dry-run mode

### 2. PowerShell (Windows)

**File:** `Delete-Cameras.ps1`

Native PowerShell script for Windows environments.

```powershell
# Preview (WhatIf)
.\database\scripts\Delete-Cameras.ps1 -WhatIf

# Delete all (with confirmation)
.\database\scripts\Delete-Cameras.ps1

# Delete without confirmation
.\database\scripts\Delete-Cameras.ps1 -Force

# Delete for specific tenant
.\database\scripts\Delete-Cameras.ps1 -TenantId "123e4567-e89b-12d3-a456-426614174000"
```

### 3. Bash Shell Script (Linux/Mac)

**File:** `quick-delete-cameras.sh`

Simple bash script for Unix-like systems.

```bash
# Make executable (first time only)
chmod +x database/scripts/quick-delete-cameras.sh

# Delete all
./database/scripts/quick-delete-cameras.sh

# Delete for specific tenant
./database/scripts/quick-delete-cameras.sh <tenant-id>
```

### 4. Raw SQL Script

**File:** `delete-cameras-and-edge-agents.sql`

Direct SQL for advanced users.

```bash
# Execute directly
psql -d omsystems -f database/scripts/delete-cameras-and-edge-agents.sql

# With tenant filter
psql -d omsystems -v tenant_id='<uuid>' -f database/scripts/delete-cameras-and-edge-agents.sql
```

## What Gets Deleted

The scripts delete the following in order:

1. **Live Sessions** - Active streaming sessions
2. **Incident Cameras** - Camera references in incidents
3. **Camera Discoveries** - Discovered but not yet approved cameras
4. **Cameras** - Camera records
5. **Resource Nodes** - Camera entries in resource hierarchy
6. **Edge Agents** - Edge agent installations

## Environment Variables

All scripts support these environment variables:

```bash
# Database connection
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=omsystems
export DB_USER=postgres
export DB_PASSWORD=postgres
```

Or create a `.env` file:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=omsystems
DB_USER=postgres
DB_PASSWORD=your_password
```

## Database Backup

### Before Running Scripts

**Option 1: Full database backup**
```bash
pg_dump -h localhost -U postgres omsystems > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Option 2: Table-specific backup**
```bash
pg_dump -h localhost -U postgres omsystems \
  -t cameras \
  -t edge_agents \
  -t camera_discoveries \
  -t resource_nodes \
  > cameras_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Option 3: Use built-in backup (TypeScript script)**
```bash
tsx database/scripts/delete-cameras-interactive.ts --backup
```

### Restoring from Backup

If using the built-in backup feature:

```sql
-- Find backup tables
SELECT tablename FROM pg_tables 
WHERE tablename LIKE 'backup_%';

-- Restore cameras
INSERT INTO cameras 
SELECT * FROM backup_20240115_123000_all_cameras;

-- Restore edge agents
INSERT INTO edge_agents 
SELECT * FROM backup_20240115_123000_all_edge_agents;

-- etc.
```

## Examples

### Example 1: Preview Before Deletion

```bash
# TypeScript (recommended)
tsx database/scripts/delete-cameras-interactive.ts --dry-run

# PowerShell
.\database\scripts\Delete-Cameras.ps1 -WhatIf
```

Output:
```
============================================================
CAMERA AND EDGE AGENT DELETION TOOL
============================================================

🔍 DRY RUN MODE - No data will be deleted

📊 Analyzing database...

Records to be deleted:
  Cameras:           42
  Edge Agents:       3
  Camera Discoveries: 15
  Live Sessions:     2
  Incident Cameras:  8
  Resource Nodes:    42

✓ Dry run complete. No data was deleted.
```

### Example 2: Delete with Backup

```bash
tsx database/scripts/delete-cameras-interactive.ts --backup
```

Output:
```
📦 Creating backup tables...
✓ Backup created with prefix: backup_2024-01-15T12-30-00-000Z_all

🗑️  Deleting data...
  - Deleting live sessions...
  - Deleting incident cameras...
  - Deleting camera discoveries...
  - Deleting cameras...
  - Deleting camera resource nodes...
  - Deleting edge agents...

============================================================
✓ DELETION COMPLETE
============================================================

Records deleted:
  Cameras:           42
  Edge Agents:       3
  Camera Discoveries: 15
  Live Sessions:     2
  Incident Cameras:  8
  Resource Nodes:    42

💾 Backup tables created: backup_2024-01-15T12-30-00-000Z_all_*

✓ Database updated successfully.
```

### Example 3: Tenant-Specific Deletion

```bash
# TypeScript
tsx database/scripts/delete-cameras-interactive.ts --tenant-id "123e4567-e89b-12d3-a456-426614174000"

# PowerShell
.\database\scripts\Delete-Cameras.ps1 -TenantId "123e4567-e89b-12d3-a456-426614174000"

# Bash
./database/scripts/quick-delete-cameras.sh "123e4567-e89b-12d3-a456-426614174000"
```

### Example 4: Automated Deletion (CI/CD)

```bash
# With Force flag (no prompts)
tsx database/scripts/delete-cameras-interactive.ts --backup

# PowerShell
.\database\scripts\Delete-Cameras.ps1 -Force

# Bash with auto-confirmation
echo "yes" | ./database/scripts/quick-delete-cameras.sh
```

## Troubleshooting

### Error: "psql: command not found"

**Solution:** Install PostgreSQL client

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql

# Windows
# Download from https://www.postgresql.org/download/windows/
```

### Error: "permission denied"

**Solution:** Check database user permissions

```sql
-- Grant necessary permissions
GRANT DELETE ON cameras TO your_user;
GRANT DELETE ON edge_agents TO your_user;
-- etc.
```

### Error: "relation does not exist"

**Solution:** Check if migrations have been run

```bash
# Run migrations
npm run migrate

# Or manually check tables
psql -d omsystems -c "\dt"
```

### Error: "foreign key violation"

**Solution:** This shouldn't happen with the scripts (they delete in correct order), but if it does:

```sql
-- Check foreign key constraints
SELECT 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('cameras', 'edge_agents');
```

## Safety Checklist

Before running deletion scripts in production:

- [ ] Create full database backup
- [ ] Test script in development/staging first
- [ ] Verify tenant ID is correct (if filtering)
- [ ] Confirm with stakeholders
- [ ] Schedule maintenance window
- [ ] Have rollback plan ready
- [ ] Test backup restoration procedure
- [ ] Document the operation
- [ ] Monitor for issues after deletion

## Recovery Procedures

### If You Need to Undo

**If using built-in backup:**

```sql
BEGIN;

-- Restore from backup tables
INSERT INTO edge_agents 
SELECT * FROM backup_20240115_123000_all_edge_agents;

INSERT INTO resource_nodes 
SELECT * FROM backup_20240115_123000_all_resource_nodes;

INSERT INTO cameras 
SELECT * FROM backup_20240115_123000_all_cameras;

INSERT INTO camera_discoveries 
SELECT * FROM backup_20240115_123000_all_camera_discoveries;

-- Verify counts
SELECT 
  (SELECT COUNT(*) FROM cameras) as cameras,
  (SELECT COUNT(*) FROM edge_agents) as edge_agents;

COMMIT;
```

**If using pg_dump backup:**

```bash
psql -d omsystems -f backup_20240115_123000.sql
```

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review PostgreSQL logs: `/var/log/postgresql/`
3. Enable script debug mode (if available)
4. Contact database administrator

## License

Internal use only. Do not distribute outside organization.
