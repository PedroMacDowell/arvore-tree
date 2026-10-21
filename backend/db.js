// MongoDB persistence with indexes and optional multi-document transactions.
const { MongoClient } = require('mongodb');
const { database } = require('./config');

if (!database.url) throw new Error('Set MONGODB_URI in backend/.env or deployment settings.');

const client = new MongoClient(database.url, { serverSelectionTimeoutMS: 10000 });
let db;
const ready = client.connect().then(async () => {
  db = client.db(database.name);
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ username_key: 1 }, { unique: true }),
    db.collection('users').createIndex({ referral_code: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('pending_registrations').createIndex({ email: 1 }, { unique: true }),
    db.collection('pending_registrations').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('password_resets').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('password_resets').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('rate_limits').createIndex({ key: 1 }, { unique: true }),
    db.collection('mission_completions').createIndex({ user_id: 1, mission_key: 1 }, { unique: true }),
    db.collection('reward_claims').createIndex({ user_id: 1, reward_key: 1 }, { unique: true }),
    db.collection('forest_trees').createIndex({ user_id: 1, cycle: 1 }, { unique: true }),
  ]);
});
ready.catch(() => {});

const collection = (name, session) => {
  if (!db) throw new Error('MongoDB is not connected yet.');
  const base = db.collection(name);
  if (!session) return base;
  return new Proxy(base, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== 'function') return value;
      return (...args) => {
        const required = { find: 1, findOne: 1, findOneAndDelete: 1, findOneAndUpdate: 2, findOneAndReplace: 2, updateOne: 2, updateMany: 2, replaceOne: 2, deleteOne: 1, deleteMany: 1, insertOne: 1, insertMany: 1, estimatedDocumentCount: 0, distinct: 1, aggregate: 0, watch: 0 }[property] ?? args.length;
        const optionIndex = property === 'find' || property === 'aggregate' || property === 'watch' ? 1 : property === 'countDocuments' ? args.length : required;
        const existing = args[optionIndex];
        args[optionIndex] = { ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}), session };
        return value.apply(target, args);
      };
    },
  });
};

async function transaction(work) {
  await ready;
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (err) {
    // Standalone MongoDB (common for local installs) does not support transactions.
    // Mongo aborts the attempted transaction before this compatibility fallback.
    if (err.code === 20 || err.codeName === 'IllegalOperation') return work(null);
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  ready,
  users: session => collection('users', session),
  sessions: session => collection('sessions', session),
  pending: session => collection('pending_registrations', session),
  resets: session => collection('password_resets', session),
  rateLimits: session => collection('rate_limits', session),
  missions: session => collection('mission_completions', session),
  rewards: session => collection('reward_claims', session),
  forest: session => collection('forest_trees', session),
  transaction,
  close: () => client.close(),
};
