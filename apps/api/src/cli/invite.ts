import mongoose from 'mongoose';
import { emailSchema } from '@doctor-tracker/shared';
import { loadConfig } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import { Invitation } from '../models/auth.js';
import { hashToken, randomToken } from '../utils/security.js';

async function main() {
  const email = emailSchema.parse(process.argv[2]);
  const config = loadConfig();
  await connectDatabase(config);
  const token = randomToken();
  await Invitation.create({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 3600_000),
  });
  // This privileged CLI intentionally emits a one-time secret to its operator, never to application logs.
  // Fragment avoids sending invitations in request URLs, referrers, or web access logs.
  process.stdout.write(
    `Invitation for ${email} (expires in 24 hours):\n${config.WEB_ORIGIN}/signup#invite=${token}\nShare privately. Never commit this link.\n`,
  );
}
main()
  .catch(() => {
    process.stderr.write(
      'Could not create invitation. Check the email, environment, and MongoDB replica set.\n',
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
