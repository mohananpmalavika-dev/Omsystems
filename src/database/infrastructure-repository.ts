import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  BranchCameraRequirementInput,
  CameraComplianceInput,
  CameraDetailsUpdate,
  CameraSpecificationsInput,
} from "../control-plane-store.js";
import type { NodeType } from "../domain/models.js";

type JsonRecord = Record<string, any>;

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelRow<T = JsonRecord>(row: JsonRecord): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelKey(key),
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

function camelRows<T = JsonRecord>(rows: JsonRecord[]): T[] {
  return rows.map((row) => camelRow<T>(row));
}

const organizationSelect = `
  SELECT id::text, tenant_id::text, parent_id::text, node_type AS type,
         name, code, description, address, contact_info, metadata, is_active,
         path::text, created_at, updated_at
  FROM resource_nodes`;

export class InfrastructureRepository {
  constructor(protected readonly pool: Pool) {}

  async getCameraSpecifications(cameraId: string) {
    const result = await this.pool.query(
      `SELECT id::text, camera_id::text, resolution_mp, resolution_width,
              resolution_height, frame_rate, video_codec, bitrate_kbps,
              field_of_view_horizontal, field_of_view_vertical, focal_length_mm,
              lens_type, has_night_vision, ir_distance_meters, has_wdr,
              min_illumination_lux, weatherproof_rating, operating_temp_min,
              operating_temp_max, vandal_resistant, power_consumption_watts,
              power_supply_type, poe_class, storage_days,
              avg_storage_per_day_gb, has_two_way_audio, has_motion_detection,
              has_analytics, analytics_features, created_at, updated_at
       FROM camera_specifications WHERE camera_id = $1`,
      [cameraId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async upsertCameraSpecifications(
    cameraId: string,
    input: CameraSpecificationsInput,
  ) {
    const values = [
      cameraId, input.resolutionMp, input.resolutionWidth,
      input.resolutionHeight, input.frameRate, input.videoCodec,
      input.bitrateKbps ?? null, input.fieldOfViewHorizontal ?? null,
      input.fieldOfViewVertical ?? null, input.focalLengthMm ?? null,
      input.lensType ?? null, input.hasNightVision,
      input.irDistanceMeters ?? null, input.hasWdr,
      input.minIlluminationLux ?? null, input.weatherproofRating ?? null,
      input.operatingTempMin ?? null, input.operatingTempMax ?? null,
      input.vandalResistant, input.powerConsumptionWatts ?? null,
      input.powerSupplyType ?? null, input.poeClass ?? null,
      input.storageDays, input.avgStoragePerDayGb ?? null,
      input.hasTwoWayAudio, input.hasMotionDetection, input.hasAnalytics,
      JSON.stringify(input.analyticsFeatures),
    ];
    await this.pool.query(
      `INSERT INTO camera_specifications (
         camera_id, resolution_mp, resolution_width, resolution_height,
         frame_rate, video_codec, bitrate_kbps, field_of_view_horizontal,
         field_of_view_vertical, focal_length_mm, lens_type, has_night_vision,
         ir_distance_meters, has_wdr, min_illumination_lux,
         weatherproof_rating, operating_temp_min, operating_temp_max,
         vandal_resistant, power_consumption_watts, power_supply_type,
         poe_class, storage_days, avg_storage_per_day_gb, has_two_way_audio,
         has_motion_detection, has_analytics, analytics_features
       ) VALUES (
         $1,$2,$3,$4,$5,$6::video_codec,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         $16::weatherproof_rating,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
         $27,$28::jsonb
       )
       ON CONFLICT (camera_id) DO UPDATE SET
         resolution_mp=EXCLUDED.resolution_mp,
         resolution_width=EXCLUDED.resolution_width,
         resolution_height=EXCLUDED.resolution_height,
         frame_rate=EXCLUDED.frame_rate, video_codec=EXCLUDED.video_codec,
         bitrate_kbps=EXCLUDED.bitrate_kbps,
         field_of_view_horizontal=EXCLUDED.field_of_view_horizontal,
         field_of_view_vertical=EXCLUDED.field_of_view_vertical,
         focal_length_mm=EXCLUDED.focal_length_mm, lens_type=EXCLUDED.lens_type,
         has_night_vision=EXCLUDED.has_night_vision,
         ir_distance_meters=EXCLUDED.ir_distance_meters,
         has_wdr=EXCLUDED.has_wdr,
         min_illumination_lux=EXCLUDED.min_illumination_lux,
         weatherproof_rating=EXCLUDED.weatherproof_rating,
         operating_temp_min=EXCLUDED.operating_temp_min,
         operating_temp_max=EXCLUDED.operating_temp_max,
         vandal_resistant=EXCLUDED.vandal_resistant,
         power_consumption_watts=EXCLUDED.power_consumption_watts,
         power_supply_type=EXCLUDED.power_supply_type,
         poe_class=EXCLUDED.poe_class, storage_days=EXCLUDED.storage_days,
         avg_storage_per_day_gb=EXCLUDED.avg_storage_per_day_gb,
         has_two_way_audio=EXCLUDED.has_two_way_audio,
         has_motion_detection=EXCLUDED.has_motion_detection,
         has_analytics=EXCLUDED.has_analytics,
         analytics_features=EXCLUDED.analytics_features, updated_at=now()`,
      values,
    );
    return (await this.getCameraSpecifications(cameraId))!;
  }

  async getCameraCompliance(cameraId: string) {
    const result = await this.pool.query(
      `SELECT id::text, camera_id::text, meets_resolution_requirement,
              meets_frame_rate_requirement, meets_coverage_requirement,
              meets_retention_requirement, proper_lighting, proper_angle,
              compliance_notes, last_inspection_date, next_inspection_date,
              inspector_name, audio_recording_compliant,
              privacy_mask_configured, signage_installed, created_at, updated_at
       FROM camera_installation_compliance
       WHERE camera_id = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [cameraId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async upsertCameraCompliance(cameraId: string, input: CameraComplianceInput) {
    await this.pool.query(
      `INSERT INTO camera_installation_compliance (
         camera_id, meets_resolution_requirement, meets_frame_rate_requirement,
         meets_coverage_requirement, meets_retention_requirement,
         proper_lighting, proper_angle, compliance_notes, last_inspection_date,
         next_inspection_date, inspector_name, audio_recording_compliant,
         privacy_mask_configured, signage_installed
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (camera_id) DO UPDATE SET
         meets_resolution_requirement=EXCLUDED.meets_resolution_requirement,
         meets_frame_rate_requirement=EXCLUDED.meets_frame_rate_requirement,
         meets_coverage_requirement=EXCLUDED.meets_coverage_requirement,
         meets_retention_requirement=EXCLUDED.meets_retention_requirement,
         proper_lighting=EXCLUDED.proper_lighting,
         proper_angle=EXCLUDED.proper_angle,
         compliance_notes=EXCLUDED.compliance_notes,
         last_inspection_date=EXCLUDED.last_inspection_date,
         next_inspection_date=EXCLUDED.next_inspection_date,
         inspector_name=EXCLUDED.inspector_name,
         audio_recording_compliant=EXCLUDED.audio_recording_compliant,
         privacy_mask_configured=EXCLUDED.privacy_mask_configured,
         signage_installed=EXCLUDED.signage_installed, updated_at=now()`,
      [
        cameraId, input.meetsResolutionRequirement,
        input.meetsFrameRateRequirement, input.meetsCoverageRequirement,
        input.meetsRetentionRequirement, input.properLighting,
        input.properAngle, input.complianceNotes ?? null,
        input.lastInspectionDate ?? null, input.nextInspectionDate ?? null,
        input.inspectorName ?? null, input.audioRecordingCompliant,
        input.privacyMaskConfigured, input.signageInstalled,
      ],
    );
    return (await this.getCameraCompliance(cameraId))!;
  }

  async updateCameraDetails(cameraId: string, details: CameraDetailsUpdate) {
    const entries: Array<[string, unknown, string?]> = [
      ["location_type", details.locationType, "camera_location_type"],
      ["physical_type", details.physicalType, "physical_camera_type"],
      ["installation_date", details.installationDate],
      ["warranty_expires_at", details.warrantyExpiresAt],
      ["serial_number", details.serialNumber],
      ["mac_address", details.macAddress, "macaddr"],
      ["firmware_version", details.firmwareVersion],
      ["ip_address", details.ipAddress, "inet"],
      ["installation_notes", details.installationNotes],
    ];
    const supplied = entries.filter(([, value]) => value !== undefined);
    if (supplied.length > 0) {
      const assignments = supplied.map(
        ([column, , cast], index) =>
          `${column} = $${index + 2}${cast ? `::${cast}` : ""}`,
      );
      await this.pool.query(
        `UPDATE cameras SET ${assignments.join(", ")} WHERE id = $1`,
        [cameraId, ...supplied.map(([, value]) => value)],
      );
    }
    return this.getEnhancedCamera(cameraId);
  }

  async getEnhancedCamera(cameraId: string) {
    const result = await this.pool.query(
      `SELECT c.id::text, n.name, c.resource_node_id::text AS node_id,
              c.branch_node_id::text AS branch_id, c.vendor, c.model,
              c.channel, c.protocol, c.status, c.profiles, c.capabilities,
              c.connection_secret_ref, c.location_type, c.physical_type,
              c.installation_date, c.warranty_expires_at, c.serial_number,
              c.mac_address::text, c.firmware_version, c.ip_address::text,
              c.installation_notes
       FROM cameras c JOIN resource_nodes n ON n.id=c.resource_node_id
       WHERE c.id=$1`,
      [cameraId],
    );
    if (!result.rows[0]) throw new Error("camera_not_found");
    return camelRow(result.rows[0]);
  }

  async getBranchCameraRequirements(branchId: string) {
    const result = await this.pool.query(
      `SELECT id::text, branch_node_id::text, location_type, required_count,
              actual_count, min_resolution_mp, min_frame_rate,
              requires_night_vision, requires_audio, requires_ptz, requires_lpr,
              priority, is_regulatory_requirement, compliance_standard, notes,
              created_at, updated_at
       FROM branch_camera_requirements
       WHERE branch_node_id=$1 ORDER BY priority, location_type`,
      [branchId],
    );
    return camelRows(result.rows);
  }

  async upsertBranchCameraRequirement(
    branchId: string,
    input: BranchCameraRequirementInput,
  ) {
    await this.pool.query(
      `INSERT INTO branch_camera_requirements (
         branch_node_id, location_type, required_count, min_resolution_mp,
         min_frame_rate, requires_night_vision, requires_audio, requires_ptz,
         requires_lpr, priority, is_regulatory_requirement,
         compliance_standard, notes
       ) VALUES ($1,$2::camera_location_type,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (branch_node_id, location_type) DO UPDATE SET
         required_count=EXCLUDED.required_count,
         min_resolution_mp=EXCLUDED.min_resolution_mp,
         min_frame_rate=EXCLUDED.min_frame_rate,
         requires_night_vision=EXCLUDED.requires_night_vision,
         requires_audio=EXCLUDED.requires_audio,
         requires_ptz=EXCLUDED.requires_ptz,
         requires_lpr=EXCLUDED.requires_lpr, priority=EXCLUDED.priority,
         is_regulatory_requirement=EXCLUDED.is_regulatory_requirement,
         compliance_standard=EXCLUDED.compliance_standard,
         notes=EXCLUDED.notes, updated_at=now()`,
      [
        branchId, input.locationType, input.requiredCount,
        input.minResolutionMp, input.minFrameRate, input.requiresNightVision,
        input.requiresAudio, input.requiresPtz, input.requiresLpr,
        input.priority, input.isRegulatoryRequirement,
        input.complianceStandard ?? null, input.notes ?? null,
      ],
    );
    const rows = await this.getBranchCameraRequirements(branchId);
    return rows.find((row: any) => row.locationType === input.locationType)!;
  }

  async initializeBranchCameraRequirements(branchId: string) {
    await this.pool.query("SELECT populate_branch_camera_requirements($1)", [branchId]);
  }

  async getBranchCoverageGaps(branchId: string) {
    const result = await this.pool.query(
      `SELECT branch_node_id::text, branch_name, location_type, required_count,
              actual_count, gap_count, priority, is_regulatory_requirement,
              compliance_standard
       FROM branch_camera_coverage_gaps
       WHERE branch_node_id=$1 ORDER BY priority, location_type`,
      [branchId],
    );
    return camelRows(result.rows);
  }

  async getBranchComplianceSummary(branchId: string) {
    const result = await this.pool.query(
      "SELECT * FROM camera_compliance_summary WHERE branch_node_id=$1 ORDER BY camera_name",
      [branchId],
    );
    return camelRows(result.rows);
  }

  async getCamerasDueForInspection(daysAhead: number) {
    const result = await this.pool.query(
      `SELECT * FROM camera_compliance_summary
       WHERE next_inspection_date IS NOT NULL
         AND next_inspection_date <= current_date + $1::integer
       ORDER BY next_inspection_date`,
      [daysAhead],
    );
    return camelRows(result.rows);
  }

  async getOrganizationTree(tenantId: string) {
    const nodes = await this.listOrganizationNodes(tenantId, undefined, undefined, false);
    const byId = new Map(nodes.map((node: any) => [node.id, { ...node, children: [] }]));
    const roots: any[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async getOrganizationStatistics(tenantId: string) {
    const result = await this.pool.query(
      `SELECT node_type AS type, count(*)::integer AS count
       FROM resource_nodes
       WHERE tenant_id=$1 AND is_active=true AND node_type<>'camera'
       GROUP BY node_type`,
      [tenantId],
    );
    const counts = Object.fromEntries(result.rows.map((row) => [row.type, row.count]));
    const cameras = await this.pool.query(
      `SELECT count(*)::integer AS total,
              count(*) FILTER (WHERE status='online')::integer AS online
       FROM cameras c JOIN resource_nodes n ON n.id=c.resource_node_id
       WHERE n.tenant_id=$1`,
      [tenantId],
    );
    return { nodes: counts, cameras: cameras.rows[0] };
  }

  async listOrganizationNodes(
    tenantId: string,
    type?: string,
    parentId?: string,
    includeInactive = false,
  ) {
    const result = await this.pool.query(
      `${organizationSelect}
       WHERE tenant_id=$1
         AND (
           ($2::resource_node_type IS NULL AND node_type<>'camera')
           OR node_type=$2
         )
         AND ($3::uuid IS NULL OR parent_id=$3)
         AND ($4 OR is_active=true)
       ORDER BY path`,
      [tenantId, type ?? null, parentId ?? null, includeInactive],
    );
    return camelRows(result.rows);
  }

  async getOrganizationNodeDetails(id: string) {
    const result = await this.pool.query(
      `${organizationSelect} WHERE id=$1`,
      [id],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async getNodeHierarchyPath(id: string) {
    const result = await this.pool.query(
      "SELECT id::text, node_type AS type, name, code, level FROM get_node_hierarchy_path($1)",
      [id],
    );
    return camelRows(result.rows);
  }

  async getDescendantNodes(id: string, includeInactive = false) {
    const result = await this.pool.query(
      `SELECT id::text, node_type AS type, name, code, path::text, depth
       FROM get_descendant_nodes($1,$2)
       WHERE node_type<>'camera'`,
      [id, includeInactive],
    );
    return camelRows(result.rows);
  }

  async createOrganizationNode(tenantId: string, input: any) {
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO resource_nodes (
         id, tenant_id, parent_id, node_type, name, path, code, description,
         address, contact_info, metadata
       )
       SELECT $1, $2, parent.id, $4::resource_node_type, $5,
              CASE WHEN parent.id IS NULL
                THEN text2ltree(replace($1::text,'-','_'))
                ELSE parent.path || text2ltree(replace($1::text,'-','_'))
              END,
              $6, $7, $8::jsonb, $9::jsonb, $10::jsonb
       FROM (SELECT id, path FROM resource_nodes WHERE id=$3::uuid
             UNION ALL SELECT NULL::uuid, NULL::ltree WHERE $3::uuid IS NULL) parent
       RETURNING id::text`,
      [
        id, tenantId, input.parentNodeId ?? null, input.nodeType, input.name,
        input.code ?? null, input.description ?? null,
        JSON.stringify(input.address ?? {}), JSON.stringify(input.contactInfo ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (!result.rows[0]) throw new Error("invalid_parent");
    return this.getOrganizationNodeDetails(id);
  }

  async updateOrganizationNode(id: string, input: any) {
    const fields: Array<[string, unknown, string?]> = [
      ["name", input.name], ["code", input.code],
      ["description", input.description], ["address", input.address, "jsonb"],
      ["contact_info", input.contactInfo, "jsonb"],
      ["metadata", input.metadata, "jsonb"], ["is_active", input.isActive],
    ];
    const supplied = fields.filter(([, value]) => value !== undefined);
    if (supplied.length === 0) return this.getOrganizationNodeDetails(id);
    const assignments = supplied.map(
      ([column, , cast], index) =>
        `${column}=$${index + 2}${cast ? `::${cast}` : ""}`,
    );
    const values = supplied.map(([, value, cast]) =>
      cast === "jsonb" ? JSON.stringify(value) : value
    );
    await this.pool.query(
      `UPDATE resource_nodes SET ${assignments.join(", ")} WHERE id=$1`,
      [id, ...values],
    );
    return this.getOrganizationNodeDetails(id);
  }

  async deactivateOrganizationNode(id: string) {
    await this.pool.query("UPDATE resource_nodes SET is_active=false WHERE id=$1", [id]);
  }

  async validateHierarchyRelationship(parentNodeId: string, childNodeType: string) {
    const result = await this.pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM resource_nodes parent
         JOIN organizational_hierarchy_rules rule
           ON rule.parent_type=parent.node_type
         WHERE parent.id=$1 AND rule.child_type=$2::resource_node_type
           AND rule.is_valid=true
       ) AS valid`,
      [parentNodeId, childNodeType],
    );
    return Boolean(result.rows[0]?.valid);
  }

  private userSelect(includePassword = false) {
    return `SELECT u.id::text, u.tenant_id::text, u.identity_subject,
      u.display_name, u.email, u.username, u.employee_id, u.phone_number,
      u.role, u.status, u.department, u.designation, u.date_of_joining,
      u.date_of_birth, u.reporting_to_user_id::text, u.last_login_at,
      u.must_change_password, u.preferences, u.active, u.created_at, u.updated_at
      ,(SELECT assignment.scope_node_id::text
        FROM user_organizational_assignments assignment
        WHERE assignment.user_id=u.id AND assignment.is_primary=true
        LIMIT 1) AS primary_org_node_id
      ,(SELECT node.name
        FROM user_organizational_assignments assignment
        JOIN resource_nodes node ON node.id=assignment.scope_node_id
        WHERE assignment.user_id=u.id AND assignment.is_primary=true
        LIMIT 1) AS primary_org_name
      ${includePassword ? ", u.password_hash" : ""}
      FROM users u`;
  }

  async getUserById(id: string) {
    const result = await this.pool.query(`${this.userSelect()} WHERE u.id=$1`, [id]);
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async getUserDetails(id: string) {
    const user = await this.getUserById(id);
    if (!user) return undefined;
    const assignments = await this.pool.query(
      `SELECT uoa.id::text, uoa.scope_node_id::text, uoa.is_primary,
              rn.name AS scope_name, rn.node_type AS scope_type
       FROM user_organizational_assignments uoa
       JOIN resource_nodes rn ON rn.id=uoa.scope_node_id
       WHERE uoa.user_id=$1 ORDER BY uoa.is_primary DESC, rn.name`,
      [id],
    );
    return { ...user, organizations: camelRows(assignments.rows) };
  }

  async getUserWithPassword(id: string) {
    const result = await this.pool.query(
      `${this.userSelect(true)} WHERE u.id=$1`,
      [id],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async findUserByUsername(username: string, tenantSlug?: string) {
    const result = await this.pool.query(
      `${this.userSelect(true)}
       JOIN tenants t ON t.id=u.tenant_id
       WHERE lower(u.username)=lower($1)
         AND ($2::text IS NULL OR t.slug=$2) LIMIT 1`,
      [username, tenantSlug ?? null],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async findUserByEmail(email: string, tenantSlug?: string) {
    const result = await this.pool.query(
      `${this.userSelect(true)}
       JOIN tenants t ON t.id=u.tenant_id
       WHERE lower(u.email)=lower($1)
         AND ($2::text IS NULL OR t.slug=$2) LIMIT 1`,
      [email, tenantSlug ?? null],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async listUsers(tenantId: string, filters: any) {
    const values: unknown[] = [tenantId];
    const clauses = ["u.tenant_id=$1"];
    if (filters.role) {
      values.push(filters.role);
      clauses.push(`u.role=$${values.length}::user_role`);
    }
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`u.status=$${values.length}::user_status`);
    }
    if (filters.orgNodeId) {
      values.push(filters.orgNodeId);
      clauses.push(`EXISTS (SELECT 1 FROM user_organizational_assignments a
        JOIN resource_nodes assigned_scope ON assigned_scope.id=a.scope_node_id
        JOIN resource_nodes requested_scope ON requested_scope.id=$${values.length}
        WHERE a.user_id=u.id AND assigned_scope.path <@ requested_scope.path)`);
    }
    if (filters.managerUserId) {
      values.push(filters.managerUserId);
      const managerParameter = values.length;
      clauses.push(`EXISTS (
        SELECT 1
        FROM user_organizational_assignments target_assignment
        JOIN resource_nodes target_scope
          ON target_scope.id=target_assignment.scope_node_id
        JOIN access_grants manager_grant
          ON manager_grant.user_id=$${managerParameter}
         AND manager_grant.action='user:manage'
         AND manager_grant.effect='allow'
        JOIN resource_nodes manager_scope
          ON manager_scope.id=manager_grant.scope_node_id
        WHERE target_assignment.user_id=u.id
          AND target_scope.path <@ manager_scope.path
          AND (manager_grant.valid_from IS NULL OR manager_grant.valid_from<=now())
          AND (manager_grant.valid_until IS NULL OR manager_grant.valid_until>now())
          AND NOT EXISTS (
            SELECT 1
            FROM access_grants deny_grant
            JOIN resource_nodes deny_scope ON deny_scope.id=deny_grant.scope_node_id
            WHERE deny_grant.user_id=$${managerParameter}
              AND deny_grant.action='user:manage'
              AND deny_grant.effect='deny'
              AND target_scope.path <@ deny_scope.path
              AND (deny_grant.valid_from IS NULL OR deny_grant.valid_from<=now())
              AND (deny_grant.valid_until IS NULL OR deny_grant.valid_until>now())
          )
      )`);
    }
    if (filters.search) {
      values.push(`%${filters.search}%`);
      clauses.push(`(u.display_name ILIKE $${values.length}
        OR u.username ILIKE $${values.length}
        OR u.email ILIKE $${values.length}
        OR u.employee_id ILIKE $${values.length})`);
    }
    const count = await this.pool.query(
      `SELECT count(*)::integer AS total FROM users u WHERE ${clauses.join(" AND ")}`,
      values,
    );
    values.push(filters.limit ?? 50, filters.offset ?? 0);
    const result = await this.pool.query(
      `${this.userSelect()} WHERE ${clauses.join(" AND ")}
       ORDER BY u.display_name LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { data: camelRows(result.rows), total: count.rows[0]?.total ?? 0 };
  }

  async createUser(tenantId: string, input: any) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users (
           tenant_id, identity_subject, display_name, email, username,
           password_hash, employee_id, phone_number, role, status, department,
           designation, date_of_joining, date_of_birth, reporting_to_user_id,
           active
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::user_role,'active',$10,$11,$12,$13,$14,true
         ) RETURNING id::text`,
        [
          tenantId, input.username, input.displayName, input.email,
          input.username, input.passwordHash, input.employeeId ?? null,
          input.phoneNumber ?? null, input.role, input.department ?? null,
          input.designation ?? null, input.dateOfJoining ?? null,
          input.dateOfBirth ?? null, input.reportingToUserId ?? null,
        ],
      );
      const id = result.rows[0]!.id;
      await this.assignOrganization(client, id, input.primaryOrgNodeId, true, input.createdBy ?? null);
      await client.query("COMMIT");
      return this.getUserWithPassword(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(id: string, input: any) {
    const mapping: Array<[string, unknown, string?]> = [
      ["email", input.email], ["display_name", input.displayName],
      ["phone_number", input.phoneNumber], ["role", input.role, "user_role"],
      ["status", input.status, "user_status"], ["department", input.department],
      ["designation", input.designation], ["date_of_joining", input.dateOfJoining],
      ["date_of_birth", input.dateOfBirth],
      ["reporting_to_user_id", input.reportingToUserId, "uuid"],
      ["preferences", input.preferences, "jsonb"],
    ];
    const supplied = mapping.filter(([, value]) => value !== undefined);
    if (supplied.length > 0) {
      const assignments = supplied.map(
        ([column, , cast], index) =>
          `${column}=$${index + 2}${cast ? `::${cast}` : ""}`,
      );
      const values = supplied.map(([, value, cast]) =>
        cast === "jsonb" ? JSON.stringify(value) : value
      );
      await this.pool.query(
        `UPDATE users SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1`,
        [id, ...values],
      );
    }
    return this.getUserWithPassword(id);
  }

  async deactivateUser(id: string) {
    await this.pool.query(
      "UPDATE users SET active=false,status='inactive',updated_at=now() WHERE id=$1",
      [id],
    );
  }

  async updateUserPassword(id: string, passwordHash: string, mustChange = false) {
    await this.pool.query(
      `UPDATE users SET password_hash=$2,password_changed_at=now(),
              must_change_password=$3,updated_at=now() WHERE id=$1`,
      [id, passwordHash, mustChange],
    );
  }

  async unlockUserAccount(id: string) {
    await this.pool.query(
      `UPDATE users SET status='active',active=true,locked_until=NULL,
              login_attempts=0,updated_at=now() WHERE id=$1`,
      [id],
    );
  }

  private async assignOrganization(
    client: PoolClient,
    userId: string,
    scopeNodeId: string,
    isPrimary: boolean,
    assignedBy: string | null,
  ) {
    if (isPrimary) {
      await client.query(
        "UPDATE user_organizational_assignments SET is_primary=false WHERE user_id=$1",
        [userId],
      );
    }
    const result = await client.query(
      `INSERT INTO user_organizational_assignments (
         user_id, tenant_id, scope_node_id, is_primary, assigned_by_user_id
       )
       SELECT $1, u.tenant_id, $2, $3, $4
       FROM users u JOIN resource_nodes n ON n.id=$2
       WHERE u.id=$1 AND u.tenant_id=n.tenant_id
       ON CONFLICT (user_id,scope_node_id) DO UPDATE SET is_primary=EXCLUDED.is_primary
       RETURNING id::text, user_id::text, scope_node_id::text, is_primary`,
      [userId, scopeNodeId, isPrimary, assignedBy],
    );
    await client.query(
      `INSERT INTO access_grants (
         tenant_id,user_id,scope_node_id,action,effect,grant_source
       )
       SELECT u.tenant_id,u.id,$2,rp.action,'allow','role'
       FROM users u JOIN role_permissions rp ON rp.role=u.role
       WHERE u.id=$1
         AND NOT EXISTS (
           SELECT 1 FROM access_grants ag
           WHERE ag.user_id=u.id AND ag.scope_node_id=$2
             AND ag.action=rp.action AND ag.effect='allow'
         )`,
      [userId, scopeNodeId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async assignUserToOrganization(
    userId: string,
    scopeNodeId: string,
    isPrimary: boolean,
    assignedBy: string,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const assignment = await this.assignOrganization(
        client, userId, scopeNodeId, isPrimary, assignedBy,
      );
      await client.query("COMMIT");
      return assignment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeUserOrganizationAssignment(userId: string, nodeId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM access_grants
         WHERE user_id=$1 AND scope_node_id=$2 AND grant_source='role'`,
        [userId, nodeId],
      );
      await client.query(
        "DELETE FROM user_organizational_assignments WHERE user_id=$1 AND scope_node_id=$2",
        [userId, nodeId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserCameraAccessOverview(userId: string) {
    const result = await this.pool.query(
      "SELECT * FROM user_camera_access_overview WHERE user_id=$1",
      [userId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async getUserAuditLog(userId: string, limit: number, offset: number) {
    const result = await this.pool.query(
      `SELECT id,action,resource_node_id::text,outcome,source_ip::text,
              details,occurred_at FROM audit_events
       WHERE actor_user_id=$1 ORDER BY occurred_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return { data: camelRows(result.rows) };
  }

  async checkAccountLockout(userId: string) {
    const result = await this.pool.query(
      "SELECT check_account_lockout($1) AS locked",
      [userId],
    );
    return Boolean(result.rows[0]?.locked);
  }

  async recordFailedLogin(userId: string) {
    await this.pool.query("SELECT record_failed_login($1)", [userId]);
  }

  async recordSuccessfulLogin(userId: string, ipAddress?: string) {
    await this.pool.query("SELECT record_successful_login($1,$2)", [
      userId, ipAddress ?? null,
    ]);
  }

  async createUserSession(
    userId: string,
    tenantId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const result = await this.pool.query(
      `INSERT INTO user_sessions (
         user_id,tenant_id,access_token_hash,refresh_token_hash,ip_address,
         user_agent,access_expires_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '1 hour',now()+interval '30 days')
       RETURNING id::text,user_id::text,tenant_id::text,access_expires_at,expires_at`,
      [userId, tenantId, accessTokenHash, refreshTokenHash, ipAddress ?? null, userAgent ?? null],
    );
    return camelRow(result.rows[0]!);
  }

  async findSessionByAccessToken(tokenHash: string) {
    const result = await this.pool.query(
      `SELECT id::text,user_id::text,tenant_id::text,access_expires_at,expires_at
       FROM user_sessions
       WHERE access_token_hash=$1 AND access_expires_at>now() AND expires_at>now()`,
      [tokenHash],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async findSessionByRefreshToken(tokenHash: string) {
    const result = await this.pool.query(
      `SELECT id::text,user_id::text,tenant_id::text,access_expires_at,expires_at
       FROM user_sessions WHERE refresh_token_hash=$1 AND expires_at>now()`,
      [tokenHash],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async updateSessionAccessToken(
    sessionId: string,
    newTokenHash: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.pool.query(
      `UPDATE user_sessions SET access_token_hash=$2,
         access_expires_at=now()+interval '1 hour',last_activity_at=now(),
         ip_address=COALESCE($3,ip_address),user_agent=COALESCE($4,user_agent)
       WHERE id=$1`,
      [sessionId, newTokenHash, ipAddress ?? null, userAgent ?? null],
    );
  }

  async updateSessionActivity(sessionId: string) {
    await this.pool.query(
      "UPDATE user_sessions SET last_activity_at=now() WHERE id=$1",
      [sessionId],
    );
  }

  async getUserSession(sessionId: string) {
    const result = await this.pool.query(
      `SELECT id::text,user_id::text,tenant_id::text,ip_address::text,
              user_agent,access_expires_at,expires_at,last_activity_at,created_at
       FROM user_sessions WHERE id=$1`,
      [sessionId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async listUserSessions(userId: string) {
    const result = await this.pool.query(
      `SELECT id::text,user_id::text,ip_address::text,user_agent,
              access_expires_at,expires_at,last_activity_at,created_at
       FROM user_sessions WHERE user_id=$1 AND expires_at>now()
       ORDER BY last_activity_at DESC`,
      [userId],
    );
    return camelRows(result.rows);
  }

  async deleteUserSession(sessionId: string) {
    await this.pool.query("DELETE FROM user_sessions WHERE id=$1", [sessionId]);
  }

  async deleteAllUserSessions(userId: string) {
    await this.pool.query("DELETE FROM user_sessions WHERE user_id=$1", [userId]);
  }

  async createPasswordResetToken(userId: string, tokenHash: string) {
    const result = await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id,token_hash,expires_at)
       VALUES ($1,$2,now()+interval '1 hour')
       RETURNING id::text,user_id::text,expires_at,created_at`,
      [userId, tokenHash],
    );
    return camelRow(result.rows[0]!);
  }

  async findPasswordResetToken(tokenHash: string) {
    const result = await this.pool.query(
      `SELECT id::text,user_id::text,expires_at,used_at,created_at
       FROM password_reset_tokens WHERE token_hash=$1`,
      [tokenHash],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async markPasswordResetTokenUsed(tokenId: string) {
    await this.pool.query(
      "UPDATE password_reset_tokens SET used_at=now() WHERE id=$1",
      [tokenId],
    );
  }

  async checkCameraAccess(userId: string, cameraId: string, action: string) {
    const result = await this.pool.query(
      "SELECT allowed,reason,requires_approval FROM check_camera_access($1,$2,$3)",
      [userId, cameraId, action],
    );
    const row = result.rows[0];
    return row
      ? {
          allowed: Boolean(row.allowed),
          reason: String(row.reason),
          requiresApproval: Boolean(row.requires_approval),
        }
      : { allowed: false, reason: "No access decision", requiresApproval: false };
  }

  async listCameraSpecificGrants(userId: string) {
    const result = await this.pool.query(
      `SELECT g.id::text,g.user_id::text,g.camera_id::text,n.name AS camera_name,
              g.effect,g.reason,g.valid_from,g.valid_until,
              granter.display_name AS granted_by,g.created_at
       FROM camera_specific_grants g
       JOIN cameras c ON c.id=g.camera_id
       JOIN resource_nodes n ON n.id=c.resource_node_id
       LEFT JOIN users granter ON granter.id=g.granted_by_user_id
       WHERE g.user_id=$1 ORDER BY n.name`,
      [userId],
    );
    return camelRows(result.rows);
  }

  async listCameraGrants(cameraId: string) {
    const result = await this.pool.query(
      `SELECT g.id::text,g.user_id::text,u.display_name AS user_name,
              g.camera_id::text,g.effect,g.reason,g.valid_from,g.valid_until,
              g.created_at FROM camera_specific_grants g
       JOIN users u ON u.id=g.user_id WHERE g.camera_id=$1
       ORDER BY u.display_name`,
      [cameraId],
    );
    return camelRows(result.rows);
  }

  async createCameraSpecificGrant(tenantId: string, input: any, grantedBy: string) {
    const result = await this.pool.query(
      `INSERT INTO camera_specific_grants (
         tenant_id,user_id,camera_id,effect,reason,granted_by_user_id,
         valid_from,valid_until
       )
       SELECT $1,target_user.id,camera.id,$4::grant_effect,$5,$6,
              COALESCE($7,now()),$8
       FROM users target_user
       JOIN cameras camera ON camera.id=$3
       JOIN resource_nodes camera_node ON camera_node.id=camera.resource_node_id
       WHERE target_user.id=$2
         AND target_user.tenant_id=$1
         AND camera_node.tenant_id=$1
       ON CONFLICT (user_id,camera_id) DO UPDATE SET
         effect=EXCLUDED.effect,reason=EXCLUDED.reason,
         granted_by_user_id=EXCLUDED.granted_by_user_id,
         valid_from=EXCLUDED.valid_from,valid_until=EXCLUDED.valid_until
       RETURNING id::text,user_id::text,camera_id::text,effect,reason,
                 valid_from,valid_until,created_at`,
      [
        tenantId, input.userId, input.cameraId, input.effect,
        input.reason ?? null, grantedBy, input.validFrom ?? null,
        input.validUntil ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("invalid_camera_grant_target");
    return camelRow(result.rows[0]!);
  }

  async deleteCameraSpecificGrant(id: string) {
    await this.pool.query("DELETE FROM camera_specific_grants WHERE id=$1", [id]);
  }

  async listCameraAccessRequests(tenantId: string, filters: any) {
    const values: unknown[] = [tenantId];
    const clauses = ["r.tenant_id=$1"];
    for (const [column, value, cast] of [
      ["status", filters.status, "access_request_status"],
      ["user_id", filters.userId, "uuid"],
      ["camera_id", filters.cameraId, "uuid"],
    ] as const) {
      if (value) {
        values.push(value);
        clauses.push(`r.${column}=$${values.length}::${cast}`);
      }
    }
    const result = await this.pool.query(
      `SELECT r.id::text,r.user_id::text,u.display_name AS user_name,
              r.camera_id::text,n.name AS camera_name,r.justification,
              r.requested_from,r.requested_until,r.status,
              reviewer.display_name AS reviewed_by,r.reviewed_at,r.review_notes,
              r.created_at
       FROM camera_access_requests r JOIN users u ON u.id=r.user_id
       JOIN cameras c ON c.id=r.camera_id
       JOIN resource_nodes n ON n.id=c.resource_node_id
       LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by_user_id
       WHERE ${clauses.join(" AND ")} ORDER BY r.created_at DESC`,
      values,
    );
    return camelRows(result.rows);
  }

  async getCameraAccessRequest(id: string) {
    const result = await this.pool.query(
      `SELECT id::text,tenant_id::text,user_id::text,camera_id::text,
              justification,requested_from,requested_until,status,
              reviewed_by_user_id::text,reviewed_at,review_notes,created_at
       FROM camera_access_requests WHERE id=$1`,
      [id],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async createCameraAccessRequest(tenantId: string, userId: string, input: any) {
    const result = await this.pool.query(
      `INSERT INTO camera_access_requests (
         tenant_id,user_id,camera_id,justification,requested_from,requested_until
       )
       SELECT $1,app_user.id,camera.id,$4,$5,$6
       FROM users app_user
       JOIN cameras camera ON camera.id=$3
       JOIN resource_nodes camera_node ON camera_node.id=camera.resource_node_id
       WHERE app_user.id=$2
         AND app_user.tenant_id=$1
         AND camera_node.tenant_id=$1
       RETURNING id::text,user_id::text,camera_id::text,justification,
                 requested_from,requested_until,status,created_at`,
      [tenantId, userId, input.cameraId, input.justification, input.requestedFrom, input.requestedUntil],
    );
    if (!result.rows[0]) throw new Error("invalid_camera_access_target");
    return camelRow(result.rows[0]!);
  }

  async reviewCameraAccessRequest(
    id: string,
    reviewerId: string,
    status: string,
    notes?: string,
  ) {
    const result = await this.pool.query(
      `UPDATE camera_access_requests SET status=$3::access_request_status,
              reviewed_by_user_id=$2,reviewed_at=now(),review_notes=$4
       WHERE id=$1 AND status='pending'
       RETURNING id::text,user_id::text,camera_id::text,justification,
                 requested_from,requested_until,status,reviewed_at,review_notes`,
      [id, reviewerId, status, notes ?? null],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async revokeCameraAccessRequest(id: string) {
    await this.pool.query(
      "UPDATE camera_access_requests SET status='revoked' WHERE id=$1",
      [id],
    );
  }

  async listTimeBasedRestrictions(tenantId: string, filters: any) {
    const result = await this.pool.query(
      `SELECT id::text,tenant_id::text,camera_id::text,scope_node_id::text,
              day_of_week,time_from::text,time_until::text,effect,description,
              is_active,created_at FROM time_based_access_restrictions
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR camera_id=$2)
         AND ($3::uuid IS NULL OR scope_node_id=$3)
       ORDER BY created_at DESC`,
      [tenantId, filters.cameraId ?? null, filters.scopeNodeId ?? null],
    );
    return camelRows(result.rows);
  }

  async createTimeBasedRestriction(tenantId: string, input: any) {
    const result = await this.pool.query(
      `INSERT INTO time_based_access_restrictions (
         tenant_id,camera_id,scope_node_id,day_of_week,time_from,time_until,
         effect,description
       )
       SELECT $1,camera.id,scope.id,$4,$5,$6,$7::grant_effect,$8
       FROM (SELECT $2::uuid AS requested_camera_id,
                    $3::uuid AS requested_scope_id) requested
       LEFT JOIN cameras camera ON camera.id=requested.requested_camera_id
       LEFT JOIN resource_nodes camera_node ON camera_node.id=camera.resource_node_id
       LEFT JOIN resource_nodes scope ON scope.id=requested.requested_scope_id
       WHERE (
           requested.requested_camera_id IS NOT NULL
           AND camera_node.tenant_id=$1
           AND requested.requested_scope_id IS NULL
         ) OR (
           requested.requested_scope_id IS NOT NULL
           AND scope.tenant_id=$1
           AND requested.requested_camera_id IS NULL
         )
       RETURNING id::text,tenant_id::text,camera_id::text,scope_node_id::text,
                 day_of_week,time_from::text,time_until::text,effect,description,
                 is_active,created_at`,
      [
        tenantId, input.cameraId ?? null, input.scopeNodeId ?? null,
        input.dayOfWeek ?? null, input.timeFrom, input.timeUntil,
        input.effect, input.description ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("invalid_time_restriction_target");
    return camelRow(result.rows[0]!);
  }

  async deleteTimeBasedRestriction(id: string) {
    await this.pool.query("DELETE FROM time_based_access_restrictions WHERE id=$1", [id]);
  }

  async listCameraAccessGroups(tenantId: string, scopeNodeId?: string) {
    const result = await this.pool.query(
      `SELECT id::text,tenant_id::text,name,description,scope_node_id::text,
              is_active,created_at,updated_at FROM camera_access_groups
       WHERE tenant_id=$1 AND ($2::uuid IS NULL OR scope_node_id=$2)
       ORDER BY name`,
      [tenantId, scopeNodeId ?? null],
    );
    return camelRows(result.rows);
  }

  async getCameraAccessGroupDetails(id: string) {
    const group = await this.pool.query(
      `SELECT id::text,tenant_id::text,name,description,scope_node_id::text,
              is_active,created_at,updated_at FROM camera_access_groups WHERE id=$1`,
      [id],
    );
    if (!group.rows[0]) return undefined;
    const cameras = await this.pool.query(
      `SELECT c.id::text,n.name FROM camera_access_group_members m
       JOIN cameras c ON c.id=m.camera_id
       JOIN resource_nodes n ON n.id=c.resource_node_id
       WHERE m.access_group_id=$1 ORDER BY n.name`,
      [id],
    );
    const users = await this.pool.query(
      `SELECT u.id::text,u.display_name,a.effect
       FROM user_access_group_assignments a JOIN users u ON u.id=a.user_id
       WHERE a.access_group_id=$1 ORDER BY u.display_name`,
      [id],
    );
    return {
      ...camelRow(group.rows[0]),
      cameras: camelRows(cameras.rows),
      users: camelRows(users.rows),
    };
  }

  async createCameraAccessGroup(tenantId: string, input: any) {
    const result = await this.pool.query(
      `INSERT INTO camera_access_groups (tenant_id,name,description,scope_node_id)
       VALUES ($1,$2,$3,$4)
       RETURNING id::text,tenant_id::text,name,description,scope_node_id::text,
                 is_active,created_at,updated_at`,
      [tenantId, input.name, input.description ?? null, input.scopeNodeId ?? null],
    );
    return camelRow(result.rows[0]!);
  }

  async addCameraToAccessGroup(groupId: string, cameraId: string, addedBy: string) {
    await this.pool.query(
      `INSERT INTO camera_access_group_members (
         access_group_id,camera_id,added_by_user_id
       )
       SELECT access_group.id,camera.id,$3
       FROM camera_access_groups access_group
       JOIN cameras camera ON camera.id=$2
       JOIN resource_nodes camera_node ON camera_node.id=camera.resource_node_id
       WHERE access_group.id=$1
         AND access_group.tenant_id=camera_node.tenant_id
       ON CONFLICT DO NOTHING`,
      [groupId, cameraId, addedBy],
    );
  }

  async removeCameraFromAccessGroup(groupId: string, cameraId: string) {
    await this.pool.query(
      "DELETE FROM camera_access_group_members WHERE access_group_id=$1 AND camera_id=$2",
      [groupId, cameraId],
    );
  }

  async assignUserToAccessGroup(
    groupId: string,
    userId: string,
    effect: string,
    assignedBy: string,
  ) {
    await this.pool.query(
      `INSERT INTO user_access_group_assignments (
         access_group_id,user_id,effect,assigned_by_user_id
       )
       SELECT access_group.id,app_user.id,$3::grant_effect,$4
       FROM camera_access_groups access_group
       JOIN users app_user ON app_user.id=$2
       WHERE access_group.id=$1
         AND access_group.tenant_id=app_user.tenant_id
       ON CONFLICT (access_group_id,user_id) DO UPDATE SET effect=EXCLUDED.effect`,
      [groupId, userId, effect, assignedBy],
    );
  }

  async removeUserFromAccessGroup(groupId: string, userId: string) {
    await this.pool.query(
      "DELETE FROM user_access_group_assignments WHERE access_group_id=$1 AND user_id=$2",
      [groupId, userId],
    );
  }

  async updateCameraSensitivity(cameraId: string, input: any) {
    const result = await this.pool.query(
      `UPDATE cameras SET sensitivity_level=$2::camera_sensitivity_level,
              requires_approval=COALESCE($3,requires_approval),
              access_justification_required=COALESCE($4,access_justification_required),
              auto_deny_roles=COALESCE($5::jsonb,auto_deny_roles),
              allowed_roles=COALESCE($6::jsonb,allowed_roles)
       WHERE id=$1
       RETURNING id::text,sensitivity_level,requires_approval,
                 access_justification_required,auto_deny_roles,allowed_roles`,
      [
        cameraId, input.sensitivityLevel, input.requiresApproval ?? null,
        input.accessJustificationRequired ?? null,
        input.autoDenyRoles ? JSON.stringify(input.autoDenyRoles) : null,
        input.allowedRoles ? JSON.stringify(input.allowedRoles) : null,
      ],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async getCameraAccessSummary(cameraId: string) {
    const result = await this.pool.query(
      "SELECT * FROM camera_access_summary WHERE camera_id=$1",
      [cameraId],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }
}
