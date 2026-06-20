// Starter prompts for the `marketing-content` domain (prompt-seed-catalog, D-C/D-D).

import type { SeedPrompt } from './index';

export const MARKETING_CONTENT: SeedPrompt[] = [
  {
    seedId: 'marketing-content/blog-outline',
    domain: 'marketing-content',
    title: 'Blog post outline',
    description: 'Draft a structured outline for an article.',
    body: [
      'Create a detailed outline for a blog post titled "{{title}}" aimed at {{audience}}.',
      'Include a hook, 4–6 sections with bullet points, and a closing call to action.',
    ].join('\n'),
    tags: ['blog', 'writing'],
    targetModels: ['claude', 'gemini'],
    slug: '/outline',
  },
  {
    seedId: 'marketing-content/social-post',
    domain: 'marketing-content',
    title: 'Social media post',
    description: 'Write a short post for a chosen channel.',
    body: [
      'Write a {{platform = LinkedIn | X | Instagram}} post promoting {{topic}}.',
      'Match a {{tone = professional}} tone, keep it concise, and end with a clear CTA.',
    ].join('\n'),
    tags: ['social'],
    targetModels: ['claude'],
    slug: '/post',
  },
  {
    seedId: 'marketing-content/email-campaign',
    domain: 'marketing-content',
    title: 'Marketing email',
    description: 'Draft a campaign email with a subject line.',
    body: [
      'Write a marketing email for {{product}} targeting {{audience}}.',
      'Provide three subject-line options, then the body with one primary call to action.',
    ].join('\n'),
    tags: ['email', 'campaign'],
    targetModels: ['claude'],
  },
  {
    seedId: 'marketing-content/seo-keywords',
    domain: 'marketing-content',
    title: 'SEO keyword ideas',
    description: 'Brainstorm keywords around a topic.',
    body: [
      'Suggest 15 SEO keywords and search phrases for {{topic}}, grouped by intent',
      '(informational, commercial, transactional). Note which are long-tail.',
    ].join('\n'),
    tags: ['seo'],
    targetModels: ['claude', 'gemini', 'perplexity'],
  },
  {
    seedId: 'marketing-content/rewrite-tone',
    domain: 'marketing-content',
    title: 'Rewrite in a new tone',
    description: 'Adjust the voice of existing copy.',
    body: [
      'Rewrite the following copy in a {{tone = friendly}} tone for {{audience}}:',
      '',
      '{{copy}}',
    ].join('\n'),
    tags: ['copywriting', 'editing'],
    targetModels: ['claude'],
    slug: '/rewrite',
  },
];
