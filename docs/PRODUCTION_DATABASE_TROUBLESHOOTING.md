# Production Database Connection Troubleshooting

## Issue: PostgreSQL Authentication Failure (Error Code 28000)

**Symptoms:**
- Alert outbox drain failed
- Export worker error
- Operational report worker failed
- Health checks passing but workers failing

## Immediate Actions

### 1. Verify Database Credentials
```bash
# Check if DATABASE_URL environment variable is set
echo $DATABASE_URL

# Test connection manually
psql $DATABASE_URL -c "SELECT 1"
```

### 2. Check Database Connection Pool Settings
```typescript
// In your database configuration file
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // For cloud databases
  },
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

### 3. Verify pg_hba.conf (If Self-Hosted)
```conf
# Allow connections from your application server
host    all             all             10.238.0.0/16           md5
host    all             all             0.0.0.0/0               md5  # Use with caution
```

### 4. Check Render.com Database Settings
```bash
# If using Render PostgreSQL:
# 1. Go to Dashboard > Database
# 2. Check "Connection" tab
# 3. Verify Internal/External connection strings
# 4. Check if database is in hibernation mode
# 5. Ensure connection pooling is enabled
```

### 5. Update Environment Variables

**Required Variables:**
```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=your_database
PGHOST=your_host
PGPORT=5432
PGSSLMODE=require
```

### 6. Implement Connection Retry Logic
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add connection error handling
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Implement retry wrapper
async function queryWithRetry(query: string, params: any[], retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(query, params);
    } catch (error: any) {
      if (error.code === '28000' && i < retries - 1) {
        console.log(`Auth failed, retrying... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

### 7. Check Worker Process Configuration

**Alert Outbox Worker:**
```typescript
// Ensure database connection is established before starting worker
async function startAlertWorker() {
  try {
    // Test connection first
    await pool.query('SELECT 1');
    console.log('Database connection established');
    
    // Start worker
    setInterval(async () => {
      try {
        await drainAlertOutbox();
      } catch (error: any) {
        if (error.code === '28000') {
          console.error('Auth error in alert worker, reconnecting...');
          await pool.end();
          // Recreate pool
        }
      }
    }, 5000);
  } catch (error) {
    console.error('Failed to start alert worker:', error);
    process.exit(1);
  }
}
```

### 8. Monitor Connection Pool

**Add Pool Monitoring:**
```typescript
setInterval(() => {
  console.log('Pool stats:', {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  });
}, 30000);
```

### 9. Check Render.com Specific Issues

**Hibernation Mode:**
- Render free-tier databases hibernate after 15 minutes of inactivity
- Solution: Upgrade to paid tier or implement keep-alive pings

**Connection Limits:**
- Free tier: 20 connections
- Starter: 60 connections  
- Pro: 120+ connections

### 10. Implement Health Check with Database Test

```typescript
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.code,
      timestamp: new Date().toISOString()
    });
  }
});
```

## Preventive Measures

1. **Use Connection Pooling**
   - Limit concurrent connections
   - Implement connection timeout
   - Add retry logic

2. **Monitor Database Performance**
   - Track connection count
   - Monitor query performance
   - Set up alerts for auth failures

3. **Implement Circuit Breaker**
   ```typescript
   class DatabaseCircuitBreaker {
     private failures = 0;
     private lastFailure = 0;
     private readonly threshold = 5;
     private readonly timeout = 60000; // 1 minute

     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.isOpen()) {
         throw new Error('Circuit breaker is open');
       }

       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }

     private isOpen(): boolean {
       if (this.failures >= this.threshold) {
         if (Date.now() - this.lastFailure > this.timeout) {
           this.reset();
           return false;
         }
         return true;
       }
       return false;
     }

     private onSuccess() {
       this.failures = 0;
     }

     private onFailure() {
       this.failures++;
       this.lastFailure = Date.now();
     }

     private reset() {
       this.failures = 0;
       this.lastFailure = 0;
     }
   }
   ```

4. **Use Database Migrations Safely**
   - Test in staging first
   - Use transaction-wrapped migrations
   - Have rollback plan ready

5. **Configure Proper Timeouts**
   ```typescript
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     statement_timeout: 30000, // 30 seconds
     query_timeout: 30000,
     connectionTimeoutMillis: 10000,
     idleTimeoutMillis: 30000
   });
   ```

## Quick Fix Commands

```bash
# Restart the service
render services restart <service-name>

# Check logs
render services logs <service-name> --tail 100

# Update environment variable
render services env set DATABASE_URL="new_connection_string"

# Scale up (if connection limit issue)
render services scale <service-name> --instances 2
```

## Long-term Solutions

1. **Use PgBouncer** for connection pooling
2. **Implement read replicas** for read-heavy workloads
3. **Set up monitoring** with DataDog, New Relic, or similar
4. **Use managed PostgreSQL** with automatic failover
5. **Implement caching layer** (Redis) to reduce database load

## Contact & Escalation

If issue persists after trying above solutions:
1. Check Render status page: https://status.render.com
2. Contact Render support with error logs
3. Consider database backup and restore
4. Review recent configuration changes

---

**Last Updated:** July 31, 2026  
**Related Documentation:**
- Database Schema: `database/migrations/`
- Connection Configuration: `src/config/database.ts`
- Worker Processes: `src/workers/`
