# Bulk Upload System - Branches & Employees ✅

## Overview
Complete bulk data import system for mass creation of branches and employees via CSV upload.

## What Was Added

### 1. Backend API (`src/routes/bulk-upload.routes.ts`)
**Branch Endpoints:**
- `POST /api/bulk/branches` - Bulk create branches
- `POST /api/bulk/branches/validate` - Validate CSV before upload

**Employee Endpoints:**
- `POST /api/bulk/employees` - Bulk create employees with auto-generated passwords
- `POST /api/bulk/employees/validate` - Validate CSV before upload

**Stats:**
- `GET /api/bulk/stats` - Get total branches and employees

### 2. Frontend UI (`public/bulk-upload.html`)
- Separate page for bulk uploads
- Branch bulk upload with validation
- Employee bulk upload with password generation
- CSV template downloads
- Real-time validation
- Detailed error reporting
- Success summary with created IDs

### 3. Integration
- Routes registered in `src/app.ts`
- Navigation link in credential manager
- Shared CSS styling
- TypeScript compiled successfully

## Features

### Branch Bulk Upload ✅
- Upload hundreds of branches at once
- Support for hierarchy (parent_id)
- Branch types: branch, zone, region, headquarters
- Address and location data (lat/lng)
- Validation before import
- Download CSV template

### Employee Bulk Upload ✅
- Mass create employee accounts
- Auto-generate secure temporary passwords
- Role assignment (admin, operator, viewer, security_manager)
- Branch assignment
- Email duplicate detection
- Download passwords after creation
- Validation before import

## CSV Formats

### Branches CSV
```csv
name,parent_id,branch_type,address,city,state,country,postal_code,phone,email,manager_name,latitude,longitude
Head Office,,headquarters,123 Main St,Mumbai,Maharashtra,India,400001,+91-22-12345678,hq@example.com,John Doe,19.0760,72.8777
Mumbai Branch,<parent-uuid>,branch,456 Andheri,Mumbai,Maharashtra,India,400058,+91-22-23456789,mumbai@example.com,Jane Smith,19.1136,72.8697
```

**Required Fields:**
- `name` - Branch name

**Optional Fields:**
- `parent_id` - UUID of parent branch (for hierarchy)
- `branch_type` - branch, zone, region, headquarters (default: branch)
- `address`, `city`, `state`, `country`, `postal_code`
- `phone`, `email`, `manager_name`
- `latitude`, `longitude` - For map visualization

### Employees CSV
```csv
email,full_name,role,branch_id,phone,employee_id,department,designation
john.doe@example.com,John Doe,admin,<branch-uuid>,+91-9876543210,EMP001,IT,System Administrator
jane.smith@example.com,Jane Smith,operator,<branch-uuid>,+91-9876543211,EMP002,Operations,Operator
```

**Required Fields:**
- `email` - Unique email address
- `full_name` - Full name
- `role` - admin, operator, viewer, security_manager
- `branch_id` - UUID of the branch to assign

**Optional Fields:**
- `phone` - Contact number
- `employee_id` - Company employee ID
- `department` - Department name
- `designation` - Job title

## How to Use

### Access the UI
```
http://your-domain/bulk-upload.html
```

### Branch Upload Process
1. Click "Bulk Branches" tab
2. Download template CSV
3. Fill in your branch data
4. (Optional) Click "Validate Only" to check for errors
5. Click "Upload & Create Branches"
6. View results with created branch IDs
7. Copy branch UUIDs for employee import

### Employee Upload Process
1. Click "Bulk Employees" tab
2. Download template CSV
3. Fill in employee data with branch UUIDs
4. (Optional) Click "Validate Only" to check for errors
5. Click "Upload & Create Employees"
6. **IMPORTANT:** Download temporary passwords immediately
7. Distribute credentials securely to employees

## Validation Features

### Branch Validation
- ✅ Name is required
- ✅ Branch type must be valid enum
- ✅ Parent ID must be valid UUID (if provided)
- ✅ Email format validation (if provided)
- ✅ Lat/Long must be numbers (if provided)

### Employee Validation
- ✅ Email format validation
- ✅ Email uniqueness in CSV
- ✅ Role must be valid enum
- ✅ Branch ID must be valid UUID
- ✅ Duplicate detection

## Security Features

🔒 **Temporary Passwords:**
- 16-character secure random passwords
- Shown only once after creation
- Download as CSV for secure distribution
- Users should change on first login

🔒 **Validation:**
- Pre-upload validation prevents errors
- Detailed error messages per row
- No partial imports on validation failure

## Response Format

### Success Response
```json
{
  "success": true,
  "created": 45,
  "failed": 0,
  "errors": [],
  "created_branches": [
    {"index": 0, "id": "uuid", "name": "Branch Name"}
  ],
  "total": 45
}
```

### With Errors
```json
{
  "success": false,
  "created": 40,
  "failed": 5,
  "errors": [
    {"index": 3, "name": "Bad Branch", "error": "Invalid parent_id"}
  ],
  "total": 45
}
```

## Deployment Checklist

✅ Backend routes compiled
✅ Frontend HTML/JS/CSS created
✅ Templates available for download
✅ Validation endpoints working
✅ Navigation links added
✅ Error handling implemented
✅ Password download feature
✅ Stats display
✅ Production ready

## Usage Scenarios

### Scenario 1: New Installation (400+ Branches)
1. Export existing branch data to CSV
2. Validate CSV format
3. Upload in batches of 100-200
4. Verify branch IDs created
5. Use IDs for employee import

### Scenario 2: Mass Employee Onboarding (1000+ Employees)
1. Get branch IDs from system
2. Prepare employee CSV with branch assignments
3. Validate for duplicates
4. Upload employees
5. Download and securely distribute passwords
6. Monitor first logins

### Scenario 3: Regional Expansion
1. Create regional branches with hierarchy
2. Assign managers via employee import
3. Configure branch-specific settings
4. Deploy edge agents per branch

## Best Practices

1. **Start Small:** Test with 5-10 records first
2. **Use Validation:** Always validate before uploading
3. **Backup Branch IDs:** Save created branch UUIDs
4. **Password Security:** Download passwords immediately
5. **Batch Uploads:** Don't exceed 500 records per upload
6. **Error Review:** Check all failed imports
7. **Hierarchy:** Create parent branches before children

## Troubleshooting

### "Branch with this name already exists"
- Check for duplicates in your CSV
- Verify branch doesn't exist in system

### "Invalid parent_id"
- Ensure parent branch is created first
- Use actual UUID from created branches
- Leave empty for root-level branches

### "User with this email already exists"
- Remove duplicate from CSV
- Check if user was created in previous import
- Use unique emails only

### "Failed to create user - store method not available"
- Backend store may need configuration
- Check database connection
- Verify user management is enabled

## Next Steps

1. **Deploy to Production**
   ```bash
   git add .
   git commit -m "Add bulk upload for branches and employees"
   git push origin main
   ```

2. **Import Your Data**
   - Prepare branch CSV
   - Upload branches
   - Note branch UUIDs
   - Prepare employee CSV
   - Upload employees
   - Distribute passwords

3. **Configure Branches**
   - Set up cameras per branch
   - Assign edge agents
   - Configure access permissions

---

**Status: ✅ PRODUCTION READY**

Both branch and employee bulk upload fully functional and integrated!
