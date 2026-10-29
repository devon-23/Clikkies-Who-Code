// The five campaigns. Authored content: edit freely, and run `npm test` --
// the content tests reject anything out of order or missing a field.
//
// Status must be honest. Nothing is "playable" until its missions exist and
// can be finished end to end.

import { campaignListSchema, type Campaign } from '../src/shared/content/campaign.ts';

export const campaigns: Campaign[] = campaignListSchema.parse([
  {
    id: 'blurryface',
    order: 1,
    title: 'Blurryface',
    chapter: 'The Discovery',
    tagline: 'The City That Never Lets You Leave',
    difficulty: 'Beginner',
    status: 'in_development',
    teaser: 'Two records describe every resident of Dema, and they do not agree. Somebody named in one of them was never supposed to be found.',
    plannedContent: 'Six investigations into altered city records: reading documents, spotting bad dates, simple ciphers, and reading a web page’s source. Being built now.',
  },
  {
    id: 'trench',
    order: 2,
    title: 'Trench',
    chapter: 'The Escape',
    tagline: 'Beyond the Perimeter',
    difficulty: 'Easy to intermediate',
    status: 'planned',
    teaser: 'East is up. Somebody left directions, and somebody else tried to burn them.',
    plannedContent: 'Field notes, maps and file metadata. Reconstructing routes from incomplete evidence, and checking a source before trusting it.',
  },
  {
    id: 'scaled-and-icy',
    order: 3,
    title: 'Scaled and Icy',
    chapter: 'The Performance',
    tagline: 'Good Day Dema',
    difficulty: 'Intermediate',
    status: 'planned',
    teaser: 'Everything here has been approved. Smile for the broadcast.',
    plannedContent: 'Broadcasts and official pages. Inspecting HTML and JavaScript, simulated network requests, and messages hidden inside approved content.',
  },
  {
    id: 'clancy',
    order: 4,
    title: 'Clancy',
    chapter: 'The Return',
    tagline: 'The Return to Dema',
    difficulty: 'Intermediate to advanced',
    status: 'planned',
    teaser: 'Trust no single file. The resistance is listening, and so are the vultures.',
    plannedContent: 'Chained puzzles across logs and intercepted transmissions, combining evidence from every earlier campaign.',
  },
  {
    id: 'breach',
    order: 5,
    title: 'Breach',
    chapter: 'The Transformation',
    tagline: 'The Nova Bishop',
    difficulty: 'Advanced to expert',
    status: 'planned',
    teaser: '[RECORD DAMAGED] — nine signals — [RECORD DAMAGED]',
    plannedContent: 'Multi-stage investigations that revisit earlier evidence with a new reading. Ends the cycle. Or begins it.',
  },
]);
