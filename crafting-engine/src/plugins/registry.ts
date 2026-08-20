import type { CraftingPlugin } from './Plugin.ts';

export class PluginRegistry {
  private plugins = new Map<string, CraftingPlugin>();

  register(plugin: CraftingPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  get(pluginId: string): CraftingPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAll(): CraftingPlugin[] {
    return Array.from(this.plugins.values());
  }

  getActivePlugins(): CraftingPlugin[] {
    return this.getAll().filter((p) => p.enabled);
  }
}
