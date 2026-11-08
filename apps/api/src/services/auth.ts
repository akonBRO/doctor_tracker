import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { SignJWT, jwtVerify } from 'jose';
import { generateSecret, verify, generateURI } from 'otplib';
import { loginSchema, signupSchema, type AdminIdentity } from '@doctor-tracker/shared';
import type { Request, Response } from 'express';
import type { Config } from '../config/env.js';
import { Admin, Challenge, Invitation, Session, type AdminRecord } from '../models/auth.js';
import { cookieNames, cookieOptions } from '../middleware/security.js';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
} from '../utils/security.js';
import { AppError, invalidChallenge, unauthorized } from '../utils/errors.js';

const active = () => ({ expiresAt: { $gt: new Date() } });
const identity = (admin: AdminRecord): AdminIdentity => ({
  id: admin._id.toString(),
  name: admin.name,
  email: admin.email,
  role: 'admin',
});
const authFailure = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const mfaFailure = () =>
  new AppError(
    401,
    'INVALID_MFA',
    'That code is invalid or has already been used. Try a new code.',
  );

export class AuthService {
  constructor(
    private config: Config,
    private dummyHash: string,
  ) {}

  private setChallenge(res: Response, token: string) {
    res.cookie(cookieNames(this.config).challenge, token, {
      ...cookieOptions(this.config),
      maxAge: 5 * 60_000,
    });
  }
  private async setSession(
    res: Response,
    admin: AdminRecord,
    sessionId: string,
    refreshToken: string,
  ) {
    const access = await new SignJWT({ role: 'admin', sid: sessionId, amr: ['pwd', 'mfa'] })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(admin._id.toString())
      .setIssuer('doctor-tracker-api')
      .setAudience('doctor-tracker-web')
      .setIssuedAt()
      .setExpirationTime(`${this.config.ACCESS_TOKEN_MINUTES}m`)
      .sign(Buffer.from(this.config.JWT_SECRET, 'hex'));
    const options = cookieOptions(this.config);
    const names = cookieNames(this.config);
    res.cookie(names.access, access, {
      ...options,
      maxAge: this.config.ACCESS_TOKEN_MINUTES * 60_000,
    });
    res.cookie(names.refresh, refreshToken, {
      ...options,
      maxAge: this.config.REFRESH_TOKEN_DAYS * 86400_000,
    });
    res.clearCookie(names.challenge, options);
  }
  async signup(req: Request, res: Response) {
    const input = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const token = randomToken();
    await mongoose.connection.transaction(async (dbSession) => {
      const invitation = await Invitation.findOneAndUpdate(
        {
          tokenHash: hashToken(input.invitation),
          email: input.email,
          consumedAt: null,
          ...active(),
        },
        { $set: { consumedAt: new Date() } },
        { session: dbSession, returnDocument: 'after' },
      );
      if (!invitation)
        throw new AppError(
          400,
          'INVALID_INVITATION',
          'This invitation is invalid, expired, or already used. Ask your administrator for a new invitation.',
        );
      const [admin] = await Admin.create([{ name: input.name, email: input.email, passwordHash }], {
        session: dbSession,
      });
      await Challenge.create(
        [
          {
            tokenHash: hashToken(token),
            adminId: admin!._id,
            kind: 'enroll',
            expiresAt: new Date(Date.now() + 5 * 60_000),
          },
        ],
        { session: dbSession },
      );
    });
    this.setChallenge(res, token);
    return { step: 'enroll' as const };
  }
  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    const admin = await Admin.findOne({ email: input.email }).select('+passwordHash');
    const valid = await verifyPassword(admin?.passwordHash ?? this.dummyHash, input.password);
    if (!admin || !valid || admin.disabled || admin.role !== 'admin') throw authFailure();
    const token = randomToken();
    const step = admin.mfaEnabled ? 'verify' : 'enroll';
    await Challenge.create({
      tokenHash: hashToken(token),
      adminId: admin._id,
      kind: step,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    this.setChallenge(res, token);
    return { step };
  }
  async challenge(req: Request, countAttempt = false) {
    const token: unknown = req.cookies[cookieNames(this.config).challenge];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalidChallenge();
    const filter = { tokenHash: hashToken(token), attempts: { $lt: 5 }, ...active() };
    const challenge = countAttempt
      ? await Challenge.findOneAndUpdate(
          filter,
          { $inc: { attempts: 1 } },
          { returnDocument: 'after' },
        )
      : await Challenge.findOne(filter);
    if (!challenge) throw invalidChallenge();
    const admin = await Admin.findOne({
      _id: challenge.adminId,
      disabled: false,
      role: 'admin',
    }).select('+mfaSecret +recoveryHashes');
    if (!admin) throw invalidChallenge();
    return { challenge, admin };
  }
  async challengeStatus(req: Request) {
    const { challenge } = await this.challenge(req);
    return { step: challenge.kind };
  }
  async setup(req: Request) {
    const { challenge, admin } = await this.challenge(req);
    if (challenge.kind !== 'enroll' || admin.mfaEnabled)
      throw new AppError(
        403,
        'MFA_ALREADY_ENABLED',
        'Authenticator setup is not available for this session.',
      );
    if (!admin.mfaSecret) {
      // Conditional update ensures parallel setup requests cannot replace the enrollment secret.
      await Admin.updateOne(
        { _id: admin._id, mfaEnabled: false, mfaSecret: { $exists: false } },
        { $set: { mfaSecret: encryptSecret(generateSecret(), this.config.MFA_ENCRYPTION_KEY) } },
      );
    }
    const current = await Admin.findById(admin._id).select('+mfaSecret');
    if (!current?.mfaSecret || current.mfaEnabled) throw invalidChallenge();
    const secret = decryptSecret(current.mfaSecret, this.config.MFA_ENCRYPTION_KEY);
    return { secret, uri: generateURI({ issuer: 'Doctor Tracker', label: admin.email, secret }) };
  }
  async completeMfa(req: Request, res: Response, code: string, recovery = false) {
    const { challenge, admin } = await this.challenge(req, true);
    if (!admin.mfaSecret || (recovery && (!admin.mfaEnabled || challenge.kind !== 'verify')))
      throw mfaFailure();
    let step: number | undefined;
    if (!recovery) {
      const result = await verify({
        strategy: 'totp',
        secret: decryptSecret(admin.mfaSecret, this.config.MFA_ENCRYPTION_KEY),
        token: code,
        epochTolerance: 30,
      });
      if (!result.valid) throw mfaFailure();
      if (!('epoch' in result)) throw mfaFailure();
      step = Math.floor(result.epoch / 30);
      if (step <= admin.lastTotpStep) throw mfaFailure();
    }
    const enrollment = challenge.kind === 'enroll';
    if (enrollment && admin.mfaEnabled) throw invalidChallenge();
    if (!enrollment && !admin.mfaEnabled) throw invalidChallenge();
    const recoveryCodes = enrollment
      ? Array.from({ length: 8 }, () => randomBytes(8).toString('hex'))
      : undefined;
    const refreshToken = randomToken();
    let sessionId = '';
    await mongoose.connection.transaction(async (dbSession) => {
      const consumed = await Challenge.deleteOne(
        { _id: challenge._id, ...active() },
        { session: dbSession },
      );
      if (!consumed.deletedCount) throw invalidChallenge();
      const filter = {
        _id: admin._id,
        disabled: false,
        role: 'admin' as const,
        mfaEnabled: !enrollment,
        ...(recovery ? { recoveryHashes: hashToken(code) } : { lastTotpStep: { $lt: step! } }),
      };
      const update = recovery
        ? { $pull: { recoveryHashes: hashToken(code) } }
        : {
            $set: {
              lastTotpStep: step!,
              ...(enrollment
                ? { mfaEnabled: true, recoveryHashes: recoveryCodes!.map(hashToken) }
                : {}),
            },
          };
      const updated = await Admin.updateOne(filter, update, { session: dbSession });
      if (!updated.modifiedCount) throw mfaFailure();
      const [session] = await Session.create(
        [
          {
            adminId: admin._id,
            tokenHash: hashToken(refreshToken),
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_DAYS * 86400_000),
          },
        ],
        { session: dbSession },
      );
      sessionId = session!._id.toString();
    });
    await this.setSession(res, admin, sessionId, refreshToken);
    return { admin: identity(admin), ...(recoveryCodes ? { recoveryCodes } : {}) };
  }
  async authenticate(req: Request) {
    try {
      const token: unknown = req.cookies[cookieNames(this.config).access];
      if (typeof token !== 'string') throw unauthorized();
      const { payload } = await jwtVerify(token, Buffer.from(this.config.JWT_SECRET, 'hex'), {
        algorithms: ['HS256'],
        issuer: 'doctor-tracker-api',
        audience: 'doctor-tracker-web',
        requiredClaims: ['exp', 'iat', 'sub', 'sid', 'amr', 'role'],
      });
      if (
        payload.role !== 'admin' ||
        !Array.isArray(payload.amr) ||
        !payload.amr.includes('mfa') ||
        typeof payload.sid !== 'string' ||
        !mongoose.isObjectIdOrHexString(payload.sid) ||
        !mongoose.isObjectIdOrHexString(payload.sub)
      )
        throw unauthorized();
      const session = await Session.findOne({
        _id: payload.sid,
        adminId: payload.sub,
        revokedAt: null,
        ...active(),
      });
      if (!session) throw unauthorized();
      const admin = await Admin.findOne({
        _id: payload.sub,
        role: 'admin',
        disabled: false,
        mfaEnabled: true,
      });
      if (!admin) throw unauthorized();
      return identity(admin);
    } catch (error) {
      if (
        error instanceof mongoose.Error ||
        (error instanceof Error && error.name.startsWith('Mongo'))
      )
        throw error;
      throw unauthorized();
    }
  }
  async refresh(req: Request, res: Response) {
    const token: unknown = req.cookies[cookieNames(this.config).refresh];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw unauthorized();
    const old = await Session.findOne({ tokenHash: hashToken(token), ...active() });
    if (!old || old.revokedAt) throw unauthorized();
    if (old.rotatedAt) {
      await Session.updateMany({ familyId: old.familyId }, { $set: { revokedAt: new Date() } });
      throw unauthorized();
    }
    const admin = await Admin.findOne({
      _id: old.adminId,
      role: 'admin',
      disabled: false,
      mfaEnabled: true,
    });
    if (!admin) throw unauthorized();
    const next = randomToken();
    let sessionId = '';
    try {
      await mongoose.connection.transaction(async (dbSession) => {
        const rotated = await Session.updateOne(
          { _id: old._id, rotatedAt: null, revokedAt: null, ...active() },
          { $set: { rotatedAt: new Date() } },
          { session: dbSession },
        );
        if (!rotated.modifiedCount) throw unauthorized();
        const [session] = await Session.create(
          [
            {
              adminId: admin._id,
              tokenHash: hashToken(next),
              familyId: old.familyId,
              expiresAt: old.expiresAt,
            },
          ],
          { session: dbSession },
        );
        sessionId = session!._id.toString();
      });
    } catch (error) {
      if (error instanceof AppError && error.status === 401)
        await Session.updateMany({ familyId: old.familyId }, { $set: { revokedAt: new Date() } });
      throw error;
    }
    await this.setSession(res, admin, sessionId, next);
    return { admin: identity(admin) };
  }
  async logout(req: Request, res: Response) {
    const names = cookieNames(this.config);
    const refresh: unknown = req.cookies[names.refresh];
    if (typeof refresh === 'string') {
      const session = await Session.findOne({ tokenHash: hashToken(refresh) });
      if (session)
        await Session.updateMany(
          { familyId: session.familyId },
          { $set: { revokedAt: new Date() } },
        );
    }
    const challenge: unknown = req.cookies[names.challenge];
    if (typeof challenge === 'string')
      await Challenge.deleteOne({ tokenHash: hashToken(challenge) });
    for (const name of Object.values(names)) res.clearCookie(name, cookieOptions(this.config));
    return { signedOut: true };
  }
}
