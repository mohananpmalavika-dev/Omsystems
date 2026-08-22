/**
 * Security Database Schemas
 * MongoDB collection schemas for all security components
 */

interface SecurityCollectionIndex {
  key: Record<string, number>;
  unique?: boolean;
  expireAfterSeconds?: number;
}

interface SecurityCollectionSchema {
  indexes?: SecurityCollectionIndex[];
  validation?: any;
}

export const securityCollections: Record<string, SecurityCollectionSchema> = {
  // Secret Vault
  secrets: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { name: 1 } },
      { key: { type: 1 } },
      { key: { tags: 1 } },
      { key: { expiresAt: 1 } },
      { key: { deleted: 1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'type', 'value', 'version', 'createdAt'],
        properties: {
          id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          type: { enum: ['password', 'api_key', 'token', 'certificate', 'private_key', 'database_credential', 'ssh_key', 'encryption_key', 'signing_key'] },
          value: { bsonType: 'string' },
          version: { bsonType: 'int' },
          deleted: { bsonType: 'bool' }
        }
      }
    }
  },

  secret_versions: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { secretId: 1, version: -1 } }
    ]
  },

  secret_access_logs: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { secretId: 1 } },
      { key: { userId: 1 } },
      { key: { timestamp: -1 } },
      { key: { action: 1 } }
    ]
  },

  // Certificate Management
  certificates: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { fingerprint: 1 }, unique: true },
      { key: { commonName: 1 } },
      { key: { type: 1 } },
      { key: { status: 1 } },
      { key: { notAfter: 1 } },
      { key: { tags: 1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'type', 'commonName', 'notBefore', 'notAfter', 'status'],
        properties: {
          id: { bsonType: 'string' },
          type: { enum: ['ssl_tls', 'client', 'code_signing', 'email', 'root_ca', 'intermediate_ca'] },
          status: { enum: ['valid', 'expiring_soon', 'expired', 'revoked', 'invalid'] }
        }
      }
    }
  },

  certificate_checks: {
    indexes: [
      { key: { certificateId: 1 } },
      { key: { timestamp: -1 } }
    ]
  },

  // Password Rotation
  password_rotation_targets: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { type: 1 } },
      { key: { enabled: 1 } },
      { key: { nextRotation: 1 } },
      { key: { host: 1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'type', 'name', 'host', 'protocol', 'username', 'secretId', 'enabled'],
        properties: {
          type: { enum: ['camera', 'recorder', 'switch', 'server', 'service_account'] },
          protocol: { enum: ['onvif', 'ssh', 'http', 'snmp', 'custom'] }
        }
      }
    }
  },

  password_rotation_jobs: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { targetId: 1 } },
      { key: { status: 1 } },
      { key: { scheduledAt: -1 } },
      { key: { completedAt: -1 } }
    ]
  },

  // HSM
  hsm_keys: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { label: 1 } },
      { key: { algorithm: 1 } },
      { key: { createdAt: -1 } }
    ]
  },

  hsm_operations: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { keyId: 1 } },
      { key: { type: 1 } },
      { key: { timestamp: -1 } },
      { key: { userId: 1 } }
    ]
  },

  // Zero Trust
  zero_trust_policies: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { enabled: 1 } },
      { key: { priority: 1 } },
      { key: { name: 1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'enabled', 'priority', 'conditions', 'action'],
        properties: {
          action: { enum: ['allow', 'deny', 'challenge', 'step_up'] }
        }
      }
    }
  },

  trusted_devices: {
    indexes: [
      { key: { deviceId: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { trusted: 1 } },
      { key: { registeredAt: -1 } }
    ]
  },

  active_sessions: {
    indexes: [
      { key: { sessionId: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { deviceId: 1 } },
      { key: { lastVerified: -1 } },
      { key: { startedAt: -1 }, expireAfterSeconds: 86400 } // 24 hours TTL
    ]
  },

  access_logs: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { deviceId: 1 } },
      { key: { resource: 1 } },
      { key: { decision: 1 } },
      { key: { timestamp: -1 } }
    ]
  },

  // Tamper Detection
  tamper_events: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { deviceId: 1 } },
      { key: { deviceType: 1 } },
      { key: { type: 1 } },
      { key: { severity: 1 } },
      { key: { acknowledged: 1 } },
      { key: { timestamp: -1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'type', 'severity', 'deviceType', 'deviceId', 'timestamp'],
        properties: {
          severity: { enum: ['low', 'medium', 'high', 'critical'] }
        }
      }
    }
  },

  tamper_sensors: {
    indexes: [
      { key: { deviceId: 1 } },
      { key: { sensorType: 1 } },
      { key: { enabled: 1 } }
    ]
  },

  // Video Encryption
  encrypted_videos: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { originalVideoId: 1 } },
      { key: { keyId: 1 } },
      { key: { encryptedAt: -1 } }
    ]
  },

  encryption_keys: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { algorithm: 1 } },
      { key: { createdAt: -1 } },
      { key: { expiresAt: 1 } }
    ]
  },

  // Immutable Storage
  immutable_objects: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { objectKey: 1 } },
      { key: { objectType: 1 } },
      { key: { retentionStatus: 1 } },
      { key: { retentionExpiresAt: 1 } },
      { key: { locked: 1 } },
      { key: { createdAt: -1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'objectKey', 'objectType', 'checksum', 'retentionStatus', 'locked'],
        properties: {
          retentionStatus: { enum: ['active', 'locked', 'expired', 'legal_hold'] }
        }
      }
    }
  },

  immutable_object_data: {
    indexes: [
      { key: { objectId: 1 }, unique: true }
    ]
  },

  retention_policies: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { enabled: 1 } },
      { key: { priority: 1 } },
      { key: { objectTypes: 1 } }
    ]
  },

  // Ransomware Detection
  ransomware_threats: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { deviceId: 1 } },
      { key: { type: 1 } },
      { key: { level: 1 } },
      { key: { resolved: 1 } },
      { key: { detectedAt: -1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'type', 'level', 'deviceId', 'detectedAt', 'resolved'],
        properties: {
          level: { enum: ['info', 'low', 'medium', 'high', 'critical'] }
        }
      }
    }
  },

  ransomware_patterns: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { enabled: 1 } },
      { key: { severity: 1 } }
    ]
  },

  behavior_baselines: {
    indexes: [
      { key: { deviceId: 1, metric: 1 }, unique: true },
      { key: { lastUpdated: -1 } }
    ]
  },

  device_isolation_events: {
    indexes: [
      { key: { deviceId: 1 } },
      { key: { isolatedAt: -1 } },
      { key: { restoredAt: 1 } }
    ]
  },

  // Supply Chain Verification
  software_packages: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { name: 1 } },
      { key: { type: 1 } },
      { key: { vendor: 1 } },
      { key: { verificationStatus: 1 } },
      { key: { installedAt: -1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'name', 'version', 'type', 'checksum', 'verificationStatus'],
        properties: {
          verificationStatus: { enum: ['verified', 'unverified', 'failed', 'unknown'] }
        }
      }
    }
  },

  trusted_publishers: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { name: 1 } },
      { key: { verified: 1 } }
    ]
  },

  // Secure Boot
  secure_boot_status: {
    indexes: [
      { key: { deviceId: 1 }, unique: true },
      { key: { enabled: 1 } },
      { key: { status: 1 } },
      { key: { lastVerification: -1 } }
    ]
  },

  trusted_components: {
    indexes: [
      { key: { name: 1 }, unique: true },
      { key: { checksum: 1 } }
    ]
  },

  // TPM
  tpm_status: {
    indexes: [
      { key: { deviceId: 1 }, unique: true },
      { key: { present: 1 } },
      { key: { enabled: 1 } }
    ]
  },

  tpm_attestations: {
    indexes: [
      { key: { deviceId: 1 } },
      { key: { timestamp: -1 } }
    ]
  },

  tpm_keys: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { deviceId: 1 } },
      { key: { handle: 1 } }
    ]
  },

  // Security Posture
  security_posture_history: {
    indexes: [
      { key: { timestamp: -1 } },
      { key: { overallScore: 1 } }
    ]
  },

  security_issues: {
    indexes: [
      { key: { id: 1 }, unique: true },
      { key: { category: 1 } },
      { key: { severity: 1 } },
      { key: { resolvedAt: 1 } },
      { key: { detectedAt: -1 } }
    ],
    validation: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'category', 'severity', 'title', 'detectedAt'],
        properties: {
          severity: { enum: ['low', 'medium', 'high', 'critical'] }
        }
      }
    }
  }
};

/**
 * Initialize all security collections
 */
export async function initializeSecurityCollections(db: any): Promise<void> {
  console.log('Initializing security collections...');

  const collectionEntries = Object.entries(securityCollections) as [string, SecurityCollectionSchema][];

  for (const [collectionName, schema] of collectionEntries) {
    try {
      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length === 0) {
        // Create collection
        await db.createCollection(collectionName, {
          validator: schema.validation
        });
        console.log(`Created collection: ${collectionName}`);
      }

      // Create indexes
      if (schema.indexes && schema.indexes.length > 0) {
        for (const index of schema.indexes) {
          try {
            const indexOptions: Record<string, unknown> = {};
            if (index.unique !== undefined) indexOptions.unique = index.unique;
            if (index.expireAfterSeconds !== undefined) indexOptions.expireAfterSeconds = index.expireAfterSeconds;

            await db.collection(collectionName).createIndex(index.key, indexOptions);
          } catch (error: any) {
            // Index may already exist
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('already exists')) {
              console.warn(`Warning creating index on ${collectionName}:`, errorMessage);
            }
          }
        }
        console.log(`Created indexes for: ${collectionName}`);
      }
    } catch (error) {
      console.error(`Error initializing collection ${collectionName}:`, error);
    }
  }

  console.log('Security collections initialized successfully');
}

/**
 * Migration: Add missing fields to existing collections
 */
export async function migrateSecurityCollections(db: any): Promise<void> {
  console.log('Running security collection migrations...');

  // Add any data migrations here as needed
  
  console.log('Security collection migrations completed');
}
