-- CreateIndex
CREATE UNIQUE INDEX "Release_organizationId_jiraFixVersion_serviceScope_key" ON "Release"("organizationId", "jiraFixVersion", "serviceScope");
