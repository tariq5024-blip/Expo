const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

dotenv.config({ path: path.join(__dirname, '.env') });

async function backupDatabase() {
  const mongoUri = String(process.env.MONGO_URI || process.env.LOCAL_FALLBACK_MONGO_URI || 'mongodb://127.0.0.1:27017/expo').trim();

  const shouldConnect = mongoose.connection.readyState !== 1;
  const execFileAsync = (command, args = []) => new Promise((resolve, reject) => {
    execFile(command, args, { env: process.env }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || '').trim();
        reject(new Error(detail || `${command} failed`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

  if (shouldConnect) await mongoose.connect(mongoUri);
  try {
    const baseDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(baseDir, `backup-${timestamp}.archive.gz`);
    await execFileAsync('mongodump', ['--uri', mongoUri, `--archive=${archivePath}`, '--gzip']);
    return archivePath;
  } finally {
    if (shouldConnect) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  backupDatabase()
    .then((dir) => {
      console.log(`Backup completed at: ${dir}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Backup failed:', error);
      process.exit(1);
    });
}

module.exports = { backupDatabase };
