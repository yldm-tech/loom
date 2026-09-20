/**
 * Visual themes as a closed, mutually exclusive set.
 *
 * Which one suits a business is a judgement that lives in the user's own
 * description, so it goes to jev as a single Choice — the question shape that
 * held up at 96 options with no cross-contamination. Code never guesses here
 * and the LLM never gets to invent a palette.
 */
export type Theme = {
  label: string;
  /** Sent to jev as the option's rubric; describes fit, not hex codes. */
  description: string;
  tokens: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentText: string;
    accentSoft: string;
    band: string;
    bandText: string;
    bandMuted: string;
    heroFrom: string;
    heroTo: string;
    radius: string;
    font: string;
    display: string;
    tracking: string;
  };
};

const SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const SERIF =
  'Georgia, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, "JetBrains Mono", monospace';

export const THEMES: Record<string, Theme> = {
  forest: {
    label: "林木绿",
    description:
      "深墨绿 + 米白，克制、可信、有自然感。适合开源项目、工具软件、环保与户外、以及任何强调「踏实不浮夸」的业务。",
    tokens: {
      bg: "#ffffff", surface: "#f7f9f7", text: "#14201a", muted: "#5d6b63",
      border: "#dde5e0", accent: "#1f5140", accentText: "#ffffff", accentSoft: "#eaf2ed",
      band: "#14342a", bandText: "#ffffff", bandMuted: "#a8c9bb",
      heroFrom: "#eaf2ed", heroTo: "#ffffff",
      radius: "12px", font: SANS, display: SANS, tracking: "-0.02em",
    },
  },
  corporate: {
    label: "商务蓝",
    description:
      "深藏蓝 + 冷灰，正式、专业、有合规感。适合金融、保险、法务、医疗、企业级 SaaS、以及任何面向机构客户需要建立信任的业务。",
    tokens: {
      bg: "#ffffff", surface: "#f6f8fb", text: "#101828", muted: "#5a6478",
      border: "#dbe1ea", accent: "#14346b", accentText: "#ffffff", accentSoft: "#e8eef8",
      band: "#0d2450", bandText: "#ffffff", bandMuted: "#a8bcdd",
      heroFrom: "#eef3fa", heroTo: "#ffffff",
      radius: "6px", font: SANS, display: SANS, tracking: "-0.01em",
    },
  },
  warm: {
    label: "暖陶土",
    description:
      "焦糖棕 + 奶油白，温暖、手作、有烟火气。适合咖啡、烘焙、餐饮、民宿、手工艺、以及任何靠线下体验和人情味打动人的业务。",
    tokens: {
      bg: "#fffcf8", surface: "#fdf6ee", text: "#2b1d13", muted: "#7a6352",
      border: "#eaddcd", accent: "#9a5b2d", accentText: "#fffaf4", accentSoft: "#f6e9dc",
      band: "#3d2818", bandText: "#fdf6ee", bandMuted: "#c9ab8e",
      heroFrom: "#fbf0e2", heroTo: "#fffcf8",
      radius: "16px", font: SERIF, display: SERIF, tracking: "0",
    },
  },
  ink: {
    label: "水墨黑",
    description:
      "近黑 + 纯白，极简、克制、编辑感强，大量留白。适合摄影、设计作品集、独立创作者、杂志与出版、以及任何希望「内容本身是主角」的页面。",
    tokens: {
      bg: "#ffffff", surface: "#fafafa", text: "#0a0a0a", muted: "#737373",
      border: "#e5e5e5", accent: "#0a0a0a", accentText: "#ffffff", accentSoft: "#f5f5f5",
      band: "#0a0a0a", bandText: "#ffffff", bandMuted: "#a3a3a3",
      heroFrom: "#ffffff", heroTo: "#ffffff",
      radius: "0px", font: SERIF, display: SERIF, tracking: "-0.01em",
    },
  },
  terminal: {
    label: "终端暗色",
    description:
      "深色底 + 青绿强调 + 等宽字，硬核、技术感。适合开发者工具、命令行程序、基础设施、数据库、以及任何目标用户是工程师的项目。",
    tokens: {
      bg: "#0b0f14", surface: "#111820", text: "#e6edf3", muted: "#8b98a5",
      border: "#1f2a36", accent: "#2dd4a7", accentText: "#06120e", accentSoft: "#11241f",
      band: "#0f1a22", bandText: "#e6edf3", bandMuted: "#7d9aa8",
      heroFrom: "#0d141b", heroTo: "#0b0f14",
      radius: "6px", font: MONO, display: MONO, tracking: "-0.01em",
    },
  },
  coral: {
    label: "珊瑚橙",
    description:
      "明亮珊瑚橙 + 柔粉，活泼、年轻、有消费感。适合社交产品、电商、教育、健身、宠物、以及任何面向大众消费者、希望显得轻快好接近的业务。",
    tokens: {
      bg: "#ffffff", surface: "#fff7f5", text: "#2a1618", muted: "#7d5f60",
      border: "#f7ddd8", accent: "#e2553d", accentText: "#ffffff", accentSoft: "#ffeae5",
      band: "#43201c", bandText: "#fff7f5", bandMuted: "#d8a79c",
      heroFrom: "#ffeae5", heroTo: "#ffffff",
      radius: "20px", font: SANS, display: SANS, tracking: "-0.02em",
    },
  },
};

export type ThemeKey = keyof typeof THEMES;

export const THEME_CRITERIA = Object.fromEntries(
  Object.entries(THEMES).map(([key, theme]) => [key, theme.description]),
);

/** Inline CSS variables, so the registry never hardcodes a palette. */
export function themeVars(key: string): Record<string, string> {
  const theme = THEMES[key] ?? THEMES.forest!;
  const { tokens } = theme;
  return {
    "--bg": tokens.bg,
    "--surface": tokens.surface,
    "--text": tokens.text,
    "--muted": tokens.muted,
    "--border": tokens.border,
    "--accent": tokens.accent,
    "--accent-text": tokens.accentText,
    "--accent-soft": tokens.accentSoft,
    "--band": tokens.band,
    "--band-text": tokens.bandText,
    "--band-muted": tokens.bandMuted,
    "--hero-from": tokens.heroFrom,
    "--hero-to": tokens.heroTo,
    "--radius": tokens.radius,
    "--font": tokens.font,
    "--display": tokens.display,
    "--tracking": tokens.tracking,
  };
}
