import { AsyncLocalStorage } from "node:async_hooks";

export type SlackRequestTenant = {
  organizationId: string;
  integrationId: string;
  teamId: string;
  botToken: string;
  botUserId?: string;
};

export const slackRequestTenant = new AsyncLocalStorage<SlackRequestTenant>();

export function getSlackRequestTenant(): SlackRequestTenant | undefined {
  return slackRequestTenant.getStore();
}
