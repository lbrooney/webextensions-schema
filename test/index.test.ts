import { it, describe } from 'vitest';
import webExtensionsSchema from '../src/index.js';

describe('WebExtensionsSchema', () => {
  it('should provide the raw schema', async ({ expect }) => {
    const schema = await webExtensionsSchema();
    const privacy = schema.raw()['privacy.json'];
    expect(Array.isArray(privacy)).toBe(true);
  });

  it('should provide the schema namespaces', async ({ expect }) => {
    const schema = await webExtensionsSchema();
    const { privacy, manifest } = schema.namespaces();
    expect(privacy[0].namespace).toBe('privacy');
    expect(Array.isArray(manifest[0].types)).toBe(true);
  });
});
