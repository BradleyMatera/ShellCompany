const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Helper to consolidate identities under a single owner in development
async function resolvePrimaryUser(currentUser) {
  if (process.env.NODE_ENV !== 'development') return currentUser;
  try {
    const ownerEmail = process.env.DEV_OWNER_EMAIL || 'admin@shellcompany.ai';
    const { User } = require('../models');
    let owner = await User.findOne({ where: { email: ownerEmail } });
    if (!owner) return currentUser;
    return owner;
  } catch {
    return currentUser;
  }
}

// Ensure we either find or create a provider connection, handling unique/NOT NULL safely
async function ensureConnection({ userId, provider, accountId, scopes, accessToken, refreshToken, metadata }) {
  const { Connection } = require('../models');
  let connection = await Connection.findOne({ where: { user_id: userId, provider } });
  if (!connection) {
    // Build then save to control all required fields
    connection = Connection.build({
      user_id: userId,
      provider,
      account_id: accountId,
      scopes: scopes || [],
      status: 'active',
      last_checked_at: new Date(),
      token_encrypted: 'placeholder',
      metadata: metadata || {}
    });
    connection.setToken(accessToken);
    if (refreshToken) connection.setRefreshToken(refreshToken);
    try {
      await connection.save();
    } catch (e) {
      // If insert raced or hit schema constraint, fall back to existing row or user.settings
      const existing = await Connection.findOne({ where: { user_id: userId, provider } });
      if (!existing) {
        // Persist token in user.settings as last resort (dev-friendly)
        try {
          const { User } = require('../models');
          const u = await User.findByPk(userId);
          if (u) {
            const s = u.settings || {};
            s.oauth = s.oauth || {};
            s.oauth[provider] = { access_token: accessToken, refresh_token: refreshToken || null, updated_at: new Date().toISOString() };
            u.settings = s;
            await u.save();
          }
        } catch {}
        return null;
      }
      connection = existing;
    }
  }
  // Update fields/token on existing connection
  connection.account_id = accountId;
  if (scopes) connection.scopes = scopes;
  connection.status = 'active';
  connection.last_checked_at = new Date();
  connection.metadata = metadata || connection.metadata || {};
  connection.setToken(accessToken);
  if (refreshToken) connection.setRefreshToken(refreshToken);
  await connection.save();
  return connection;
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email', 'repo', 'workflow', 'read:org', 'project', 'admin:repo_hook']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Find/link user (prefer existing by email)
      let user = await User.findOne({ where: { github_id: profile.id } });
      const email = (profile.emails && profile.emails[0] ? profile.emails[0].value : null) || `${profile.username}@github.local`;
      if (!user) user = await User.findOne({ where: { email } });
      if (!user) {
        user = await User.create({ github_id: profile.id, email, name: profile.displayName || profile.username, avatar_url: profile.photos[0]?.value, role: 'contributor' });
      } else {
        if (!user.github_id) user.github_id = profile.id;
        user.avatar_url = profile.photos[0]?.value || user.avatar_url;
        await user.save();
      }
      const primaryUser = await resolvePrimaryUser(user);

      await ensureConnection({
        userId: primaryUser.id,
        provider: 'github',
        accountId: profile.id,
        scopes: ['user:email', 'repo', 'workflow', 'read:org', 'project', 'admin:repo_hook'],
        accessToken,
        refreshToken,
        metadata: { username: profile.username, profile_url: profile.profileUrl }
      });
      // Update last login
      primaryUser.last_login_at = new Date();
      await primaryUser.save();
      return done(null, primaryUser);
    } catch (error) {
      return done(error, null);
    }
  }));
}

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['openid', 'email', 'profile']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Find/link user by google id or email
      let user = await User.findOne({ where: { google_id: profile.id } });
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (!user && email) user = await User.findOne({ where: { email } });
      if (!user) {
        user = await User.create({ google_id: profile.id, email, name: profile.displayName, avatar_url: profile.photos[0]?.value, role: 'contributor' });
      } else {
        if (!user.google_id) user.google_id = profile.id;
        user.avatar_url = profile.photos[0]?.value || user.avatar_url;
        await user.save();
      }
      const primaryUser = await resolvePrimaryUser(user);

      await ensureConnection({
        userId: primaryUser.id,
        provider: 'google',
        accountId: profile.id,
        scopes: ['openid', 'email', 'profile'],
        accessToken,
        refreshToken,
        metadata: { email: profile.emails[0]?.value, profile_url: profile.profileUrl }
      });
      // Update last login
      primaryUser.last_login_at = new Date();
      await primaryUser.save();
      return done(null, primaryUser);
    } catch (error) {
      return done(error, null);
    }
  }));
}

module.exports = passport;
