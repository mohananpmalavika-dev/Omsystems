# Compliance & Audit Scheduler

Automated job scheduler for Aditi Sentinel compliance and audit tasks.

## Features

- **Camera Health Monitoring** - Continuous health checks every 5 minutes
- **Storage Health Checks** - Capacity and performance monitoring every 30 minutes
- **Daily Recording Verification** - Verify recording availability and gaps
- **Weekly Quality Checks** - Sample-based camera quality assessment
- **Monthly Compliance Assessments** - Automated compliance framework assessments
- **Certificate Expiry Alerts** - Weekly checks for expiring certificates
- **Maintenance Tracking** - Daily checks for overdue work orders
- **Access Log Analysis** - Daily security pattern analysis

## Jobs Schedule

| Job | Frequency | Time | Description |
|-----|-----------|------|-------------|
| Camera Health Check | Every 5 minutes | Continuous | Monitor camera connectivity and stream quality |
| Storage Health Check | Every 30 minutes | Continuous | Check storage capacity and performance |
| Refresh Health Views | Every 10 minutes | Continuous | Refresh materialized views |
| Daily Recording Verification | Daily | 00:30 | Verify previous day recordings |
| Weekly Quality Check | Weekly | Monday 02:00 | Sample camera quality assessment |
| Monthly Compliance Assessment | Monthly | 1st at 01:00 | Run compliance assessments |
| Overdue Maintenance Alert | Daily | 08:00 | Check for overdue maintenance |
| Certificate Expiry Alert | Weekly | Monday 09:00 | Check expiring certificates |
| Access Log Analysis | Daily | 23:00 | Analyze access patterns |

## Configuration

Environment variables:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aditi_sentinel
DB_USER=postgres
DB_PASSWORD=your_password

# Application
NODE_ENV=production
CERTIFICATE_SIGNING_SECRET=your_secret_key
```

## Running

### Development
```bash
npm run scheduler:dev
```

### Production
```bash
npm run scheduler
```

### Docker
```bash
docker build -t aditi-sentinel-scheduler -f scheduler/Dockerfile .
docker run -d \
  --name aditi-scheduler \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=aditi_sentinel \
  -e DB_USER=postgres \
  -e DB_PASSWORD=your_password \
  aditi-sentinel-scheduler
```

### Docker Compose
```yaml
services:
  scheduler:
    build:
      context: .
      dockerfile: scheduler/Dockerfile
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: aditi_sentinel
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD}
      CERTIFICATE_SIGNING_SECRET: ${CERTIFICATE_SIGNING_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped
```

## Monitoring

### Logs
```bash
# View logs
docker logs -f aditi-scheduler

# Check job executions
psql -d aditi_sentinel -c "SELECT * FROM compliance_job_executions ORDER BY started_at DESC LIMIT 10;"
```

### Metrics

Query job execution history:
```sql
SELECT 
  job_type,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
  AVG(duration_seconds) as avg_duration_seconds
FROM compliance_job_executions
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY job_type
ORDER BY total_runs DESC;
```

### Health Check

```bash
# Check if scheduler is running
docker ps | grep aditi-scheduler

# Check recent job executions
curl http://localhost:3000/api/compliance/jobs?limit=10
```

## Job Details

### Camera Health Check
- Checks connectivity (RTSP, ONVIF)
- Monitors stream metrics (FPS, bitrate, resolution)
- Detects image issues (frozen, black, blur)
- Verifies recording status
- Calculates health score (0-100)
- Triggers alerts for critical issues

### Recording Verification
- Verifies 24-hour recording availability
- Detects and logs recording gaps
- Checks checksum integrity
- Validates timestamp continuity
- Generates compliance reports

### Compliance Assessment
- Checks all active requirements
- Tests control implementation
- Validates evidence
- Calculates compliance percentage
- Generates findings

### Certificate Expiry
- Checks certificates expiring in 30 days
- Sends notifications to stakeholders
- Tracks verification counts

## Troubleshooting

### Scheduler Not Running
```bash
# Check logs
docker logs aditi-scheduler

# Restart scheduler
docker restart aditi-scheduler
```

### Jobs Not Executing
```bash
# Check database connectivity
docker exec aditi-scheduler node -e "const {Pool} = require('pg'); const pool = new Pool({host: process.env.DB_HOST}); pool.query('SELECT NOW()').then(r => console.log(r.rows[0])).catch(console.error);"

# Check scheduled jobs
docker exec aditi-scheduler ps aux
```

### High Resource Usage
```bash
# Check running jobs
docker stats aditi-scheduler

# Adjust job frequency in scheduler-service.ts
# Reduce concurrent job execution
```

## Development

### Adding New Jobs

1. Create job handler in `SchedulerService`:
```typescript
private async myNewJob() {
  const jobExecution = await this.auditRepo.createComplianceJobExecution({
    tenantId: 'system',
    jobType: 'my_new_job',
    jobName: 'My New Job',
    startedAt: new Date().toISOString(),
    status: 'running',
  });

  try {
    // Job logic here
    
    await this.auditRepo.updateComplianceJobExecution(jobExecution.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      itemsProcessed: 100,
      itemsSucceeded: 95,
      itemsFailed: 5,
    });
  } catch (error) {
    await this.auditRepo.updateComplianceJobExecution(jobExecution.id, {
      status: 'failed',
      errorMessage: error.message,
    });
  }
}
```

2. Schedule job in `start()` method:
```typescript
this.scheduleJob('my-new-job', 60 * 60 * 1000, () => this.myNewJob());
```

### Testing Jobs

```typescript
// Test individual job
import { SchedulerService } from './services/scheduler-service';
const scheduler = new SchedulerService(pool);
await scheduler['runCameraHealthChecks'](); // Call private method
```

## Performance

- Camera health checks: ~100ms per camera
- Recording verification: ~500ms per camera per day
- Compliance assessment: ~10s per framework
- Storage checks: ~50ms per node

Expected resource usage:
- CPU: 5-10% average
- Memory: 512MB-1GB
- Network: Minimal
- Database connections: 5-10 concurrent

## Security

- All jobs run with system privileges
- No external API calls by default
- Database credentials in environment variables
- Audit trail for all job executions
- No sensitive data in logs

## Support

For issues or questions:
1. Check logs: `docker logs aditi-scheduler`
2. Query job history: See monitoring section
3. Review scheduler configuration
4. Contact DevOps team
