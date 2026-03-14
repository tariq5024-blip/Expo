const crypto = require('crypto');

const SECRET_PREFIX = 'enc:v1:';

const decodeKey = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  // Prefer explicit 64-char hex key.
  if (/^[a-fA-F0-9]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  // Fallback to base64-encoded 32-byte key.
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // ignore decode errors
  }
  return null;
};

const getEncryptionKey = () => {
  const key = decodeKey(process.env.EMAIL_CONFIG_ENCRYPTION_KEY);
  return key;
};

const isEncryptedSecret = (value) => String(value || '').startsWith(SECRET_PREFIX);

const encryptEmailSecret = (plainText) => {
  const text = String(plainText || '');
  if (!text) return '';
  const key = getEncryptionKey();
  if (!key) return text;
  if (isEncryptedSecret(text)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const cipherText = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${cipherText.toString('base64')}`;
};

const decryptEmailSecret = (storedValue) => {
  const raw = String(storedValue || '');
  if (!raw) return '';
  if (!isEncryptedSecret(raw)) return raw;

  const key = getEncryptionKey();
  if (!key) return '';

  const encoded = raw.slice(SECRET_PREFIX.length);
  const parts = encoded.split(':');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const cipherText = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
};

const isEmailSecretEncryptionEnabled = () => Boolean(getEncryptionKey());

module.exports = {
  isEncryptedSecret,
  encryptEmailSecret,
  decryptEmailSecret,
  isEmailSecretEncryptionEnabled
};
