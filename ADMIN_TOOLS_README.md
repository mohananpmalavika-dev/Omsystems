# 🛠️ Admin Cleanup Tools

Two powerful tools for managing your Sentinel Grid database.

---

## 📋 Tools Overview

### 1. **admin-cleanup.mjs** - Interactive Menu (Recommended)
Full-featured interactive tool with safety confirmations.

### 2. **quick-cleanup.mjs** - Command Line
Fast command-line tool for scripts and quick tasks.

---

## 🎯 Tool 1: Interactive Admin Tool

### Start Interactive Mode:
```bash
node admin-cleanup.mjs
```

### Features:
- ✅ Interactive menu with visual feedback
- ✅ List all gateways, cameras, branches
- ✅ Delete individual items by ID
- ✅ Delete all items with confirmation
- ✅ Real-time database statistics
- ✅ Safety confirmations for destructive actions
- ✅ Handles all foreign key dependencies automatically

### Screenshots:

```
╔════════════════════════════════════════════════════════════╗
║         SENTINEL GRID - ADMIN CLEANUP TOOL                 ║
╚════════════════════════════════════════════════════════════╝

📊 DATABASE STATISTICS:
──────────────────────────────────────────────────
Branches:          2
Gateways:          4
Cameras:           8
Live Sessions:     12
Telemetry Records: 1557
──────────────────────────────────────────────────

📋 MAIN MENU:
──────────────────────────────────────────────────
1. List Gateways
2. List Cameras
3. List Branches
──────────────────────────────────────────────────
4. Delete Gateway (by ID)
5. Delete Camera (by ID)
6. Delete Branch (by ID)
──────────────────────────────────────────────────
7. Delete ALL Gateways
8. Delete ALL Cameras
9. Delete ALL Branches
──────────────────────────────────────────────────
0. Exit
──────────────────────────────────────────────────

Enter your choice:
```

---

## ⚡ Tool 2: Quick Command Line Tool

### Usage:
```bash
node quick-cleanup.mjs <action> [id]
```

### List Commands:

```bash
# List all gateways
node quick-cleanup.mjs list-gateways

# List all cameras
node quick-cleanup.mjs list-cameras

# List all branches
node quick-cleanup.mjs list-branches
```

### Delete Single Item:

```bash
# Delete specific gateway
node quick-cleanup.mjs delete-gateway 00000000-0000-4000-8000-000000000104

# Delete specific camera
node quick-cleanup.mjs delete-camera d47ac10b-58cc-4372-a567-0e02b2c3d479

# Delete specific branch (deletes all its gateways too!)
node quick-cleanup.mjs delete-branch a3bb189e-8bf9-3888-9912-ace4e6543002
```

### Delete All Items:

```bash
# Delete ALL gateways
node quick-cleanup.mjs delete-all-gateways

# Delete ALL cameras
node quick-cleanup.mjs delete-all-cameras

# Delete ALL branches (deletes all gateways and cameras too!)
node quick-cleanup.mjs delete-all-branches
```

### Get Help:

```bash
node quick-cleanup.mjs help
```

---

## 🗑️ What Gets Deleted

### When you delete a Gateway:
- ✅ The gateway itself
- ✅ All cameras connected to it
- ✅ All telemetry records
- ✅ All camera discovery records
- ✅ All scan jobs
- ✅ All live sessions

### When you delete a Camera:
- ✅ The camera itself
- ✅ All live sessions for that camera
- ✅ All discovery records for that camera

### When you delete a Branch:
- ✅ The branch itself
- ✅ All gateways in that branch
- ✅ All cameras connected to those gateways
- ✅ All related telemetry, discoveries, scans, sessions

---

## 🔒 Safety Features

### Interactive Tool (admin-cleanup.mjs):
- ❗ Requires typing "DELETE" to confirm single deletions
- ❗ Requires typing "DELETE ALL" to confirm bulk deletions
- ❗ Shows what will be deleted before confirmation
- ❗ Can press Enter to cancel at any time

### Quick Tool (quick-cleanup.mjs):
- ⚠️  No confirmations - be careful!
- ⚠️  Good for scripts and automation
- ⚠️  Use interactive tool if unsure

---

## 📖 Common Workflows

### Scenario 1: Remove a test gateway

**Interactive:**
```bash
node admin-cleanup.mjs
# Select: 1 (List Gateways)
# Copy the gateway ID
# Press Enter
# Select: 4 (Delete Gateway)
# Paste gateway ID
# Type: DELETE
```

**Quick:**
```bash
node quick-cleanup.mjs list-gateways
node quick-cleanup.mjs delete-gateway <gateway-id>
```

---

### Scenario 2: Clean database before fresh start

**Interactive:**
```bash
node admin-cleanup.mjs
# Select: 9 (Delete ALL Branches)
# Type: DELETE ALL
```

**Quick:**
```bash
node quick-cleanup.mjs delete-all-branches
```

---

### Scenario 3: Remove orphaned cameras

**Interactive:**
```bash
node admin-cleanup.mjs
# Select: 2 (List Cameras)
# Find cameras without gateways
# Select: 5 (Delete Camera)
# Enter camera ID
# Type: DELETE
```

**Quick:**
```bash
node quick-cleanup.mjs list-cameras
# Find orphaned cameras
node quick-cleanup.mjs delete-camera <camera-id>
```

---

### Scenario 4: Cleanup after testing

**Quick (bulk delete):**
```bash
# Delete all test data
node quick-cleanup.mjs delete-all-cameras
node quick-cleanup.mjs delete-all-gateways
node quick-cleanup.mjs delete-all-branches
```

---

## 🧪 Testing Before Production Use

### Test on sample data:

1. **Create test gateway:**
   ```bash
   # Your existing gateway creation script
   ```

2. **Verify it exists:**
   ```bash
   node quick-cleanup.mjs list-gateways
   ```

3. **Delete it:**
   ```bash
   node quick-cleanup.mjs delete-gateway <test-gateway-id>
   ```

4. **Confirm deleted:**
   ```bash
   node quick-cleanup.mjs list-gateways
   ```

---

## 🎯 Best Practices

### ✅ DO:
- Use interactive tool for one-off deletions
- Use quick tool for scripts and automation
- List items before deleting to verify IDs
- Keep database backups before bulk deletions
- Test on non-production data first

### ❌ DON'T:
- Run `delete-all-*` commands on production without backup
- Delete branches without understanding the cascade
- Use quick tool if you need safety confirmations
- Delete items while edge agents are actively connected

---

## 🔧 Troubleshooting

### Error: "Connection refused"
```bash
# Check your .env file has correct DATABASE_URL
cat .env | grep DATABASE_URL
```

### Error: "Foreign key constraint"
```bash
# The tools handle this automatically
# If you see this error, it's a bug - report it
```

### Nothing gets deleted
```bash
# Verify items exist first
node quick-cleanup.mjs list-gateways
node quick-cleanup.mjs list-cameras
node quick-cleanup.mjs list-branches
```

### Want to undo?
```bash
# Unfortunately, deletions are permanent
# Always keep database backups!
# Use pg_dump before major cleanups
```

---

## 📊 Example Output

### List Gateways:
```
📡 GATEWAYS:
────────────────────────────────────────────────────────────────────────────────
1. H1 (00000000-0000-4000-8000-000000000104)
   Status: online | Last seen: 2024-01-15 10:30:45

2. Mumbai Office (a1b2c3d4-e5f6-7890-abcd-ef1234567890)
   Status: offline | Last seen: 2024-01-14 18:20:12
────────────────────────────────────────────────────────────────────────────────
```

### Delete Gateway:
```
🗑️  Deleting gateway: H1
   ✓ Deleted 4 cameras
   ✓ Deleted 1557 telemetry records
   ✓ Deleted 12 discovery records
   ✓ Deleted 3 scan jobs
   ✓ Deleted 8 live sessions
   ✓ Gateway deleted

✅ Gateway and all dependent records deleted successfully!
```

---

## 🚀 Quick Reference

| Task | Interactive | Quick |
|------|-------------|-------|
| List all gateways | Menu → 1 | `node quick-cleanup.mjs list-gateways` |
| List all cameras | Menu → 2 | `node quick-cleanup.mjs list-cameras` |
| List all branches | Menu → 3 | `node quick-cleanup.mjs list-branches` |
| Delete gateway | Menu → 4 | `node quick-cleanup.mjs delete-gateway <id>` |
| Delete camera | Menu → 5 | `node quick-cleanup.mjs delete-camera <id>` |
| Delete branch | Menu → 6 | `node quick-cleanup.mjs delete-branch <id>` |
| Delete all gateways | Menu → 7 | `node quick-cleanup.mjs delete-all-gateways` |
| Delete all cameras | Menu → 8 | `node quick-cleanup.mjs delete-all-cameras` |
| Delete all branches | Menu → 9 | `node quick-cleanup.mjs delete-all-branches` |

---

## 💡 Pro Tips

1. **Before big changes:**
   ```bash
   # Backup database
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Check stats after cleanup:**
   ```bash
   node admin-cleanup.mjs
   # Stats are shown on main menu
   ```

3. **Script multiple operations:**
   ```bash
   #!/bin/bash
   # cleanup-test-data.sh
   node quick-cleanup.mjs delete-gateway test-gateway-1
   node quick-cleanup.mjs delete-gateway test-gateway-2
   node quick-cleanup.mjs delete-camera orphan-camera-1
   ```

4. **Combine with other tools:**
   ```bash
   # Get gateway ID from status, then delete
   GATEWAY_ID=$(node get-gateway-info.mjs | grep 'ID:' | cut -d' ' -f2)
   node quick-cleanup.mjs delete-gateway $GATEWAY_ID
   ```

---

## 📞 Need Help?

- Check the main menu statistics to verify your database state
- Use `list-*` commands before deleting anything
- Test on sample data first
- Keep database backups!

**Ready to clean up? Start with the interactive tool:**

```bash
node admin-cleanup.mjs
```

🎉 Happy cleaning!
