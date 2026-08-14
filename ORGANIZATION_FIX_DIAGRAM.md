# Organization Visibility Issue - Visual Explanation

## 🔍 The Problem (Flow Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                     THE PROBLEM                              │
└─────────────────────────────────────────────────────────────┘

User tries to create organization
          │
          ▼
    ┌─────────┐
    │   API   │
    └─────────┘
          │
          ▼
Check if organization exists
          │
          ├─── YES ──► Return error: "Already exists"
          │
          └─── NO  ──► Allow creation


Meanwhile, when user views /admin:
          │
          ▼
    ┌─────────┐
    │   API   │ GET /v1/organization/tree
    └─────────┘
          │
          ▼
Get all organizations in tenant
          │
          ▼
    ┌──────────────────────────────┐
    │ Filter by user permissions   │
    │ - Check role                 │
    │ - Check node assignments     │
    └──────────────────────────────┘
          │
          ├─── Has permissions ──► Show organization
          │
          └─── No permissions  ──► Show empty (0 organizations)
                                    ^^^
                                    THE ISSUE!

Result: User sees "no organization exists" but API says "already exists"
```

---

## 🎯 The Solution (Flow Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                    THE SOLUTION                              │
└─────────────────────────────────────────────────────────────┘

Run: npm run fix:org-visibility
          │
          ▼
    ┌─────────────┐
    │  Fix Script │
    └─────────────┘
          │
          ├─── 1. Find user
          │         │
          │         ▼
          │    SELECT id, username, role FROM users
          │
          ├─── 2. Check current role
          │         │
          │         ▼
          │    role = 'operator' (no org access)
          │
          ├─── 3. Grant admin role
          │         │
          │         ▼
          │    UPDATE users SET role = 'company_admin'
          │
          └─── 4. Verify
                    │
                    ▼
               role = 'company_admin' ✅


Now when user views /admin:
          │
          ▼
    ┌─────────┐
    │   API   │ GET /v1/organization/tree
    └─────────┘
          │
          ▼
Get all organizations in tenant
          │
          ▼
    ┌──────────────────────────────┐
    │ Filter by user permissions   │
    │ - role = 'company_admin' ✅  │
    │ - Full access granted! ✅    │
    └──────────────────────────────┘
          │
          ▼
    Show ALL organizations ✅

Result: User can now see and manage the organization!
```

---

## 🔒 Permission System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              PERMISSION SYSTEM LAYERS                        │
└─────────────────────────────────────────────────────────────┘

Layer 1: ROLE-BASED PERMISSIONS (Global Level)
┌────────────────────────────────────────────────────────┐
│  super_admin      → Access EVERYTHING                  │
│                     (all tenants, all nodes)           │
│                                                         │
│  company_admin    → Access ALL nodes in tenant  ◄─┐    │
│                     (this is what we grant)       │    │
│                                                   │    │
│  branch_admin     → Access assigned branch +      │    │
│                     all children                  │    │
│                                                   │    │
│  operator         → Limited access                │    │
│                     (assigned cameras only)       │    │
└───────────────────────────────────────────────────┼────┘
                                                    │
                                        THE FIX GRANTS THIS
                                                    │
Layer 2: NODE-BASED PERMISSIONS (Granular Level)   │
┌───────────────────────────────────────────────────┼────┐
│  role_node_assignments                           │    │
│  ┌─────────────────────────────────────┐         │    │
│  │ user_id  │ node_id  │ role          │         │    │
│  ├─────────────────────────────────────┤         │    │
│  │ user123  │ branch1  │ node_admin    │         │    │
│  │ user123  │ branch2  │ node_operator │         │    │
│  │ user456  │ company1 │ node_admin    │◄────────┘    │
│  └─────────────────────────────────────┘              │
│                                                        │
│  Alternative: Assign user to company node              │
│  (More granular than role-based)                       │
└────────────────────────────────────────────────────────┘

Both layers are checked:
  - If user has company_admin role → PASS ✅
  - OR if user has assignment to node → PASS ✅
  - Otherwise → FAIL ❌ (node is hidden)
```

---

## 📊 Data Flow: Before vs After Fix

```
┌─────────────────────────────────────────────────────────────┐
│                      BEFORE FIX                              │
└─────────────────────────────────────────────────────────────┘

Database State:
┌──────────────────┐         ┌──────────────────────┐
│ resource_nodes   │         │ users                │
├──────────────────┤         ├──────────────────────┤
│ id: org-123      │         │ id: user-456         │
│ type: company    │         │ username: john       │
│ name: Acme Corp  │         │ role: operator       │ ◄── PROBLEM!
│ tenant: tenant-1 │         │ tenant: tenant-1     │
│ is_active: true  │         │ is_active: true      │
└──────────────────┘         └──────────────────────┘
        │                              │
        │                              │
        └──────────┬───────────────────┘
                   ▼
         ┌────────────────────┐
         │ Permission Check   │
         │ role = operator    │
         │ node assignments = │
         │        NONE        │
         └────────────────────┘
                   │
                   ▼
            ❌ ACCESS DENIED
                   │
                   ▼
         Organization hidden
         from /admin page


┌─────────────────────────────────────────────────────────────┐
│                      AFTER FIX                               │
└─────────────────────────────────────────────────────────────┘

Database State:
┌──────────────────┐         ┌────────────────────────┐
│ resource_nodes   │         │ users                  │
├──────────────────┤         ├────────────────────────┤
│ id: org-123      │         │ id: user-456           │
│ type: company    │         │ username: john         │
│ name: Acme Corp  │         │ role: company_admin    │ ◄── FIXED!
│ tenant: tenant-1 │         │ tenant: tenant-1       │
│ is_active: true  │         │ is_active: true        │
└──────────────────┘         └────────────────────────┘
        │                              │
        │                              │
        └──────────┬───────────────────┘
                   ▼
         ┌────────────────────┐
         │ Permission Check   │
         │ role = company_    │
         │        admin       │ ◄── GRANTS ACCESS
         └────────────────────┘
                   │
                   ▼
            ✅ ACCESS GRANTED
                   │
                   ▼
         Organization visible
         on /admin page ✅
```

---

## 🔄 API Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│            API REQUEST: /v1/organization/tree                │
└─────────────────────────────────────────────────────────────┘

Step 1: User Makes Request
┌──────────────────────┐
│   Browser            │
│   GET /api/v1/       │
│   organization/tree  │
└──────────────────────┘
           │
           ▼
Step 2: Authentication Middleware
┌──────────────────────┐
│ Extract JWT token    │
│ Load user from DB    │
│ Attach to request    │
└──────────────────────┘
           │
           ▼
Step 3: Organization Route Handler
┌──────────────────────┐
│ store.getOrganiza-   │
│ tionTree(tenantId)   │
└──────────────────────┘
           │
           ▼
Step 4: Load ALL Nodes from Database
┌────────────────────────────────┐
│ SELECT * FROM resource_nodes   │
│ WHERE tenant_id = ?            │
│ AND is_active = true           │
│                                │
│ Result: [Acme Corp, Branch A,  │
│          Branch B, Camera 1]   │
└────────────────────────────────┘
           │
           ▼
Step 5: Permission Filtering
┌─────────────────────────────────┐
│ visibleOrganizationNodeIds()    │
│                                 │
│ FOR EACH node:                  │
│   IF user.role = 'company_admin'│ ◄── Fix makes this TRUE
│      → Include node             │
│   ELSE IF hasNodeAssignment()   │
│      → Include node             │
│   ELSE                          │
│      → Exclude node             │
└─────────────────────────────────┘
           │
           ▼
Step 6: Build Filtered Tree
┌─────────────────────────────────┐
│ filterOrganizationTree()        │
│                                 │
│ BEFORE FIX:                     │
│   Input: [Acme Corp]            │
│   Visible: []                   │
│   Output: []  ◄── EMPTY!        │
│                                 │
│ AFTER FIX:                      │
│   Input: [Acme Corp]            │
│   Visible: [Acme Corp]          │
│   Output: [Acme Corp] ◄── VISIBLE!│
└─────────────────────────────────┘
           │
           ▼
Step 7: Return to Browser
┌─────────────────────────────────┐
│ BEFORE: { data: [] }            │
│ AFTER:  { data: [              │
│   {                             │
│     id: "org-123",              │
│     name: "Acme Corp",          │
│     type: "company",            │
│     children: []                │
│   }                             │
│ ]}                              │
└─────────────────────────────────┘
```

---

## 🛠️ Fix Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│         FIX SCRIPT EXECUTION: fix-org-visibility.mjs         │
└─────────────────────────────────────────────────────────────┘

Step 1: Connect to Database
┌──────────────────────┐
│ pg.Pool              │
│ Use DATABASE_URL     │
└──────────────────────┘
           │
           ▼
Step 2: Check Organizations
┌────────────────────────────────┐
│ SELECT * FROM resource_nodes   │
│ WHERE node_type = 'company'    │
│                                │
│ Found: 1 organization          │
│   - Acme Corp                  │
└────────────────────────────────┘
           │
           ▼
Step 3: Find Target User
┌────────────────────────────────┐
│ IF username provided:          │
│   SELECT WHERE username = ?    │
│ ELSE:                          │
│   SELECT first active user     │
│                                │
│ Found: john (operator)         │
└────────────────────────────────┘
           │
           ▼
Step 4: Check Current Permissions
┌────────────────────────────────┐
│ Current role: operator         │
│ Node assignments: 0            │
│                                │
│ Diagnosis: No access! ❌       │
└────────────────────────────────┘
           │
           ▼
Step 5: Apply Fix
┌────────────────────────────────┐
│ UPDATE users                   │
│ SET role = 'company_admin'     │
│ WHERE id = 'user-456'          │
│                                │
│ Rows updated: 1 ✅             │
└────────────────────────────────┘
           │
           ▼
Step 6: Verify
┌────────────────────────────────┐
│ SELECT role FROM users         │
│ WHERE id = 'user-456'          │
│                                │
│ Result: company_admin ✅       │
└────────────────────────────────┘
           │
           ▼
Step 7: Display Results
┌────────────────────────────────┐
│ ✅ Fix complete!               │
│ john is now company_admin      │
│ Can access all nodes in tenant │
│                                │
│ → Refresh your browser         │
└────────────────────────────────┘
```

---

## 📱 UI Component Flow

```
┌─────────────────────────────────────────────────────────────┐
│     UI DIAGNOSTIC COMPONENT: OrganizationVisibilityFix       │
└─────────────────────────────────────────────────────────────┘

Page Load: /admin
           │
           ▼
┌────────────────────────────────┐
│ checkOrganizationExists()      │
│ GET /v1/organization/tree      │
└────────────────────────────────┘
           │
           ├─── Tree has data ──► Show normal admin UI
           │
           └─── Tree empty ──► Show organization setup
                                           │
                                           ▼
                                ┌────────────────────────┐
                                │ <CreateOrganization    │
                                │  Form />               │
                                └────────────────────────┘
                                           │
                                           ▼
                                User submits form
                                           │
                                           ▼
                                POST /v1/organization/nodes
                                           │
                                           ├─── Success ──► Refresh
                                           │
                                           └─── Error 409 ──► "Already exists"
                                                              │
                                                              ▼
                                           ┌────────────────────────────┐
                                           │ <OrganizationVisibility    │
                                           │  Fix />                    │
                                           │                            │
                                           │ - Calls /debug endpoint    │
                                           │ - Shows user role          │
                                           │ - Shows visible/hidden     │
                                           │   node counts              │
                                           │ - Provides SQL fix         │
                                           │ - "Check Again" button     │
                                           └────────────────────────────┘
```

---

## 🎯 Summary Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PROBLEM → SOLUTION                        │
└─────────────────────────────────────────────────────────────┘

PROBLEM:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│Organization │────▶│ Permission  │────▶│  Hidden     │
│   Exists    │     │   Check     │     │  from User  │
│      ✅     │     │     ❌      │     │     ❌      │
└─────────────┘     └─────────────┘     └─────────────┘


FIX:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Grant    │────▶│ Permission  │────▶│  Visible    │
│company_admin│     │   Check     │     │   to User   │
│   Role      │     │     ✅      │     │     ✅      │
└─────────────┘     └─────────────┘     └─────────────┘
      ▲
      │
      │ Run: npm run fix:org-visibility
      │
┌─────────────┐
│ Fix Script  │
│  Automated  │
└─────────────┘
```

---

## 🏁 End Result

```
BEFORE:                          AFTER:
┌──────────────────┐            ┌──────────────────┐
│  /admin Page     │            │  /admin Page     │
│                  │            │                  │
│  ⚠️ No org      │            │  ✅ Acme Corp   │
│     found!       │            │                  │
│                  │            │  📁 Branches    │
│  [Create Form]   │            │  👥 Users       │
│                  │            │  📷 Cameras     │
│                  │            │                  │
└──────────────────┘            └──────────────────┘

User: john                      User: john
Role: operator ❌               Role: company_admin ✅
Access: Limited                 Access: Full tenant
```
