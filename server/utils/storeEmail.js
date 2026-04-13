const nodemailer = require('nodemailer');
const Store = require('../models/Store');
const EmailLog = require('../models/EmailLog');
const User = require('../models/User');
const { decryptEmailSecret } = require('./emailSecretCrypto');

const resolveStoreId = (storeRef) => {
  if (!storeRef) return null;
  if (typeof storeRef === 'string') return storeRef;
  if (storeRef._id) return String(storeRef._id);
  return String(storeRef);
};

const getStoreEmailConfig = async (storeId) => {
  const id = resolveStoreId(storeId);
  if (!id) return null;
  const store = await Store.findById(id).lean();
  if (!store?.emailConfig?.enabled) return null;
  const cfg = store.emailConfig;
  const decodedPassword = decryptEmailSecret(cfg.password);
  if (!cfg.smtpHost || !cfg.smtpPort || !cfg.username || !decodedPassword) return null;
  return {
    smtpHost: cfg.smtpHost,
    smtpPort: Number(cfg.smtpPort),
    username: cfg.username,
    password: decodedPassword,
    encryption: cfg.encryption || 'TLS',
    fromEmail: cfg.fromEmail || cfg.username,
    fromName: cfg.fromName || store.name || 'Expo Asset',
    storeName: store.name || 'Store'
  };
};

const normalizeLowerEmailList = (arr) =>
  Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

/**
 * Portal comma-lists + platform Admin/Super Admin accounts for this store (for Assign UI preview).
 */
const getStoreAssignCcLists = async (storeId) => {
  const id = resolveStoreId(storeId);
  if (!id) {
    return {
      portalAdmin: [],
      portalManager: [],
      portalViewer: [],
      platformAdminAccounts: []
    };
  }
  const store = await Store.findById(id)
    .select('emailConfig.adminRecipients emailConfig.managerRecipients emailConfig.viewerRecipients')
    .lean();
  const cfg = store?.emailConfig || {};
  const portalAdmin = normalizeLowerEmailList(cfg.adminRecipients);
  const portalManager = normalizeLowerEmailList(cfg.managerRecipients);
  const portalViewer = normalizeLowerEmailList(cfg.viewerRecipients);
  const adminUsers = await User.find({
    role: { $in: ['Admin', 'Super Admin'] },
    $or: [{ role: 'Super Admin' }, { assignedStore: id }]
  })
    .select('email')
    .lean();
  const platformAdminAccounts = normalizeLowerEmailList(adminUsers.map((u) => u.email));
  return { portalAdmin, portalManager, portalViewer, platformAdminAccounts };
};

/**
 * @param {string|null|undefined} storeId
 * @param {{
 *   assignStrictLists?: boolean,
 *   includeManagers?: boolean,
 *   includeViewers?: boolean,
 *   includeAdmins?: boolean
 * }|undefined} options
 *        When omitted, all configured role lists are included (backward compatible).
 *        When assignStrictLists is true, only manager/viewer/admin portal lists included per flags
 *        (used by asset assign — no other store lists).
 */
const getStoreNotificationRecipients = async (storeId, options) => {
  const id = resolveStoreId(storeId);
  if (!id) return [];
  const store = await Store.findById(id).select(
    'emailConfig.notificationRecipients emailConfig.technicianRecipients emailConfig.adminRecipients emailConfig.viewerRecipients emailConfig.managerRecipients emailConfig.lineManagerRecipients'
  ).lean();

  const assignStrictLists = options?.assignStrictLists === true;
  if (assignStrictLists) {
    const managers = options?.includeManagers === true
      ? normalizeLowerEmailList(store?.emailConfig?.managerRecipients)
      : [];
    const viewers = options?.includeViewers === true
      ? normalizeLowerEmailList(store?.emailConfig?.viewerRecipients)
      : [];
    const admins = options?.includeAdmins === true
      ? normalizeLowerEmailList(store?.emailConfig?.adminRecipients)
      : [];
    return Array.from(new Set([...managers, ...viewers, ...admins]));
  }

  const includeManagers =
    options && Object.prototype.hasOwnProperty.call(options, 'includeManagers')
      ? Boolean(options.includeManagers)
      : true;
  const includeViewers =
    options && Object.prototype.hasOwnProperty.call(options, 'includeViewers')
      ? Boolean(options.includeViewers)
      : true;
  const recipients = Array.isArray(store?.emailConfig?.notificationRecipients)
    ? store.emailConfig.notificationRecipients
    : [];
  const technicians = Array.isArray(store?.emailConfig?.technicianRecipients)
    ? store.emailConfig.technicianRecipients
    : [];
  const admins = Array.isArray(store?.emailConfig?.adminRecipients)
    ? store.emailConfig.adminRecipients
    : [];
  const viewers = includeViewers && Array.isArray(store?.emailConfig?.viewerRecipients)
    ? store.emailConfig.viewerRecipients
    : [];
  const managers = includeManagers && Array.isArray(store?.emailConfig?.managerRecipients)
    ? store.emailConfig.managerRecipients
    : [];
  const lineManagers = Array.isArray(store?.emailConfig?.lineManagerRecipients)
    ? store.emailConfig.lineManagerRecipients
    : [];
  return Array.from(new Set([...recipients, ...technicians, ...admins, ...viewers, ...managers, ...lineManagers]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)));
};

const getStoreNotificationSubjects = async (storeId) => {
  const id = resolveStoreId(storeId);
  if (!id) {
    return {
      ppm: 'Expo City Dubai PPM Notification',
      asset: 'Expo City Dubai Asset Notification'
    };
  }
  const store = await Store.findById(id)
    .select('emailConfig.ppmNotificationSubject emailConfig.assetNotificationSubject')
    .lean();
  return {
    ppm: String(store?.emailConfig?.ppmNotificationSubject || 'Expo City Dubai PPM Notification').trim() || 'Expo City Dubai PPM Notification',
    asset: String(store?.emailConfig?.assetNotificationSubject || 'Expo City Dubai Asset Notification').trim() || 'Expo City Dubai Asset Notification'
  };
};

const getFallbackConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const username = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !username || !password) return null;
  return {
    smtpHost: host,
    smtpPort: port,
    username,
    password,
    encryption: process.env.SMTP_PORT === '465' ? 'SSL' : 'TLS',
    fromEmail: process.env.SMTP_EMAIL,
    fromName: process.env.FROM_NAME || 'Expo Stores',
    storeName: 'Global'
  };
};

const buildTransport = (cfg) => {
  const secure = String(cfg.encryption || '').toUpperCase() === 'SSL' || Number(cfg.smtpPort) === 465;
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort),
    secure,
    auth: {
      user: cfg.username,
      pass: cfg.password
    }
  });
};

const parseRecipients = (to) => Array.from(
  new Set(
    String(to || '')
      .split(',')
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)
  )
);

const filterRecipientsByNotificationPreference = async (recipients = []) => {
  if (!Array.isArray(recipients) || recipients.length === 0) return [];
  const users = await User.find({ email: { $in: recipients } })
    .select('email notificationPreferences.enabled')
    .lean();
  const byEmail = new Map(users.map((u) => [String(u.email || '').toLowerCase(), u]));
  return recipients.filter((email) => {
    const user = byEmail.get(String(email || '').toLowerCase());
    // If the recipient is not a platform account, keep existing behavior.
    if (!user) return true;
    const enabled = user.notificationPreferences?.enabled;
    return enabled !== false;
  });
};

const sendStoreEmail = async ({
  storeId,
  to,
  subject,
  text,
  html,
  attachments,
  forceConfig,
  context = '',
  bypassNotificationFilter = false
}) => {
  const cfg = forceConfig || (await getStoreEmailConfig(storeId)) || getFallbackConfig();
  if (!cfg) {
    await EmailLog.create({
      store: resolveStoreId(storeId),
      to,
      subject,
      status: 'skipped',
      reason: 'SMTP not configured for store or global fallback',
      context
    });
    return { skipped: true, reason: 'SMTP not configured for store or global fallback' };
  }
  const parsedRecipients = parseRecipients(to);
  const filteredRecipients = bypassNotificationFilter
    ? parsedRecipients
    : await filterRecipientsByNotificationPreference(parsedRecipients);
  if (filteredRecipients.length === 0) {
    await EmailLog.create({
      store: resolveStoreId(storeId),
      to,
      subject,
      status: 'skipped',
      reason: 'All recipients have disabled email notifications',
      context
    });
    return { skipped: true, reason: 'All recipients have disabled email notifications' };
  }
  try {
    const transporter = buildTransport(cfg);
    const from = `${cfg.fromName} <${cfg.fromEmail}>`;
    const mailOpts = { from, to: filteredRecipients.join(','), subject, text, html };
    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOpts.attachments = attachments;
    }
    const info = await transporter.sendMail(mailOpts);
    await EmailLog.create({
      store: resolveStoreId(storeId),
      to: filteredRecipients.join(','),
      subject,
      status: 'sent',
      providerMessageId: info.messageId || '',
      context
    });
    return { skipped: false, messageId: info.messageId, storeName: cfg.storeName };
  } catch (error) {
    await EmailLog.create({
      store: resolveStoreId(storeId),
      to,
      subject,
      status: 'failed',
      reason: error.message || 'Email send failed',
      context
    });
    throw error;
  }
};

/**
 * SMTP for password reset: env (getFallbackConfig) → user's assigned store Portal email → any store with enabled email.
 */
async function resolvePasswordResetSmtpConfig(user) {
  const fb = getFallbackConfig();
  if (fb) return fb;
  const assigned = user?.assignedStore;
  if (assigned) {
    const fromAssigned = await getStoreEmailConfig(assigned);
    if (fromAssigned) return fromAssigned;
  }
  const candidates = await Store.find({ 'emailConfig.enabled': true })
    .select('_id')
    .limit(25)
    .lean();
  for (const row of candidates || []) {
    if (!row?._id) continue;
    // eslint-disable-next-line no-await-in-loop
    const c = await getStoreEmailConfig(row._id);
    if (c) return c;
  }
  return null;
}

async function sendPasswordResetEmail({ user, to, subject, text, html }) {
  const cfg = await resolvePasswordResetSmtpConfig(user);
  if (!cfg) {
    const err = new Error('NO_SMTP');
    err.code = 'NO_SMTP';
    throw err;
  }
  const transporter = buildTransport(cfg);
  const from = `${cfg.fromName || 'Expo Stores'} <${cfg.fromEmail}>`;
  await transporter.sendMail({
    from,
    to: String(to || '').trim(),
    subject: String(subject || ''),
    text: String(text || ''),
    html: String(html || '')
  });
}

module.exports = {
  getStoreEmailConfig,
  getStoreNotificationRecipients,
  getStoreAssignCcLists,
  getStoreNotificationSubjects,
  sendStoreEmail,
  buildTransport,
  getFallbackConfig,
  resolvePasswordResetSmtpConfig,
  sendPasswordResetEmail
};

