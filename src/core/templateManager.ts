import { TemplateConfig, TemplateId } from './types';

export const TEMPLATES: Record<TemplateId, TemplateConfig> = {
  coding: {
    id: 'coding',
    name: 'Coding Tutorial',
    tagline: 'Deep zoom on active editor lines & terminal',
    iconName: 'Code',
    defaultLayout: 'dynamic_crop',
    defaultZoom: 1.4,
    clickZoomMultiplier: 1.95,
    smoothingFactor: 0.16,
    safeZoneRatio: 0.35,
    showCursorHalo: true,
    description: 'Perfect for VS Code, terminal recordings, and GitHub walkthroughs. Keeps the active cursor line centered.'
  },
  product_demo: {
    id: 'product_demo',
    name: 'Product Demo',
    tagline: 'Ambient blur background with interactive click rings',
    iconName: 'Sparkles',
    defaultLayout: 'blur_backdrop',
    defaultZoom: 1.25,
    clickZoomMultiplier: 1.85,
    smoothingFactor: 0.12,
    safeZoneRatio: 0.45,
    showCursorHalo: true,
    description: 'Best for SaaS founders. Centers the product with elegant blurred edges and prominent click highlights.'
  },
  presentation: {
    id: 'presentation',
    name: 'Keynote & Slides',
    tagline: 'Silky smooth panning across slides and charts',
    iconName: 'Presentation',
    defaultLayout: 'gradient_mesh',
    defaultZoom: 1.1,
    clickZoomMultiplier: 1.65,
    smoothingFactor: 0.1,
    safeZoneRatio: 0.55,
    showCursorHalo: false,
    description: 'Designed for Pitch decks, Canva slides, and Keynotes. Minimal sudden movements with premium mesh border.'
  },
  browser: {
    id: 'browser',
    name: 'Browser Walkthrough',
    tagline: 'Fluid tracking across web navigation and dashboards',
    iconName: 'Globe',
    defaultLayout: 'blur_backdrop',
    defaultZoom: 1.3,
    clickZoomMultiplier: 1.85,
    smoothingFactor: 0.14,
    safeZoneRatio: 0.4,
    showCursorHalo: true,
    description: 'Follows page scrolls, button clicks, and tab switching with natural camera damping.'
  },
  custom: {
    id: 'custom',
    name: 'Custom Studio',
    tagline: 'Fully customized crop, zoom physics, and layout',
    iconName: 'Sliders',
    defaultLayout: 'dynamic_crop',
    defaultZoom: 1.35,
    clickZoomMultiplier: 2.0,
    smoothingFactor: 0.15,
    safeZoneRatio: 0.45,
    showCursorHalo: true,
    description: 'Tune your own spring dynamics, layout backdrops, and zoom thresholds.',
    proOnly: true
  }
};

export class TemplateManager {
  public static getAllTemplates(): TemplateConfig[] {
    return Object.values(TEMPLATES);
  }

  public static getTemplate(id: TemplateId): TemplateConfig {
    return TEMPLATES[id] || TEMPLATES.coding;
  }
}
