// Starter prompts for the `software-engineering` domain (prompt-seed-catalog, D-C/D-D).
// Read-only bundle data: plain `SeedPrompt` objects carrying authored content only —
// the installer derives `variables`, mints the `id`, and stamps the envelope (D-D).

import type { SeedPrompt } from './index';

export const SOFTWARE_ENGINEERING: SeedPrompt[] = [
  {
    seedId: 'software-engineering/code-review',
    domain: 'software-engineering',
    title: 'Code review',
    description: 'Get a focused review of a diff or snippet.',
    body: [
      'Review the following {{language = TypeScript}} code for correctness, readability, and edge cases.',
      'Call out bugs first, then suggest improvements, and keep the feedback concrete.',
      '',
      '```',
      '{{code}}',
      '```',
    ].join('\n'),
    tags: ['review', 'quality'],
    targetModels: ['claude'],
  },
  {
    seedId: 'software-engineering/debug-error',
    domain: 'software-engineering',
    title: 'Debug an error',
    description: 'Work through a stack trace or failing behavior.',
    body: [
      'I am hitting this error in {{context = my app}}:',
      '',
      '```',
      '{{error}}',
      '```',
      '',
      'Explain the likely root cause and give me the smallest fix, with reasoning.',
    ].join('\n'),
    tags: ['debugging'],
    targetModels: ['claude'],
  },
  {
    seedId: 'software-engineering/explain-code',
    domain: 'software-engineering',
    title: 'Explain this code',
    description: 'Understand an unfamiliar snippet quickly.',
    body: [
      'Explain what the following code does, step by step, for a {{level = mid-level}} engineer.',
      'Note any non-obvious behavior or assumptions.',
      '',
      '```',
      '{{code}}',
      '```',
    ].join('\n'),
    tags: ['learning'],
    targetModels: ['claude', 'gemini'],
  },
  {
    seedId: 'software-engineering/write-tests',
    domain: 'software-engineering',
    title: 'Write unit tests',
    description: 'Generate tests for a function or module.',
    body: [
      'Write {{framework = Vitest}} unit tests for the following code.',
      'Cover the happy path, edge cases, and error handling. Keep each test focused.',
      '',
      '```',
      '{{code}}',
      '```',
    ].join('\n'),
    tags: ['testing'],
    targetModels: ['claude'],
  },
  {
    seedId: 'software-engineering/refactor',
    domain: 'software-engineering',
    title: 'Refactor for clarity',
    description: 'Improve structure without changing behavior.',
    body: [
      'Refactor the following code for {{goal = readability}} while preserving its behavior.',
      'Explain each change briefly and keep the public interface stable.',
      '',
      '```',
      '{{code}}',
      '```',
    ].join('\n'),
    tags: ['refactor', 'quality'],
    targetModels: ['claude'],
  },
];
