const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

const BackupArtifact = require('../models/BackupArtifact');
const BackupLog = require('../models/BackupLog');
const Setting = require('../models/Setting');
const appPackage = require('../package.json');

const BACKUP_ROOT = path.join(__dirname, '../storage/backups');
const CURRENT_BACKUP_FORMAT_VERSION = 3;
const CURRENT_MANIFEST_VERSION = 3;
const MAINTENANCE_LOCK_KEY = 'systemMaintenanceLock';
const getResilienceHelpers = () => require(path.join(__dirname, 'resilienceManager'));

const ensureDir = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
  });
  return hash.digest('hex');
};

const execFileAsync = (command, args = []) => new Promise((resolve, reject) => {
  execFile(command, args, { env: process.env }, (error, stdout, stderr) => {
    if (error) {
      const detail = String(stderr || stdout || error.message || '').trim();
      reject(new Error(detail || `${command} failed`));
      return;
    }
    resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
  });
});

const resolveMongoUri = () => String(
  process.env.MONGO_URI || process.env.LOCAL_FALLBACK_MONGO_URI || 'mongodb://127.0.0.1:27017/expo'
).trim();

const parseDatabaseNameFromUri = (mongoUri = '') => {
  try {
    const normalized = mongoUri.startsWith('mongodb://') || mongoUri.startsWith('mongodb+srv://')
      ? mongoUri
      : `mongodb://${mongoUri}`;
    const u = new URL(normalized);
    return String((u.pathname || '').replace(/^\//, '').split('/')[0] || '').trim();
  } catch {
    return '';
  }
};

const isMongodumpArchivePath = (filePath = '') => {
  const lower = String(filePath || '').toLowerCase();
  return lower.endsWith('.archive') || lower.endsWith('.archive.gz') || lower.endsWith('.gz');
};

const buildBackupFileName = (appVersion = 'unknown') => {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}_${p(d.getUTCMonth() + 1)}_${p(d.getUTCDate())}_${p(d.getUTCHours())}_${p(d.getUTCMinutes())}`;
  const safeVersion = String(appVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `backup_${ts}_${safeVersion}.archive.gz`;
};

const createMongoDumpArchive = async ({ outputArchivePath }) => {
  const mongoUri = resolveMongoUri();
  await ensureDir(path.dirname(outputArchivePath));
  await execFileAsync('mongodump', ['--uri', mongoUri, `--archive=${outputArchivePath}`, '--gzip']);
  return outputArchivePath;
};

const restoreMongoDumpArchive = async ({ archivePath, drop = true }) => {
  const mongoUri = resolveMongoUri();
  const dbName = parseDatabaseNameFromUri(mongoUri);
  if (!dbName) throw new Error('Could not determine database name from MONGO_URI');
  const args = ['--uri', mongoUri, `--archive=${archivePath}`, '--gzip'];
  if (drop) args.push('--drop');
  await execFileAsync('mongorestore', args);
};

const readCloudConfig = async () => {
  const doc = await Setting.findOne({ key: 'backupCloudConfig' }).lean();
  return doc?.value || {};
};

const createBackupLog = async ({ action, backupId, backupName, user, details }) => {
  await BackupLog.create({
    action,
    backupId: backupId || null,
    backupName: backupName || '',
    performedBy: user?._id || null,
    performedByEmail: user?.email || '',
    details: details || ''
  });
};

const syncToCloud = async ({ filePath, backupFileName, backupId }) => {
  const cfg = await readCloudConfig();
  if (!cfg || cfg.enabled !== true) {
    return { synced: false, provider: '', objectKey: '', error: '' };
  }

  const provider = String(cfg.provider || '').toLowerCase();
  const objectKey = `backups/${backupFileName}`;

  if (provider === 's3' || provider === 'r2') {
    const endpoint = cfg.endpoint ? String(cfg.endpoint) : undefined;
    const s3Client = new S3Client({
      region: cfg.region || 'auto',
      endpoint,
      forcePathStyle: Boolean(cfg.forcePathStyle),
      credentials: cfg.accessKeyId && cfg.secretAccessKey ? {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      } : undefined
    });
    const stat = await fsp.stat(filePath);
    const body = fs.createReadStream(filePath);
    if (stat.size > 50 * 1024 * 1024) {
      const uploader = new Upload({
        client: s3Client,
        params: { Bucket: cfg.bucket, Key: objectKey, Body: body, ContentType: 'application/gzip' }
      });
      await uploader.done();
    } else {
      await s3Client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
        Body: body,
        ContentType: 'application/gzip'
      }));
    }
    await BackupArtifact.updateOne({ _id: backupId }, {
      $set: {
        'cloud.synced': true,
        'cloud.provider': provider,
        'cloud.objectKey': objectKey,
        'cloud.syncedAt': new Date(),
        'cloud.error': ''
      }
    });
    return { synced: true, provider, objectKey, error: '' };
  }

  if (provider === 'supabase') {
    const supabase = createSupabaseClient(cfg.url, cfg.serviceRoleKey);
    const bucket = cfg.bucket || 'backups';
    const fileBuffer = await fsp.readFile(filePath);
    const { error } = await supabase.storage.from(bucket).upload(objectKey, fileBuffer, {
      contentType: 'application/gzip',
      upsert: true
    });
    if (error) throw error;
    await BackupArtifact.updateOne({ _id: backupId }, {
      $set: {
        'cloud.synced': true,
        'cloud.provider': provider,
        'cloud.objectKey': objectKey,
        'cloud.syncedAt': new Date(),
        'cloud.error': ''
      }
    });
    return { synced: true, provider, objectKey, error: '' };
  }

  return { synced: false, provider: '', objectKey: '', error: 'Unsupported provider' };
};

const acquireMaintenanceLock = async ({ reason = 'restore', actor = null } = {}) => {
  const existing = await Setting.findOne({ key: MAINTENANCE_LOCK_KEY }).lean();
  if (existing?.value?.active) {
    throw new Error(`Maintenance lock is already active (${existing.value.reason || 'unknown reason'}).`);
  }
  const value = {
    active: true,
    reason,
    actorEmail: String(actor?.email || ''),
    actorId: String(actor?._id || ''),
    startedAt: new Date().toISOString()
  };
  await Setting.updateOne(
    { key: MAINTENANCE_LOCK_KEY },
    { $set: { value, updatedAt: new Date() } },
    { upsert: true }
  );
};

const releaseMaintenanceLock = async ({ note = '' } = {}) => {
  await Setting.updateOne(
    { key: MAINTENANCE_LOCK_KEY },
    {
      $set: {
        value: {
          active: false,
          reason: '',
          note: String(note || ''),
          releasedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
};

const validateBackupZipForRestore = async (archivePath, expectedChecksum = '') => {
  if (!isMongodumpArchivePath(archivePath)) {
    throw new Error('Only mongodump archive files are supported.');
  }
  if (!fs.existsSync(archivePath)) {
    throw new Error('Backup archive file does not exist.');
  }
  if (expectedChecksum) {
    const actual = await sha256File(archivePath);
    if (String(actual).toLowerCase() !== String(expectedChecksum).toLowerCase()) {
      throw new Error('Backup checksum validation failed. Artifact may be corrupted or tampered.');
    }
  }
  return {
    ok: true,
    status: 'safe',
    format: 'mongodump-archive'
  };
};

const createBackupArtifact = async ({
  backupType = 'Full',
  trigger = 'manual',
  user = null,
  sourceBackupId = null
}) => {
  await ensureDir(BACKUP_ROOT);
  const appVersion = appPackage.version || 'unknown';
  const fileName = buildBackupFileName(appVersion);
  const filePath = path.join(BACKUP_ROOT, fileName);
  let artifact = null;
  try {
    const previousReadyArtifact = await BackupArtifact.findOne({ status: 'ready' }).sort({ createdAt: -1 }).lean();
    await createMongoDumpArchive({ outputArchivePath: filePath });
    const stat = await fsp.stat(filePath);
    const checksumSha256 = await sha256File(filePath);
    const previousChecksumSha256 = String(previousReadyArtifact?.metadata?.checksumSha256 || '');

    artifact = await BackupArtifact.create({
      name: path.basename(fileName, '.archive.gz'),
      fileName,
      filePath,
      sizeBytes: stat.size,
      backupType,
      appVersion,
      databaseVersion: 'mongodb',
      status: 'ready',
      trigger,
      metadata: {
        backupTool: 'mongodump',
        includesFiles: false,
        fromBackupId: sourceBackupId || null,
        manifestVersion: CURRENT_MANIFEST_VERSION,
        checksumSha256,
        chain: {
          previousBackupId: previousReadyArtifact?._id || null,
          previousChecksumSha256,
          chainValid: previousReadyArtifact ? Boolean(previousChecksumSha256) : true
        }
      },
      createdBy: user?._id || null
    });

    await createBackupLog({
      action: 'backup_created',
      backupId: artifact._id,
      backupName: artifact.name,
      user,
      details: `mongodump ${backupType} backup created (${Math.round(stat.size / 1024)} KB)`
    });

    const { createImmutableManifestForArtifact } = getResilienceHelpers();
    await createImmutableManifestForArtifact(artifact).catch(() => {});

    try {
      await syncToCloud({ filePath, backupFileName: fileName, backupId: artifact._id });
    } catch (cloudError) {
      await BackupArtifact.updateOne({ _id: artifact._id }, {
        $set: { 'cloud.error': cloudError.message || String(cloudError) }
      });
    }

    return artifact;
  } catch (error) {
    if (artifact?._id) {
      await BackupArtifact.updateOne({ _id: artifact._id }, { $set: { status: 'failed' } });
    }
    await createBackupLog({
      action: 'backup_failed',
      backupId: artifact?._id || null,
      backupName: artifact?.name || '',
      user,
      details: error.message || String(error)
    });
    throw error;
  }
};

const restoreBackupArtifact = async ({
  backupArtifact,
  user,
  createSafetyBackup = true,
  useMaintenanceLock = true
}) => {
  let safetyBackup = null;
  let lockAcquired = false;
  try {
    if (useMaintenanceLock) {
      await acquireMaintenanceLock({ reason: 'restore', actor: user });
      lockAcquired = true;
    }
    const expectedChecksum = String(backupArtifact?.metadata?.checksumSha256 || '');
    await validateBackupZipForRestore(backupArtifact.filePath, expectedChecksum);

    if (createSafetyBackup) {
      safetyBackup = await createBackupArtifact({
        backupType: 'Full',
        trigger: 'rollback',
        user,
        sourceBackupId: backupArtifact?._id || null
      });
    }

    const { withJournalCaptureSuspended, appendJournalEntry } = getResilienceHelpers();
    await withJournalCaptureSuspended(async () => {
      await restoreMongoDumpArchive({ archivePath: backupArtifact.filePath, drop: true });
    });
    await appendJournalEntry({
      opType: 'restore',
      collectionName: 'system',
      actor: user,
      metadata: {
        mode: 'artifact-restore',
        backupId: String(backupArtifact?._id || ''),
        backupName: backupArtifact?.fileName || backupArtifact?.name || ''
      }
    }).catch(() => {});

    await createBackupLog({
      action: 'backup_restored',
      backupId: backupArtifact._id,
      backupName: backupArtifact.name,
      user,
      details: `mongorestore completed${safetyBackup ? ` with safety backup ${safetyBackup.fileName}` : ''}`
    });
    return {
      ok: true,
      safetyBackupId: safetyBackup?._id || null,
      restoreReport: {
        restoredWith: 'mongorestore',
        archive: backupArtifact.fileName || path.basename(backupArtifact.filePath)
      }
    };
  } catch (error) {
    await createBackupLog({
      action: 'restore_failed',
      backupId: backupArtifact?._id || null,
      backupName: backupArtifact?.name || '',
      user,
      details: error.message || String(error)
    });
    if (safetyBackup) {
      try {
        await restoreBackupArtifact({
          backupArtifact: safetyBackup,
          user,
          createSafetyBackup: false,
          useMaintenanceLock: false
        });
      } catch {
        // Preserve original error from initial restore attempt.
      }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      await releaseMaintenanceLock({ note: 'restore_completed' }).catch(() => {});
    }
  }
};

const restoreFromUploadedZip = async ({ zipPath, user }) => {
  const pseudoArtifact = {
    _id: null,
    name: path.basename(zipPath),
    fileName: path.basename(zipPath),
    filePath: zipPath,
    metadata: {}
  };
  return restoreBackupArtifact({ backupArtifact: pseudoArtifact, user, createSafetyBackup: true });
};

const restoreFromJsonPayload = async () => {
  throw new Error('Legacy JSON restore is removed. Use mongodump archive restore instead.');
};

module.exports = {
  BACKUP_ROOT,
  CURRENT_BACKUP_FORMAT_VERSION,
  CURRENT_MANIFEST_VERSION,
  createBackupArtifact,
  restoreBackupArtifact,
  restoreFromUploadedZip,
  restoreFromJsonPayload,
  createBackupLog,
  validateBackupZipForRestore,
  acquireMaintenanceLock,
  releaseMaintenanceLock
};
