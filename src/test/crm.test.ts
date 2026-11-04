import { describe, expect, it } from 'vitest';
import { crmMetrics } from '../lib/crm';
describe('CRM financial calculations', () => {
  const rows = [{stage:'proposal',value:'1000.25',probability:50}, {stage:'negotiation',value:'2000',probability:75}, {stage:'won',value:'3000',probability:100}, {stage:'lost',value:'4000',probability:0}];
  it('counts only open opportunities in pipeline value', () => expect(crmMetrics(rows).openValue).toBe(3000.25));
  it('rounds probability-weighted estimates to SAR cents', () => expect(crmMetrics(rows).weightedValue).toBe(2000.13));
  it('calculates win rate using closed opportunities only', () => expect(crmMetrics(rows).winRate).toBe(50));
  it('does not invent a win rate without closed opportunities', () => expect(crmMetrics([]).winRate).toBeNull());
});