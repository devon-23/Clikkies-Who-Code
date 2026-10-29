import { z } from 'zod';

// The five eras, in the only order they unlock. Training Grounds and the
// archive sit outside this sequence.
export const CAMPAIGN_IDS = ['blurryface', 'trench', 'scaled-and-icy', 'clancy', 'breach'] as const;
export type CampaignId = (typeof CAMPAIGN_IDS)[number];

// playable       -- missions exist and can be completed
// in_development -- being built now; nothing to play yet
// planned        -- story arc written, nothing built
export const campaignStatus = z.enum(['playable', 'in_development', 'planned']);

export const campaignSchema = z.object({
  id: z.enum(CAMPAIGN_IDS),
  order: z.number().int().min(1).max(5),
  title: z.string().min(1),
  chapter: z.string().min(1),
  tagline: z.string().min(1),
  difficulty: z.string().min(1),
  status: campaignStatus,
  // in-world, shown on the card. keep it short and spoiler-free
  teaser: z.string().min(1).max(220),
  // out-of-world, plain language: what this campaign will actually contain
  plannedContent: z.string().min(1).max(300),
});

export type Campaign = z.infer<typeof campaignSchema>;

export const campaignListSchema = z
  .array(campaignSchema)
  .length(CAMPAIGN_IDS.length)
  .superRefine((list, ctx) => {
    list.forEach((c, i) => {
      if (c.id !== CAMPAIGN_IDS[i] || c.order !== i + 1) {
        ctx.addIssue({ code: 'custom', message: `campaign ${i + 1} must be "${CAMPAIGN_IDS[i]}" with order ${i + 1}` });
      }
    });
  });
