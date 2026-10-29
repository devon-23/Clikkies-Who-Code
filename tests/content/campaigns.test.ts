import { describe, expect, it } from 'vitest';
import { campaigns } from '../../content/campaigns.ts';
import { CAMPAIGN_IDS, campaignListSchema } from '../../src/shared/content/campaign.ts';

describe('campaign content', () => {
  it('lists all five eras in unlock order', () => {
    expect(campaigns.map((c) => c.id)).toEqual([...CAMPAIGN_IDS]);
    expect(campaigns.map((c) => c.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects a list that is out of order', () => {
    const swapped = [campaigns[1], campaigns[0], ...campaigns.slice(2)];
    expect(campaignListSchema.safeParse(swapped).success).toBe(false);
  });

  // honesty rule: nothing is playable until its missions exist. When the
  // mission engine lands, this test changes to "playable campaigns have
  // missions" -- until then, nothing may claim to be playable
  it('does not mark any campaign playable before missions exist', () => {
    expect(campaigns.filter((c) => c.status === 'playable')).toEqual([]);
  });
});
