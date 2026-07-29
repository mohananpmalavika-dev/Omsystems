# Camera Deletion Guide

This guide explains how to safely delete cameras from your VMS system.

## ⚠️ Important Warnings

- **Deleting cameras is PERMANENT** - this cannot be undone
- All related data will be deleted: recordings, analytics, incidents, etc.
- Always use `--dry-run` first to preview what will be deleted
- Backup your database before bulk deletions

---

## Quick Start

### 1. Preview what will be deleted (Dry Run)

```bash
npm run cameras:delete:dry-run
```

This shows you what cameras would be deleted without actually deleting them.

### 2. Delete all cameras

```bash
npm run cameras:delete:all
```

⚠️ **WARNING**: This deletes ALL cameras in the system!

---

## Deletion Options

### Delete all test/demo cameras

```bash
npm run cameras:delete:test
```

Deletes only cameras with "test" or "demo" in their name.

### Delete cameras in a specific branch

```bash
npm run cameras:delete:branch <branch-id>

# Example:
npm run cameras:delete:branch branch-001
```

### Delete a specific camera by ID

```bash
npm run cameras:delete:id <camera-id>

# Example:
npm run cameras:delete:id camera-00001
```

---

## Advanced Usage

### Preview before deleting

Add `--dry-run` to any command:

```bash
node scripts/delete-cameras.mjs --all --dry-run
node scripts/delete-cameras.mjs --branch branch-001 --dry-run
node scripts/delete-cameras.mjs --test --dry-run
```

### Skip confirmation prompt

Use `--confirm` flag:

```bash
node scripts/delete-cameras.mjs --all --confirm
```

---

## What Gets Deleted

When you delete cameras, the following data is also removed:

### Analytics Data
- Analytics alerts
- Analytics events  
- Analytics rules

### Recording Data
- Recording segments
- Recording jobs
- Recording legal holds

### Incident Data
- Incident camera references
- Incident video ranges
- Incident clips
- Incident snapshots

### Live Monitoring
- Live sessions
- Live bookmarks

### Health & Monitoring
- Camera health history
- Camera quality metrics
- Camera quality alerts
- Camera downtime logs

### Access Control
- Camera-specific grants
- Camera access group memberships

### Camera Details
- Camera specifications
- Installation compliance records
- Discovery records
- Resource node entries

---

## Database-Only Deletion (SQL)

If you prefer to use SQL directly:

```bash
# Using psql
psql $DATABASE_URL -f scripts/delete-cameras.sql
```

**Note**: Edit the SQL file to modify which cameras are deleted.

---

## Examples

### Example 1: Clean up test data

```bash
# Preview test cameras
node scripts/delete-cameras.mjs --test --dry-run

# Output:
# Found 5 camera(s):
#   1. Test Camera 1 (cam-test-001)
#   2. Test Camera 2 (cam-test-002)
#   3. Demo Camera (cam-demo-001)
#   ...

# Delete them
npm run cameras:delete:test
```

### Example 2: Delete cameras from closed branch

```bash
# Preview first
node scripts/delete-cameras.mjs --branch branch-old-001 --dry-run

# If OK, delete
node scripts/delete-cameras.mjs --branch branch-old-001 --confirm
```

### Example 3: Delete a single problematic camera

```bash
node scripts/delete-cameras.mjs --id camera-broken-001 --confirm
```

---

## Safety Features

1. **Transaction-based**: All deletions happen in a database transaction
   - If any error occurs, ALL changes are rolled back
   - Your data remains consistent

2. **Dry-run mode**: Always preview before deleting
   - Shows exactly what will be deleted
   - Shows counts of related data

3. **Confirmation required**: Must explicitly confirm
   - Prevents accidental deletions
   - Use `--confirm` flag to skip prompt

4. **Detailed logging**: See exactly what's happening
   - Color-coded output
   - Row counts for each table
   - Error messages if something fails

---

## Troubleshooting

### Error: "Cannot connect to database"

Check your DATABASE_URL environment variable:

```bash
# Set database URL
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Or create .env file
echo "DATABASE_URL=postgresql://..." > .env
```

### Error: "Foreign key constraint"

The script deletes related data in the correct order. If you still get this error:
- Check if there are custom foreign keys in your database
- Use the SQL script instead which handles all known relationships

### Nothing happens after running command

- Make sure you included `--confirm` flag
- Or answer "yes" to the confirmation prompt

---

## After Deletion

### Verify deletion

```bash
# Count remaining cameras
psql $DATABASE_URL -c "SELECT COUNT(*) FROM cameras;"

# List remaining cameras
psql $DATABASE_URL -c "SELECT id, name, branch_node_id FROM cameras;"
```

### Reclaim disk space

After deleting many cameras with recordings:

```bash
# PostgreSQL
psql $DATABASE_URL -c "VACUUM FULL;"

# File system (if recordings stored locally)
# Clean up orphaned recording files
```

---

## Support

If you encounter issues:

1. Run with `--dry-run` first
2. Check the error messages
3. Verify database connection
4. Check foreign key constraints
5. Contact your DBA if needed

---

## Best Practices

1. **Always backup first**
   ```bash
   npm run backup:database
   ```

2. **Use dry-run mode**
   ```bash
   npm run cameras:delete:dry-run
   ```

3. **Delete in phases**
   - Test cameras first
   - Then branch-by-branch
   - Finally any remaining

4. **Verify after each deletion**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM cameras;"
   ```

5. **Document the reason**
   - Keep a log of why cameras were deleted
   - Useful for audits and compliance
