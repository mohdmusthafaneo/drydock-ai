import type { CollectedResource } from '../scanner/types';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type HygieneFinding = {
  checkId: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  recommendation: string;
  resourceType?: string | null;
  resourceRef?: string | null;
};

export type HygieneCheck = (resources: CollectedResource[]) => HygieneFinding[];

export class HygieneEngine {
  constructor(private readonly checks: HygieneCheck[]) {}

  run(resources: CollectedResource[]): HygieneFinding[] {
    return this.checks.flatMap((check) => {
      try {
        return check(resources);
      } catch (error) {
        console.warn('Hygiene check failed:', error);
        return [];
      }
    });
  }
}
