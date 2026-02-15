const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

async function backupDatabase() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }

  const shouldConnect = mongoose.connection.readyState !== 1;

  if (shouldConnect) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const baseDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(baseDir, `backup-${timestamp}`);
    fs.mkdirSync(backupDir);

    for (const coll of collections) {
      const name = coll.name;
      const docs = await db.collection(name).find({}).toArray();
      const filePath = path.join(backupDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
    }

    return backupDir;
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
