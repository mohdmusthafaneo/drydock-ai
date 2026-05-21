-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "workspaceMode" TEXT NOT NULL DEFAULT 'MVP',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("createdAt", "id", "industry", "name", "slug", "updatedAt") SELECT "createdAt", "id", "industry", "name", "slug", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
