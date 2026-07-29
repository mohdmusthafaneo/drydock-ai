import {
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
  GetBucketAclCommand,
} from "@aws-sdk/client-s3";
import type { AwsClients } from "../../client-factory";
import { tagsFromAws, type CollectedResource } from "../types";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function collectS3Resources(
  clients: AwsClients,
  accountId: string,
): Promise<CollectedResource[]> {
  const resources: CollectedResource[] = [];
  const listed = await clients.s3.send(new ListBucketsCommand({}));

  for (const bucket of listed.Buckets ?? []) {
    if (!bucket.Name) continue;
    const name = bucket.Name;

    const location = await safe(() =>
      clients.s3.send(new GetBucketLocationCommand({ Bucket: name })),
    );
    const region =
      !location?.LocationConstraint || location.LocationConstraint === undefined
        ? "us-east-1"
        : String(location.LocationConstraint);

    const [tagging, versioning, pab, policyStatus, acl] = await Promise.all([
      safe(() => clients.s3.send(new GetBucketTaggingCommand({ Bucket: name }))),
      safe(() => clients.s3.send(new GetBucketVersioningCommand({ Bucket: name }))),
      safe(() => clients.s3.send(new GetPublicAccessBlockCommand({ Bucket: name }))),
      safe(() => clients.s3.send(new GetBucketPolicyStatusCommand({ Bucket: name }))),
      safe(() => clients.s3.send(new GetBucketAclCommand({ Bucket: name }))),
    ]);

    const isPublicAcl = (acl?.Grants ?? []).some(
      (g) =>
        g.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AllUsers" ||
        g.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
    );

    resources.push({
      resourceType: "S3_BUCKET",
      resourceId: name,
      region,
      name,
      arn: `arn:aws:s3:::${name}`,
      tags: tagsFromAws(tagging?.TagSet),
      raw: {
        creationDate: bucket.CreationDate,
        accountId,
        versioningStatus: versioning?.Status ?? "Disabled",
        mfaDelete: versioning?.MFADelete,
        publicAccessBlock: pab?.PublicAccessBlockConfiguration ?? null,
        policyIsPublic: policyStatus?.PolicyStatus?.IsPublic ?? false,
        isPublicAcl,
      },
    });
  }

  return resources;
}
