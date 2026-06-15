import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function enableSqliteForeignKeys() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}
