import { prisma } from '../../src/config/prisma';

/** Empties every application table in the test database. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "image_variants", "images", "transactions", "payments", "phone_verifications", "wallets", "users" RESTART IDENTITY CASCADE',
  );
}

export { prisma };
