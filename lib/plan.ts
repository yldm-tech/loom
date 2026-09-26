/**
 * Layer 1 — planning. Which slots does this kind of page need at all?
 *
 * Expressed as page archetypes rather than per-section yes/no questions:
 * one Choice over mutually exclusive archetypes is the question shape jev is
 * reliable at, and it makes "a landing page always has a hero" structural
 * instead of something the model has to remember.
 */
export const ARCHETYPES = {
  landing: {
    label: "完整落地页",
    description:
      "面向新访客的营销落地页，目标是让人下载或注册。必须有首屏和转化区，通常还有功能介绍和社会证明。",
    required: ["nav", "hero", "features", "cta", "footer"],
    optional: ["social", "pricing", "faq", "gallery", "steps", "comparison", "team"],
  },
  minimal: {
    label: "极简单页",
    description:
      "只有一屏的页面，除了标题和一个行动按钮几乎没有别的内容。用户明确说极简、一屏、只要首屏时选它。",
    required: ["hero"],
    optional: ["nav", "footer"],
  },
  technical: {
    label: "工程向详情页",
    description:
      "面向开发者或资深用户，重点是把功能和原理讲清楚，不做转化施压。用户说面向工程师、讲深、不要花哨时选它。",
    required: ["nav", "hero", "features", "footer"],
    optional: ["faq", "social", "steps", "comparison"],
  },
  pricing: {
    label: "定价页",
    description:
      "专门讲钱的页面，主体是价格方案对比和常见问题。用户主要在问定价、套餐、多少钱时选它。",
    required: ["nav", "pricing", "faq", "cta", "footer"],
    optional: ["social", "hero", "comparison"],
  },
  local: {
    label: "线下门店页",
    description:
      "有实体门店或线下服务的生意，访客最终要到店或预约。必须能看到联系方式和营业信息，通常还想看环境、作品或菜品。咖啡馆、餐厅、诊所、理发店、工作室、民宿这类选它。",
    required: ["nav", "hero", "contact", "footer"],
    optional: ["gallery", "steps", "social", "faq", "pricing", "team"],
  },
  oss: {
    label: "开源项目主页",
    description:
      "开源软件的主页，强调免费、协议和不收费，不做商业转化。用户提到开源、免费、不联网、隐私时选它。",
    required: ["nav", "hero", "features", "footer"],
    optional: ["faq", "social", "pricing", "comparison"],
  },
} as const;

export type ArchetypeKey = keyof typeof ARCHETYPES;

/**
 * Which language the finished site should be written in.
 *
 * Not simply "whatever language the request was typed in": someone may describe
 * a business in Chinese and want an English site for overseas customers, and
 * the request usually says so. That makes it a judgement, not a detection, so
 * it rides along in the planning round as one more mutually exclusive Choice.
 */
export const LANGUAGES: Record<string, string> = {
  zh: "简体中文。用户用中文描述，且没有要求其它语言时选它。",
  en: "英文。用户用英文描述，或者明确说要做英文站、面向海外客户、要 English 版本时选它。",
  ja: "日文。用户用日文描述，或者明确说要面向日本市场时选它。",
  ko: "韩文。用户用韩文描述，或者明确说要面向韩国市场时选它。",
  es: "西班牙语。用户用西班牙语描述，或者明确说要面向西语市场时选它。",
  fr: "法语。用户用法语描述，或者明确说要面向法语市场时选它。",
  de: "德语。用户用德语描述，或者明确说要面向德语市场时选它。",
  pt: "葡萄牙语。用户用葡语描述，或者明确说要面向巴西、葡萄牙市场时选它。",
  "zh-Hant": "繁体中文。用户用繁体描述，或者提到台湾、香港市场时选它。",
};

export type Script = "han" | "kana" | "hangul" | "latin";

/**
 * Which writing system the request uses. Kana and Hangul are checked before Han
 * because Japanese mixes kanji in and Korean occasionally does.
 */
export function scriptOf(prompt: string): Script {
  if (/[\u3040-\u30ff]/.test(prompt)) return "kana";
  if (/[\uac00-\ud7af]/.test(prompt)) return "hangul";
  if (/[\u4e00-\u9fff]/.test(prompt)) return "han";
  return "latin";
}

/**
 * The language to write the site in, before any explicit request to the
 * contrary. This is deliberately not a judgement: asking a model which language
 * a piece of text is written in blends two questions — what script is this, and
 * did the author ask for something else — and the blended question answered
 * English prompts with `zh` at 0.76 confidence. Script is decidable here.
 *
 * Latin script cannot be narrowed further by looking at the text, so the
 * editor's own locale decides; it is the only evidence either layer has.
 * Simplified versus traditional is a real judgement and stays with Jev.
 */
export function defaultLanguage(prompt: string, locale?: string): string {
  const script = scriptOf(prompt);
  if (script === "kana") return "ja";
  if (script === "hangul") return "ko";
  if (script === "han") return "zh";
  const tag = locale?.toLowerCase().split("-")[0];
  return tag && tag !== "zh" && tag !== "ja" && tag !== "ko" && tag in LANGUAGES ? tag : "en";
}

/**
 * Layer 2 — selection. Each slot is a closed set of mutually exclusive variants,
 * so exactly one wins and probability cannot leak across slots.
 */
export const SLOTS = {
  nav: {
    question: "这个页面的顶部导航条",
    variants: {
      nav_standard:
        "标准导航条：左边品牌名，中间几个栏目链接，右边一个行动按钮。信息最全，适合内容多、需要导航的正式官网。",
      nav_centered:
        "居中导航条：品牌名单独居中占一行，栏目链接排在它下面。仪式感强、留白多，适合品牌向或作品集类页面。",
      nav_minimal:
        "极简导航条：只有品牌名和一个按钮，不放任何栏目链接。适合单页、落地页，或者内容少到不需要导航的页面。",
      nav_notice:
        "带公告条的导航：标准导航上方多一条通栏公告，用来放促销、公告或一句定位。适合有活动、有时效信息要强调的页面。",
    },
  },
  hero: {
    question: "这个页面的首屏",
    auto: true,
    variants: {
      hero_centered:
        "居中式首屏：大标题居中，一句副标题，两个按钮，不放图。冲击力强，信息量小。",
      hero_split:
        "左右分栏首屏：左边标题加三条要点，右边放产品截图。信息密度高，需要有界面可展示。",
    },
  },
  // `auto` means code picks this on the first build (from the generated
  // content), so jev is not asked. An explicit user request still overrides it:
  // a default rule is a default, not a lock.
  features: {
    question: "这个页面的功能介绍区",
    auto: true,
    variants: {
      features_grid: "三列网格，每格一个图标加一句话。适合卖点多、读者只想快速扫一遍。",
      features_list: "纵向列表，每项一整段展开讲。适合卖点少但需要讲透原理。",
    },
  },
  pricing: {
    question: "这个页面的价格区",
    auto: true,
    variants: {
      pricing_single: "单档价格卡，居中一张。适合只有一种卖法或完全免费。",
      pricing_multi: "多档对比，并排三张，中间一档高亮。适合有套餐分层需要对比。",
    },
  },
  social: {
    question: "这个页面用哪种社会证明",
    variants: {
      testimonials: "三条用户评价，带姓名和职位。最有说服力，也最占篇幅。",
      stats: "一条数据带：下载量、词库条目数等硬指标。简短有力，适合强调规模。",
      logos: "一排平台标识。最轻量，只说明「在哪能装到」，说服力最弱。",
    },
  },
  gallery: {
    question: "这个页面的作品 / 环境展示区",
    variants: {
      gallery: "六宫格展示，每格一个作品、菜品或空间，配一句说明。适合有东西可看的生意。",
    },
  },
  steps: {
    question: "这个页面的流程说明区",
    variants: {
      steps: "编号流程，三到四步，说明顾客从了解到成交要经历什么。适合服务和定制类生意。",
    },
  },
  contact: {
    question: "这个页面的联系与到店信息",
    variants: {
      contact: "地址、营业时间、电话，外加一句补充说明。线下生意必备。",
    },
  },
  comparison: {
    question: "这个页面的对比区",
    variants: {
      comparison: "两列对比表，四个维度，说明这家和替代方案的差别。适合需要说服访客换掉现有方案的生意。",
    },
  },
  team: {
    question: "这个页面的团队介绍",
    variants: {
      team: "三人一排，姓名、职位、一句介绍。适合服务业、工作室、咨询这类「人就是产品」的生意。",
    },
  },
  faq: {
    question: "这个页面的常见问题区",
    variants: { faq: "四组问答，覆盖系统要求、收费、隐私、词库导入" },
  },
  cta: {
    question: "这个页面底部的转化区",
    variants: { cta_band: "深色背景的转化条，一句号召加一个大按钮" },
  },
  footer: {
    question: "这个页面的页脚",
    variants: { footer: "标准页脚：品牌名、几列链接、协议说明" },
  },
} as const;

export type SlotKey = keyof typeof SLOTS;

/** Rendering order is a layout decision code owns, not something to ask about. */
export const SLOT_ORDER: SlotKey[] = [
  "nav",
  "hero",
  "social",
  "features",
  "gallery",
  "comparison",
  "steps",
  "team",
  "pricing",
  "contact",
  "faq",
  "cta",
  "footer",
];

/**
 * Layout rules code owns. These follow from the content itself, so asking the
 * model would only add a round trip and a low-confidence answer.
 *
 * The counts are taken with `Array.isArray` rather than by reading `.length`, and the parameter says `unknown` rather than `unknown[]` so that nothing else can be written. The fields arrive from `JSON.parse` of a model's reply, where the declared type is a hope rather than a fact: `"tiers": "免费"` is two characters long, and reading `.length` off it elected the multi-tier comparison layout for a business with no tiers at all — a rule that exists to count things silently counting the wrong thing. A field that is not an array is not an answer to "how many", so it counts as none and the rule does not fire.
 */
export function layoutRules(content: {
  features?: unknown;
  featuresDeep?: unknown;
  tiers?: unknown;
  visualKind?: unknown;
}): { slot: SlotKey; id: string; because: string }[] {
  const rules: { slot: SlotKey; id: string; because: string }[] = [];

  // The split hero exists to hold a screenshot. Without one its right column is
  // an empty box, so the business's visual kind decides this, not taste.
  if (typeof content.visualKind === "string" && content.visualKind !== "") {
    const split = content.visualKind === "interface";
    rules.push({
      slot: "hero",
      id: split ? "hero_split" : "hero_centered",
      because: `visualKind=${content.visualKind} → ${split ? "分栏（右侧放界面截图）" : "居中（没有界面可放）"}`,
    });
  }

  const featureCount = Array.isArray(content.features) ? content.features.length : 0;
  if (featureCount > 0) {
    const grid = featureCount >= 5;
    rules.push({
      slot: "features",
      id: grid ? "features_grid" : "features_list",
      because: `${featureCount} 条卖点 → ${grid ? "网格（>=5 条扫读）" : "列表（<5 条讲透）"}`,
    });
  }

  const tierCount = Array.isArray(content.tiers) ? content.tiers.length : 0;
  if (tierCount > 0) {
    const multi = tierCount >= 2;
    rules.push({
      slot: "pricing",
      id: multi ? "pricing_multi" : "pricing_single",
      because: `${tierCount} 档价格 → ${multi ? "多档对比" : "单档"}`,
    });
  }
  return rules;
}
