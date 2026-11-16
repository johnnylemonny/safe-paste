import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';

// Guard the permission boundary while the product modules are still placeholders.
describe('extension manifest', () => {
  it('limits static content-script execution to GitHub in the isolated world', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://github.com/*'],
        js: ['content-script.js'],
        run_at: 'document_idle',
        world: 'ISOLATED',
      },
    ]);
  });

  it('adds no API permissions, background execution, or exposed resources', () => {
    for (const field of [
      'permissions', 'optional_permissions', 'host_permissions',
      'optional_host_permissions', 'background', 'web_accessible_resources',
      'externally_connectable',
    ]) {
      expect(manifest).not.toHaveProperty(field);
    }
  });
});
