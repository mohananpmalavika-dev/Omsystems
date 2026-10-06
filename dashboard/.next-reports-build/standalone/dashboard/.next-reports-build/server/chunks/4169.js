"use strict";exports.id=4169,exports.ids=[4169],exports.modules={74169:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.d(b,{K:()=>h});var e=c(64939),f=c(94596),g=a([e]);e=(g.then?(await g)():g)[0];class h extends f.K2{static{this.instance=null}constructor(a){super(a),this.tenantId=process.env.DEFAULT_TENANT_ID||"default-tenant"}static getInstance(){if(!h.instance){let a=process.env.DATABASE_URL||process.env.POSTGRES_URL;if(!a)throw Error("DATABASE_URL or POSTGRES_URL is required");h.instance=new h(new e.Pool({connectionString:a}))}return h.instance}async approveDiscoveredDevice(a,b,c){return c?super.approveDiscoveredDevice(a,b,c):super.approveDiscoveredDevice(this.tenantId,a,b)}async rejectDiscoveredDevice(a,b,c){return c?super.rejectDiscoveredDevice(a,b,c):super.rejectDiscoveredDevice(this.tenantId,a,b||"system")}async listDiscoveredDevices(a,b){return(await super.getDiscoveredDevices(this.tenantId,{jobId:a,enrollmentStatus:b})).devices.map(a=>({...a,status:String(a.enrollmentStatus||"pending").toLowerCase().replace("_review","")}))}async deleteDiscoveredDevice(a,b){return b?super.deleteDiscoveredDevice(a,b):super.deleteDiscoveredDevice(this.tenantId,a)}async deleteAllPendingDiscoveredDevices(a,b){return void 0!==b?super.deleteAllPendingDiscoveredDevices(a,b):super.deleteAllPendingDiscoveredDevices(this.tenantId,a)}async listDiscoveryJobs(a,b){return void 0!==b?super.listDiscoveryJobs(a,b):(await super.listDiscoveryJobs(this.tenantId,{status:a?.toUpperCase(),limit:100})).jobs.map(a=>({id:a.id,branchId:a.branchId,networkRanges:String(a.networkRange||"").split(",").map(a=>a.trim()).filter(Boolean),protocols:Array.isArray(a.metadata?.protocols)?a.metadata.protocols:Array.isArray(a.metadata?.protocolFilter)?a.metadata.protocolFilter:[],status:String(a.status||"pending").toLowerCase(),devicesFound:Number(a.devicesDiscovered||0),devicesEnrolled:Number(a.devicesEnrolled||0),startedAt:a.startedAt||a.createdAt,completedAt:a.completedAt,initiatedBy:a.createdBy,error:a.errorMessage}))}async startDiscovery(a,b,c,d,e){if(void 0!==e)return super.startDiscovery(a,b,c,d,e);let f=Array.isArray(b)?b.join(","):b,g={deepScan:!1,includeDeviceTypes:void 0,excludeDeviceTypes:void 0,...e||{},...c?{protocols:c.map(a=>a.toUpperCase())}:{}};return super.startDiscovery(this.tenantId,a,f,g,d||"dashboard-user")}}d()}catch(a){d(a)}})},94596:(a,b,c)=>{c.d(b,{K2:()=>f});var d=c(23305),e=c(87111);class f{constructor(a){this.pool=a}async startDiscovery(a,b,c,d,e){if(!c.trim()||!function(a){let[b,c]=a.trim().split("/"),d=b?.split(".").map(Number),e=Number(c);return d?.length===4&&d.every(a=>Number.isInteger(a)&&a>=0&&a<=255)&&Number.isInteger(e)&&e>=0&&e<=32}(c))throw Error("invalid_network_range");let f=new Set(["ONVIF","SNMP","REST","MQTT"]);if(!d.protocols?.length||d.protocols.some(a=>!f.has(a.toUpperCase())))throw Error("at_least_one_protocol_required");let g=await this.pool.query(`INSERT INTO security_device_discovery_jobs (
        tenant_id, branch_id, network_range, scan_type,
        include_device_types, exclude_device_types,
        status, progress_percent, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,[a,b,c,d.deepScan?"DEEP":"QUICK",JSON.stringify(d.includeDeviceTypes||[]),JSON.stringify(d.excludeDeviceTypes||[]),"PENDING",0,JSON.stringify({protocols:d.protocols||[],deepScan:!!d.deepScan}),e]),h=this.mapDiscoveryJob(g.rows[0]);return this.executeDiscovery(h,c,d).catch(a=>{console.error("[DiscoveryService] Discovery job failed:",a)}),h}async executeDiscovery(a,b,c){try{await this.updateJobStatus(a.id,"RUNNING",0);let e=Date.now();console.log(`[DiscoveryService] Starting discovery job ${a.id} on ${b}`);let f=await d.TQ.discoverDevices(b,c),g=[];for(let[a,b]of f)g.push(...b),console.log(`[DiscoveryService] ${a} found ${b.length} devices`);console.log(`[DiscoveryService] Total discovered: ${g.length} devices`);let h=g;for(let b of(c.includeDeviceTypes&&c.includeDeviceTypes.length>0&&(h=h.filter(a=>a.deviceType&&c.includeDeviceTypes.includes(a.deviceType))),c.excludeDeviceTypes&&c.excludeDeviceTypes.length>0&&(h=h.filter(a=>!a.deviceType||!c.excludeDeviceTypes.includes(a.deviceType))),h)){if(await this.isJobCancelled(a.id))return;await this.saveDiscoveredDevice(a.tenantId,a.branchId??null,a.id,b)}let i=Math.floor((Date.now()-e)/1e3);await this.pool.query(`UPDATE security_device_discovery_jobs
         SET status = 'COMPLETED',
             progress_percent = 100,
             devices_discovered = $1,
             completed_at = NOW(),
             duration_seconds = $2
        WHERE id = $3 AND status <> 'CANCELLED'`,[h.length,i,a.id]),console.log(`[DiscoveryService] Job ${a.id} completed: ${h.length} devices in ${i}s`)}catch(b){console.error("[DiscoveryService] Discovery job failed:",b),await this.pool.query(`UPDATE security_device_discovery_jobs
         SET status = 'FAILED',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,[String(b),a.id])}}async cancelDiscovery(a,b){return 1===(await this.pool.query(`UPDATE security_device_discovery_jobs
       SET status = 'CANCELLED', completed_at = COALESCE(completed_at, NOW()), error_message = 'Cancelled by operator'
       WHERE id = $1 AND tenant_id = $2 AND status IN ('PENDING', 'RUNNING')
       RETURNING id`,[b,a])).rowCount}async retryDiscovery(a,b,c){let d=await this.getDiscoveryJob(a,b);if(!d)throw Error("discovery_job_not_found");if(!["FAILED","CANCELLED","COMPLETED"].includes(d.status))throw Error("only_finished_discovery_jobs_can_be_retried");let e=d.metadata??{};return this.startDiscovery(a,d.branchId??null,d.networkRange,{deepScan:"DEEP"===d.scanType,protocols:Array.isArray(e.protocols)?e.protocols:[]},c)}async isJobCancelled(a){let b=await this.pool.query("SELECT status = 'CANCELLED' AS cancelled FROM security_device_discovery_jobs WHERE id = $1",[a]);return b.rows[0]?.cancelled===!0}async updateJobStatus(a,b,c){let d=["status = $1","progress_percent = $2"],e=[b,c];"RUNNING"===b&&d.push("started_at = NOW()"),await this.pool.query(`UPDATE security_device_discovery_jobs
       SET ${d.join(", ")}
       WHERE id = $${e.length+1}`,[...e,a])}async saveDiscoveredDevice(a,b,c,d){await this.pool.query(`WITH updated AS (
        UPDATE security_discovered_devices
        SET discovery_job_id = $3,
            discovered_at = NOW(),
            confidence = GREATEST($15, confidence)
        WHERE tenant_id = $1
          AND branch_id IS NOT DISTINCT FROM $2
          AND ip_address = $4
        RETURNING id
      )
      INSERT INTO security_discovered_devices (
        tenant_id, branch_id, discovery_job_id,
        ip_address, mac_address, port, device_type,
        manufacturer, model, serial_number, firmware_version, protocol,
        capabilities, metadata, confidence, enrollment_status
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16
      WHERE NOT EXISTS (SELECT 1 FROM updated)`,[a,b,c,d.ipAddress,d.macAddress,d.port,d.deviceType,d.manufacturer,d.model,d.serialNumber,d.firmwareVersion,d.protocol,JSON.stringify(d.capabilities||[]),JSON.stringify(d.metadata),d.confidence,"PENDING_REVIEW"])}async getDiscoveryJob(a,b){let c=await this.pool.query(`SELECT * FROM security_device_discovery_jobs
       WHERE id = $1 AND tenant_id = $2`,[b,a]);return c.rows[0]?this.mapDiscoveryJob(c.rows[0]):null}async listDiscoveryJobs(a,b){let c=`
      SELECT * FROM security_device_discovery_jobs
      WHERE tenant_id = $1
    `,d=[a],e=2;b.branchId&&(c+=` AND branch_id = $${e}`,d.push(b.branchId),e++),b.status&&(c+=` AND status = $${e}`,d.push(b.status),e++);let f=parseInt((await this.pool.query(c.replace("SELECT *","SELECT COUNT(*)"),d)).rows[0].count);return c+=" ORDER BY created_at DESC",b.limit&&(c+=` LIMIT $${e}`,d.push(b.limit),e++),b.offset&&(c+=` OFFSET $${e}`,d.push(b.offset)),{jobs:(await this.pool.query(c,d)).rows.map(this.mapDiscoveryJob),total:f}}async getDiscoveredDevices(a,b){let c=`
      FROM security_discovered_devices d
      WHERE d.tenant_id = $1
        AND (
          d.enrollment_status <> 'ENROLLED'
          OR d.enrolled_device_id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM security_devices s
          WHERE s.tenant_id = d.tenant_id
            AND (d.branch_id IS NULL OR s.branch_id = d.branch_id)
            AND (
              (d.ip_address IS NOT NULL AND s.ip_address IS NOT NULL AND s.ip_address = d.ip_address)
              OR (
                d.mac_address IS NOT NULL
                AND s.mac_address IS NOT NULL
                AND LOWER(s.mac_address::text) = LOWER(d.mac_address::text)
              )
              OR (
                d.serial_number IS NOT NULL
                AND s.serial_number IS NOT NULL
                AND NULLIF(BTRIM(s.serial_number), '') IS NOT NULL
                AND NULLIF(BTRIM(d.serial_number), '') IS NOT NULL
                AND LOWER(BTRIM(s.serial_number)) = LOWER(BTRIM(d.serial_number))
              )
            )
        )
    `,d=[a],e=2;b.branchId&&(c+=` AND d.branch_id = $${e}`,d.push(b.branchId),e++),b.jobId&&(c+=` AND d.discovery_job_id = $${e}`,d.push(b.jobId),e++);let f=function(a){let b=a?.trim().toUpperCase();if(b)return"PENDING"===b?"PENDING_REVIEW":b}(b.enrollmentStatus);f&&(c+=` AND d.enrollment_status = $${e}`,d.push(f),e++);let g=parseInt((await this.pool.query(`SELECT COUNT(*) ${c}`,d)).rows[0].count),h=`SELECT d.* ${c} ORDER BY d.discovered_at DESC`;b.limit&&(h+=` LIMIT $${e}`,d.push(b.limit),e++),b.offset&&(h+=` OFFSET $${e}`,d.push(b.offset));let i=await this.pool.query(h,d),j=this.deduplicateDiscoveredDevices(i.rows.map(this.mapDiscoveredDevice));return{devices:j,total:Math.min(g,j.length)}}async enrollDevices(a,b,c){let d=[],f=(0,e.k6)(this.pool);for(let e of b.discoveredDeviceIds)try{let g=await this.pool.query(`SELECT * FROM security_discovered_devices
           WHERE id = $1 AND tenant_id = $2 AND enrollment_status = 'APPROVED'`,[e,a]);if(0===g.rows.length){console.warn(`[DiscoveryService] Device ${e} not found or not approved`);continue}let h=this.mapDiscoveredDevice(g.rows[0]),i=await f.createDevice({tenantId:a,branchId:b.branchId,type:h.deviceType,name:this.generateDeviceName(h),description:`Auto-discovered ${h.manufacturer} ${h.model}`,manufacturer:h.manufacturer,model:h.model,serialNumber:h.serialNumber,firmwareVersion:h.firmwareVersion,ipAddress:h.ipAddress,macAddress:h.macAddress,port:h.port,protocol:h.protocol,capabilities:h.capabilities,credentialRefId:h.metadata?.axProConfig?.credentialSecretId,metadata:{...h.metadata,autoEnrolled:!0,discoveredAt:h.discoveredAt,discoveryConfidence:h.confidence}},c);d.push(i),await this.pool.query(`UPDATE security_discovered_devices
           SET enrollment_status = 'ENROLLED',
               enrolled_device_id = $1
           WHERE id = $2`,[i.id,e]),await this.pool.query(`UPDATE security_device_discovery_jobs
           SET devices_enrolled = devices_enrolled + 1
           WHERE id = (SELECT discovery_job_id FROM security_discovered_devices WHERE id = $1)`,[e])}catch(a){console.error(`[DiscoveryService] Failed to enroll device ${e}:`,a)}return d}async approveDiscoveredDevice(a,b,c){if(0===(await this.pool.query(`UPDATE security_discovered_devices
       SET enrollment_status = 'APPROVED',
           reviewed_by = $1,
           reviewed_at = NOW()
       WHERE id = $2 AND tenant_id = $3
         AND enrollment_status = 'PENDING_REVIEW'`,[c,b,a])).rowCount)throw Error("discovered_device_not_pending")}async rejectDiscoveredDevice(a,b,c){if(0===(await this.pool.query(`UPDATE security_discovered_devices
       SET enrollment_status = 'REJECTED',
           reviewed_by = $1,
           reviewed_at = NOW()
       WHERE id = $2 AND tenant_id = $3
         AND enrollment_status = 'PENDING_REVIEW'`,[c,b,a])).rowCount)throw Error("discovered_device_not_pending")}async deleteDiscoveredDevice(a,b){if(0===(await this.pool.query(`DELETE FROM security_discovered_devices
       WHERE id = $1 AND tenant_id = $2
         AND enrollment_status = 'PENDING_REVIEW'`,[b,a])).rowCount)throw Error("discovered_device_not_found_or_not_pending")}async deleteAllPendingDiscoveredDevices(a,b){let c=[a],d="";return b&&(c.push(b),d=" AND branch_id = $2"),(await this.pool.query(`DELETE FROM security_discovered_devices
       WHERE tenant_id = $1${d}
         AND enrollment_status = 'PENDING_REVIEW'`,c)).rowCount??0}generateDeviceName(a){let b=[];return a.deviceType&&b.push(a.deviceType.replace(/_/g," ")),a.manufacturer&&b.push(a.manufacturer),a.model&&b.push(a.model),b.push(`(${a.ipAddress})`),b.join(" - ")}mapDiscoveryJob(a){return{id:a.id,tenantId:a.tenant_id,branchId:a.branch_id,networkRange:a.network_range,scanType:a.scan_type,includeDeviceTypes:a.include_device_types||[],excludeDeviceTypes:a.exclude_device_types||[],status:a.status,progressPercent:parseFloat(a.progress_percent),devicesDiscovered:a.devices_discovered,devicesEnrolled:a.devices_enrolled,startedAt:a.started_at,completedAt:a.completed_at,durationSeconds:a.duration_seconds,errorMessage:a.error_message,metadata:a.metadata||{},createdAt:a.created_at,createdBy:a.created_by}}mapDiscoveredDevice(a){return{id:a.id,jobId:a.discovery_job_id,ipAddress:a.ip_address,macAddress:a.mac_address,port:a.port,deviceType:a.device_type,manufacturer:a.manufacturer,model:a.model,serialNumber:a.serial_number,firmwareVersion:a.firmware_version,protocol:a.protocol,capabilities:a.capabilities||[],metadata:a.metadata||{},discoveredAt:a.discovered_at,confidence:parseFloat(a.confidence),enrollmentStatus:a.enrollment_status,enrolledDeviceId:a.enrolled_device_id}}deduplicateDiscoveredDevices(a){let b=new Set,c=[];for(let d of a){let a=[d.ipAddress&&`ip:${d.ipAddress.trim().toLowerCase()}`,d.macAddress&&`mac:${d.macAddress.trim().toLowerCase()}`,d.serialNumber&&`serial:${d.serialNumber.trim().toLowerCase()}`].filter(a=>!!a);a.some(a=>b.has(a))||(a.forEach(a=>b.add(a)),c.push(d))}return c}}}};