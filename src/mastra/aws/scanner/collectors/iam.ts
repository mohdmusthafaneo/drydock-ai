import { ListUsersCommand, ListRolesCommand, ListUserTagsCommand, ListRoleTagsCommand } from "@aws-sdk/client-iam";
import type { AwsClients } from "../../client-factory";
import { tagsFromAws, type CollectedResource } from "../types";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function collectIamResources(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];

  let userMarker: string | undefined;
  do {
    const users = await clients.iam.send(
      new ListUsersCommand({ Marker: userMarker }),
    );
    for (const user of users.Users ?? []) {
      if (!user.UserName || !user.Arn) continue;
      const tags = await safe(() =>
        clients.iam.send(new ListUserTagsCommand({ UserName: user.UserName! })),
      );
      resources.push({
        resourceType: "IAM_USER",
        resourceId: user.UserId ?? user.UserName,
        region: "global",
        name: user.UserName,
        arn: user.Arn,
        tags: tagsFromAws(tags?.Tags),
        raw: {
          createDate: user.CreateDate,
          path: user.Path,
          passwordLastUsed: user.PasswordLastUsed,
        },
      });
    }
    userMarker = users.IsTruncated ? users.Marker : undefined;
  } while (userMarker);

  let roleMarker: string | undefined;
  do {
    const roles = await clients.iam.send(
      new ListRolesCommand({ Marker: roleMarker }),
    );
    for (const role of roles.Roles ?? []) {
      if (!role.RoleName || !role.Arn) continue;
      // Skip AWS service-linked roles noise for inventory clarity
      if (role.Path?.startsWith("/aws-service-role/")) continue;
      const tags = await safe(() =>
        clients.iam.send(new ListRoleTagsCommand({ RoleName: role.RoleName! })),
      );
      resources.push({
        resourceType: "IAM_ROLE",
        resourceId: role.RoleId ?? role.RoleName,
        region: "global",
        name: role.RoleName,
        arn: role.Arn,
        tags: tagsFromAws(tags?.Tags),
        raw: {
          createDate: role.CreateDate,
          path: role.Path,
          maxSessionDuration: role.MaxSessionDuration,
          description: role.Description,
        },
      });
    }
    roleMarker = roles.IsTruncated ? roles.Marker : undefined;
  } while (roleMarker);

  return resources;
}
