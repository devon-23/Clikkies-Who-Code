// Account achievements. Permanent across cycles. No trigger may depend on
// hint use.
export const achievements: unknown[] = [
  {
    id: 'first-record',
    title: 'Paper trail',
    description: 'Recover your first record.',
    trigger: { kind: 'evidence-count', count: 1 },
  },
  {
    id: 'blurryface-closed',
    title: 'The city that never lets you leave',
    description: 'Close the Blurryface campaign.',
    trigger: { kind: 'campaign', campaign: 'blurryface' },
  },
  {
    id: 'second-cycle',
    title: 'Again',
    description: '[RECORD DAMAGED]',
    secret: true,
    trigger: { kind: 'cycle', count: 2 },
  },
];
