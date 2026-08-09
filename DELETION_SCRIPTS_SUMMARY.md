# Camera and Edge Agent Deletion Scripts - Quick Start

## 🎯 What Was Created

Three new scripts have been created to delete all cameras and edge agents (branch edges) from your database:

1. **`scripts/delete-all-cameras-and-edges.ts`** - TypeScript version
2. **`scripts/delete-all-cameras-and-edges.mjs`** - JavaScript ES Module (recommended)
3. **`scripts/DELETE-CAMERAS-README.md`** - Detailed documentation

## ⚡ Quick Start

### Easiest Method - Using npm Scripts

```bash
# Run the deletion script (interactive, requires confirmation)
npm run db:delete:cameras-and-edges

# Alternative alias
npm run db:nuke:cameras
```

### Direct Node.js Execution

```bash
# From the root directory
node scripts/delete-all-cameras-and-edges.mjs
```

### Using tsx (TypeScript version)

```bash
# From the root directory
npx tsx scripts/delete-all-cameras-and-edges.ts
```

## 🔒 Safety Features

- ✅ **Interactive Confirmation** - You must type "DELETE ALL" to proceed
- ✅ **Preview Mode** - Shows current counts before deletion
- ✅ **Transaction-Based** - All-or-nothing operation
- ✅ **Auto-Rollback** - Rolls back on any error
- ✅ **Detailed Logging** - Shows progress for each step
- ✅ **Summary Report** - Final deletion statistics

## 📋 What Gets Deleted

The script removes:

### Camera-Related Data
- ✅ All cameras and their resource nodes
- ✅ Camera discoveries (pending approvals)
- ✅ Recording jobs and segments
- ✅ Live streaming sessions
- ✅ Analytics alerts
- ✅ Incident camera links
- ✅ Camera access requests
- ✅ Camera specifications
- ✅ Device identity links

### Edge Agent Data (Branch Edges)
- ✅ All edge agents
- ✅ Edge activation tokens
- ✅ Edge scan jobs
- ✅ Edge commands
- ✅ Edge managed tunnels

## 📊 Example Output

```
======================================================================
  DELETE ALL CAMERAS AND BRANCH EDGES
======================================================================

📊 Current database state:
   Cameras: 15
   Edge Agents (Branch Edges): 3
   Camera Discoveries: 8
   ...

⚠️  WARNING: This will DELETE ALL cameras and edge agents!
Type "DELETE ALL" to confirm: DELETE ALL

🔄 Starting deletion process...

📌 Step 1: Deleting camera access requests...
   ✅ Deleted 5 camera access requests
...
📌 Step 16: Deleting edge agents...
   ✅ Deleted 3 edge agents

✅ Transaction committed successfully!

======================================================================
  DELETION SUMMARY
======================================================================
✅ Cameras deleted:                    15
✅ Edge agents deleted:                3
...
======================================================================
```

## ⚠️ Important Notes

1. **Irreversible Operation**: There is no undo. The only recovery is from a database backup.

2. **Database Backup**: Consider backing up your database first:
   ```bash
   npm run backup:database
   ```

3. **Environment Variables**: Ensure `DATABASE_URL` or `DIRECT_URL` is set:
   ```bash
   # Check if set
   echo $DATABASE_URL
   
   # Or load from .env
   export $(cat .env | xargs)
   ```

4. **Execution Order**: The script deletes in the correct order to respect foreign key constraints.

## 🛠️ Troubleshooting

### "DATABASE_URL environment variable is required"
```bash
# Load environment variables
export $(cat .env | xargs)
```

### Permission Denied
Make sure you have database delete permissions and the database user has the required privileges.

### Transaction Timeout
For very large datasets, increase the database timeout or run during off-peak hours.

## 📚 More Information

For detailed documentation, see: **`scripts/DELETE-CAMERAS-README.md`**

## 🔗 Related Scripts

- `npm run backup:database` - Backup database before deletion
- `npm run restore:database` - Restore from backup
- `npm run migrate` - Run database migrations

## 💡 When to Use

Use these scripts when you need to:
- Reset the system for testing
- Clean up after bulk imports
- Remove all camera data before fresh deployment
- Clear test data from staging environments

**DO NOT USE IN PRODUCTION** without a recent backup and proper authorization!
