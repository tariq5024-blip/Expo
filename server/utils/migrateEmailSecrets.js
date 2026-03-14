const Store = require('../models/Store');
const {
  isEncryptedSecret,
  encryptEmailSecret,
  decryptEmailSecret,
  isEmailSecretEncryptionEnabled
} = require('./emailSecretCrypto');

const migrateStoreEmailPasswords = async () => {
  if (!isEmailSecretEncryptionEnabled()) {
    return { migrated: 0, skipped: true, reason: 'EMAIL_CONFIG_ENCRYPTION_KEY not configured' };
  }

  const stores = await Store.find({
    'emailConfig.password': { $exists: true, $ne: '' }
  }).select('_id emailConfig.password').lean();

  let migrated = 0;
  for (const store of stores) {
    const current = String(store?.emailConfig?.password || '');
    if (!current || isEncryptedSecret(current)) continue;
    const encrypted = encryptEmailSecret(current);
    if (!encrypted || encrypted === current) continue;

    await Store.updateOne(
      { _id: store._id },
      {
        $set: {
          'emailConfig.password': encrypted,
          'emailConfig.updatedAt': new Date()
        }
      }
    );
    migrated += 1;
  }

  // Detect unreadable encrypted values early.
  const encryptedStores = await Store.find({
    'emailConfig.password': { $regex: '^enc:v1:' }
  }).select('_id emailConfig.password').lean();
  const unreadable = encryptedStores.filter((s) => !decryptEmailSecret(s.emailConfig?.password)).length;

  return { migrated, skipped: false, unreadable };
};

module.exports = {
  migrateStoreEmailPasswords
};
