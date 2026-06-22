// Starter prompts for the `education-research` domain (prompt-seed-catalog, D-C/D-D).

import type { SeedPrompt } from './index';

export const EDUCATION_RESEARCH: SeedPrompt[] = [
  {
    seedId: 'education-research/explain-concept',
    domain: 'education-research',
    title: 'Explain a concept',
    description: 'Get a clear explanation at the right level.',
    body: [
      'Explain {{concept}} to a {{level = high-school}} learner.',
      'Use a simple analogy, then give one worked example.',
    ].join('\n'),
    tags: ['teaching'],
    targetModels: ['claude', 'gemini'],
  },
  {
    seedId: 'education-research/lesson-plan',
    domain: 'education-research',
    title: 'Build a lesson plan',
    description: 'Structure a class around a topic.',
    body: [
      'Create a {{duration = 60-minute}} lesson plan on {{topic}} for {{audience}}.',
      'Include objectives, activities, and a short assessment.',
    ].join('\n'),
    tags: ['lesson', 'planning'],
    targetModels: ['claude'],
  },
  {
    seedId: 'education-research/literature-summary',
    domain: 'education-research',
    title: 'Summarize research',
    description: 'Condense a paper or abstract.',
    body: [
      'Summarize the following text for a {{audience = general}} reader.',
      'Capture the main claim, the method, and the key findings:',
      '',
      '{{text}}',
    ].join('\n'),
    tags: ['summary', 'research'],
    targetModels: ['claude', 'perplexity'],
  },
  {
    seedId: 'education-research/quiz-questions',
    domain: 'education-research',
    title: 'Generate quiz questions',
    description: 'Create practice questions on a topic.',
    body: [
      'Write {{count = 5}} {{type = multiple-choice}} questions on {{topic}}',
      'at a {{difficulty = medium}} level, with answers and short explanations.',
    ].join('\n'),
    tags: ['assessment'],
    targetModels: ['claude'],
  },
  {
    seedId: 'education-research/research-questions',
    domain: 'education-research',
    title: 'Frame research questions',
    description: 'Turn a topic into investigable questions.',
    body: [
      'I am researching {{topic}}.',
      'Propose five focused, answerable research questions and note why each matters.',
    ].join('\n'),
    tags: ['research'],
    targetModels: ['claude', 'gemini'],
  },
];
