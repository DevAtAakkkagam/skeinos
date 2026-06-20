// Starter prompts for the `data-analytics` domain (prompt-seed-catalog, D-C/D-D).

import type { SeedPrompt } from './index';

export const DATA_ANALYTICS: SeedPrompt[] = [
  {
    seedId: 'data-analytics/sql-query',
    domain: 'data-analytics',
    title: 'Write a SQL query',
    description: 'Translate a question into SQL.',
    body: [
      'Write a {{dialect = PostgreSQL}} SQL query that answers: {{question}}.',
      'Assume these tables/columns: {{schema}}. Explain the query briefly.',
    ].join('\n'),
    tags: ['sql'],
    targetModels: ['claude'],
    slug: '/sql',
  },
  {
    seedId: 'data-analytics/explain-dataset',
    domain: 'data-analytics',
    title: 'Summarize a dataset',
    description: 'Get an overview and angles to explore.',
    body: [
      'Here is a description of a dataset:',
      '',
      '{{description}}',
      '',
      'Summarize what it contains and suggest five questions worth analyzing.',
    ].join('\n'),
    tags: ['exploration'],
    targetModels: ['claude', 'gemini'],
  },
  {
    seedId: 'data-analytics/clean-data',
    domain: 'data-analytics',
    title: 'Data cleaning plan',
    description: 'Plan the steps to clean messy data.',
    body: [
      'I have data with these issues: {{issues}}.',
      'Propose a step-by-step cleaning plan in {{tool = pandas}}, with code for each step.',
    ].join('\n'),
    tags: ['cleaning'],
    targetModels: ['claude'],
  },
  {
    seedId: 'data-analytics/chart-recommendation',
    domain: 'data-analytics',
    title: 'Recommend a chart',
    description: 'Pick the right visualization.',
    body: [
      'I want to show {{relationship}} across {{dimensions}}.',
      'Recommend the best chart type, explain why, and note what to avoid.',
    ].join('\n'),
    tags: ['visualization'],
    targetModels: ['claude'],
  },
  {
    seedId: 'data-analytics/interpret-stats',
    domain: 'data-analytics',
    title: 'Interpret a result',
    description: 'Make sense of a statistic or metric.',
    body: [
      'Explain what this result means in plain language for a {{audience = business}} reader,',
      'including caveats:',
      '',
      '{{result}}',
    ].join('\n'),
    tags: ['statistics'],
    targetModels: ['claude', 'perplexity'],
  },
];
