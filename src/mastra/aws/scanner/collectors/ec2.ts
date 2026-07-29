import { DescribeRegionsCommand, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeAddressesCommand, DescribeFlowLogsCommand } from "@aws-sdk/client-ec2";
import type { AwsClients } from "../../client-factory";
import { tagsFromAws, type CollectedResource } from "../types";

export async function listEnabledRegions(clients: AwsClients): Promise<string[]> {
  const result = await clients.ec2.send(
    new DescribeRegionsCommand({ AllRegions: false }),
  );
  return (result.Regions ?? [])
    .map((r) => r.RegionName)
    .filter((r): r is string => Boolean(r));
}

export async function collectEc2Resources(
  clients: AwsClients,
): Promise<CollectedResource[]> {
  const region = clients.region;
  const resources: CollectedResource[] = [];

  const instances = await clients.ec2.send(new DescribeInstancesCommand({}));
  for (const reservation of instances.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      if (!instance.InstanceId) continue;
      resources.push({
        resourceType: "EC2_INSTANCE",
        resourceId: instance.InstanceId,
        region,
        name: instance.Tags?.find((t) => t.Key === "Name")?.Value ?? instance.InstanceId,
        arn: `arn:aws:ec2:${region}::instance/${instance.InstanceId}`,
        tags: tagsFromAws(instance.Tags),
        raw: {
          instanceType: instance.InstanceType,
          state: instance.State?.Name,
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
          launchTime: instance.LaunchTime,
          ownerId: reservation.OwnerId,
        },
      });
    }
  }

  const vpcs = await clients.ec2.send(new DescribeVpcsCommand({}));
  for (const vpc of vpcs.Vpcs ?? []) {
    if (!vpc.VpcId) continue;
    resources.push({
      resourceType: "VPC",
      resourceId: vpc.VpcId,
      region,
      name: vpc.Tags?.find((t) => t.Key === "Name")?.Value ?? vpc.VpcId,
      arn: `arn:aws:ec2:${region}:${vpc.OwnerId ?? ""}:vpc/${vpc.VpcId}`,
      tags: tagsFromAws(vpc.Tags),
      raw: {
        cidrBlock: vpc.CidrBlock,
        isDefault: vpc.IsDefault,
        state: vpc.State,
      },
    });
  }

  const subnets = await clients.ec2.send(new DescribeSubnetsCommand({}));
  for (const subnet of subnets.Subnets ?? []) {
    if (!subnet.SubnetId) continue;
    resources.push({
      resourceType: "SUBNET",
      resourceId: subnet.SubnetId,
      region,
      name: subnet.Tags?.find((t) => t.Key === "Name")?.Value ?? subnet.SubnetId,
      arn: subnet.SubnetArn,
      tags: tagsFromAws(subnet.Tags),
      raw: {
        vpcId: subnet.VpcId,
        cidrBlock: subnet.CidrBlock,
        availabilityZone: subnet.AvailabilityZone,
        mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch,
      },
    });
  }

  const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
  for (const sg of sgs.SecurityGroups ?? []) {
    if (!sg.GroupId) continue;
    resources.push({
      resourceType: "SECURITY_GROUP",
      resourceId: sg.GroupId,
      region,
      name: sg.GroupName ?? sg.GroupId,
      arn: `arn:aws:ec2:${region}:${sg.OwnerId ?? ""}:security-group/${sg.GroupId}`,
      tags: tagsFromAws(sg.Tags),
      raw: {
        vpcId: sg.VpcId,
        description: sg.Description,
        inboundRules: sg.IpPermissions,
        outboundRules: sg.IpPermissionsEgress,
      },
    });
  }

  const addresses = await clients.ec2.send(new DescribeAddressesCommand({}));
  for (const addr of addresses.Addresses ?? []) {
    const id = addr.AllocationId ?? addr.PublicIp;
    if (!id) continue;
    resources.push({
      resourceType: "ELASTIC_IP",
      resourceId: id,
      region,
      name: addr.PublicIp ?? id,
      arn: addr.AllocationId
        ? `arn:aws:ec2:${region}:${addr.Domain === "vpc" ? "" : ""}:eip-allocation/${addr.AllocationId}`
        : null,
      tags: tagsFromAws(addr.Tags),
      raw: {
        publicIp: addr.PublicIp,
        associationId: addr.AssociationId,
        instanceId: addr.InstanceId,
        networkInterfaceId: addr.NetworkInterfaceId,
        privateIpAddress: addr.PrivateIpAddress,
      },
    });
  }

  const flowLogs = await clients.ec2.send(new DescribeFlowLogsCommand({}));
  for (const fl of flowLogs.FlowLogs ?? []) {
    if (!fl.FlowLogId) continue;
    resources.push({
      resourceType: "VPC_FLOW_LOG",
      resourceId: fl.FlowLogId,
      region,
      name: fl.FlowLogId,
      tags: tagsFromAws(fl.Tags),
      raw: {
        resourceId: fl.ResourceId,
        trafficType: fl.TrafficType,
        logDestinationType: fl.LogDestinationType,
        logDestination: fl.LogDestination,
        flowLogStatus: fl.FlowLogStatus,
      },
    });
  }

  return resources;
}
