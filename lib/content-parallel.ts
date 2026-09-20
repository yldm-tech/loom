import type { SiteContent } from "./content";

/**
 * Content generation as independently awaitable pieces.
 *
 * One 2800-token call takes ~31s because the model writes every field serially.
 * Identity comes back first and is small, so the page can paint a nav and hero
 * within a few seconds; the three remaining chunks then run concurrently and
 * stream in as they land.
 */

/**
 * Any OpenAI-compatible chat completions endpoint works here: OpenAI itself,
 * OpenRouter, a gateway, or a local server. Only the copywriting layer uses it;
 * every judgement still goes to Jev.
 */
const MODEL = process.env.LLM_MODEL?.trim() || "claude-haiku-4-5";
const BASE_URL = (process.env.LLM_BASE_URL?.trim() || "https://api.everyapi.ai/v1").replace(/\/$/, "");
const ENDPOINT = `${BASE_URL}/chat/completions`;

const LANGUAGE_RULE: Record<string, string> = {
  zh: "全部用简体中文书写。",
  en: "Write every field in natural English. Do not use Chinese.",
  ja: "すべてのフィールドを自然な日本語で書いてください。中国語は使わないこと。",
  ko: "모든 필드를 자연스러운 한국어로 작성하세요. 중국어는 사용하지 마세요.",
  es: "Escribe todos los campos en español natural. No uses chino ni inglés.",
  fr: "Rédige tous les champs en français naturel. N'utilise ni chinois ni anglais.",
  de: "Schreibe alle Felder in natürlichem Deutsch. Verwende weder Chinesisch noch Englisch.",
  pt: "Escreva todos os campos em português natural. Não use chinês nem inglês.",
  "zh-Hant": "全部用繁體中文書寫，用詞遵循台灣用法。",
};

/** Field-length hints are written for Chinese; other languages need room. */
const LENGTH_RULE: Record<string, string> = {
  zh: "",
  en: "字数限制是按中文字数写的；写英文时按同等信息量换算，通常是字符数的两到三倍。",
  ja: "字数制限は中国語基準です。日本語では同等の情報量になるよう調整してください。",
  ko: "字数制限は中国語基準です。韓国語では同等の情報量になるよう調整してください。",
  es: "Los límites de longitud están pensados para el chino; en español ajusta a una cantidad de información equivalente.",
  fr: "Les limites de longueur sont pensées pour le chinois ; en français, visez une quantité d'information équivalente.",
  de: "Die Längenangaben sind für Chinesisch gedacht; im Deutschen auf gleichwertigen Informationsgehalt anpassen.",
  pt: "Os limites de tamanho foram escritos para o chinês; em português, ajuste para uma quantidade equivalente de informação.",
  "zh-Hant": "",
};

function base(language: string): string {
  const rule = LANGUAGE_RULE[language] ?? LANGUAGE_RULE.zh;
  const length = LENGTH_RULE[language] ?? "";
  return `你是网站文案撰写者。只输出一个 JSON 对象，不要围栏、不要解释。${rule}${length}文案要贴合用户描述的具体业务，不要通用模板。不要编造可验证的事实（真实获奖、媒体报道）。`;
}

async function call(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<{ parsed: Record<string, unknown>; outputTokens: number }> {
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    if (attempt > 1) {
      messages.push({
        role: "user",
        content: `上次输出有问题：${lastProblem}。只输出一个合法 JSON 对象，不要围栏不要解释。`,
      });
    }
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
      signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`LLM ${response.status}: ${await response.text()}`);
    const body = (await response.json()) as {
      choices?: { message: { content: string } }[];
      usage?: { completion_tokens?: number };
      error?: { message: string };
    };
    if (body.error) throw new Error(body.error.message);
    const raw = body.choices?.[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
      lastProblem = "没有找到 JSON";
      continue;
    }
    try {
      return {
        parsed: JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`两次都没拿到合法 JSON：${lastProblem}`);
}

export function generateIdentity(
  apiKey: string,
  description: string,
  signal: AbortSignal,
  language = "zh",
) {
  return call(
    apiKey,
    `${base(language)}
字段：{"brand":"品牌名 2-8 字","tagline":"一句话定位 10-18 字","heroTitle":"首屏主标题 8-16 字","heroSubtitle":"首屏副标题 30-50 字","heroBullets":["三条卖点，每条 10-18 字"],"primaryCta":"主按钮 2-6 字","secondaryCta":"次按钮 2-6 字","navLinks":["四个栏目名"],"footerColumns":["四个页脚栏目名"],"footerNote":"页脚一句说明","visualKind":"interface | product | scene | none"}

visualKind 说明这个业务首屏旁边能放什么图，按业务事实回答，不要考虑排版好不好看：
- interface：有软件界面、仪表盘、App 截图可以展示（SaaS、工具、App、开源库的终端输出）
- product：有实物产品照片（零售、硬件、食品、手作）
- scene：有场景或环境照片（餐饮门店、空间、活动、服务现场）
- none：没有任何具体视觉物（纯咨询、纯内容、个人主页）`,
    description,
    900,
    signal,
  );
}

const CHUNK_BODIES = {
  features: `
字段：{"featuresTitle":"功能区标题 6-12 字","features":[{"icon":"单字符符号如 ◈ ⌘ ✦ ⟡ ◐ ✎","title":"4-8 字","body":"20-35 字"}],"featuresDeep":[{"title":"6-12 字","body":"50-80 字"}]}

features 的条数按这个业务真实有多少个值得说的卖点来定，3 到 6 条之间，不要为了凑数编。
featuresDeep 是同一批卖点里最重要的 2 到 3 个，每条展开讲透。
如果这个业务的卖点少而深（比如只有两三件事但每件都需要解释），features 就给 3 条；如果卖点多而浅（比如功能清单），就给 5 到 6 条。`,
  commerce: `
字段：{"pricingTitle":"定价区标题","tiers":[{"name":"档位名","price":"¥数字","period":"每月/永久/每位/每份","features":["3-4 条"],"highlighted":布尔，恰好一档为 true}],"stats":[恰好 4 项 {"value":"数字带单位如 4.2万","label":"2-5 字"}],"logosCaption":"一句话说明下面这排标识是什么","logos":["四个平台或合作方名称"],"comparisonTitle":"对比区标题 6-12 字","comparisonUs":"我们这一列的表头，用品牌名或「我们」","comparisonThem":"对照那一列的表头，比如「传统做法」「其他家」","comparison":[恰好 4 项 {"label":"对比维度 3-6 字","us":"我们这边 8-16 字","them":"对照那边 8-16 字"}],"pricingCta":"价格卡上的按钮文案 2-6 字，比如「选这个」「开始使用」"}

tiers 的档数按这个业务真实有几种卖法来定，1 到 3 档：
- 只有一种价格或完全免费 → 1 档
- 分套餐、分规格、分订阅层级 → 2 到 3 档
不适合订阅制的业务（餐饮、零售、服务），tiers 就用套餐 / 规格 / 价位来表达。不要硬凑成三档。
comparison 写这个业务相对于替代方案的真实差异，对照方要写得公允，不要写成一无是处。`,
  place: `
字段：{"galleryTitle":"作品/环境展示区标题 6-12 字","galleryCaption":"一句话说明这些展示的是什么","gallery":[恰好 6 项 {"title":"4-10 字的作品或菜品或空间名","note":"10-20 字补充"}],"stepsTitle":"流程区标题 6-12 字","steps":[恰好 3 到 4 步 {"title":"步骤名 4-8 字","body":"25-45 字说明"}],"contactTitle":"联系方式区标题","address":"一个合理的示例地址","hours":"营业或服务时间","phone":"一个明显是示例的电话号码","contactNote":"一句补充说明，比如停车、预约方式","contactLabels":{"address":"「地址」这一栏的标签 2-4 字","hours":"「营业时间」这一栏的标签 2-4 字","phone":"「电话」这一栏的标签 2-4 字"},"teamTitle":"团队介绍标题 6-12 字","team":[恰好 3 位 {"name":"中文姓名","role":"职位 3-8 字","bio":"一句介绍 20-35 字"}]}

gallery 写这个业务真实会展示的东西：餐饮写菜品、摄影写作品系列、门店写空间。
steps 写顾客从了解到成交要经历的真实环节，不要写成通用的「咨询-下单-交付」。
address 和 phone 明显是示例数据，不要写成像真的。
team 写这个规模的生意真实会有的角色，个人工作室就写一两位加一句说明，不要编出一个大团队。`,
  social: `
字段：{"testimonialsTitle":"用户评价区标题 4-10 字","testimonials":[恰好 3 条 {"quote":"25-45 字真实感评价","name":"姓名","role":"3-6 字"}],"faqTitle":"常见问题区标题 4-10 字","faq":[恰好 4 条 {"q":"问题","a":"30-60 字"}],"ctaTitle":"底部转化标题 8-16 字","ctaBody":"20-35 字"}`,
} as const;

export type ChunkName = keyof typeof CHUNK_BODIES;

export function generateChunk(
  apiKey: string,
  chunk: ChunkName,
  context: string,
  signal: AbortSignal,
  language = "zh",
) {
  return call(apiKey, base(language) + CHUNK_BODIES[chunk], context, 1300, signal);
}

export function contextFrom(description: string, identity: Record<string, unknown>) {
  return `业务描述：${description}\n已确定的品牌名：${identity.brand}\n已确定的定位：${identity.tagline}\n后续文案必须与该品牌名和定位一致。`;
}

/** Which content fields each slot variant needs before it can be rendered. */
export const SLOT_NEEDS: Record<string, (keyof SiteContent)[]> = {
  nav_standard: ["brand", "navLinks", "primaryCta"],
  nav_centered: ["brand", "navLinks", "primaryCta"],
  nav_minimal: ["brand", "primaryCta"],
  nav_notice: ["brand", "navLinks", "primaryCta", "tagline"],
  hero_centered: ["heroTitle", "heroSubtitle", "tagline", "primaryCta", "secondaryCta"],
  hero_split: ["heroTitle", "heroSubtitle", "heroBullets", "primaryCta"],
  features_grid: ["featuresTitle", "features"],
  features_list: ["featuresTitle", "featuresDeep"],
  pricing_single: ["pricingTitle", "tiers", "pricingCta"],
  pricing_multi: ["pricingTitle", "tiers", "pricingCta"],
  testimonials: ["testimonials", "testimonialsTitle"],
  stats: ["stats"],
  logos: ["logos", "logosCaption"],
  faq: ["faq", "faqTitle"],
  gallery: ["galleryTitle", "gallery"],
  steps: ["stepsTitle", "steps"],
  contact: ["contactTitle", "address", "hours", "contactLabels"],
  comparison: ["comparisonTitle", "comparison"],
  team: ["teamTitle", "team"],
  cta_band: ["ctaTitle", "ctaBody", "primaryCta"],
  footer: ["brand", "footerColumns", "footerNote"],
};

export function isReady(id: string, content: Partial<SiteContent>) {
  const needs = SLOT_NEEDS[id];
  if (!needs) return false;
  return needs.every((field) => {
    const value = content[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });
}

/** Yields each promise's result in completion order rather than call order. */
export async function* asSettled<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const pending = new Map(promises.map((p, i) => [i, p.then((v) => [i, v] as const)]));
  while (pending.size > 0) {
    const [index, value] = await Promise.race(pending.values());
    pending.delete(index);
    yield value;
  }
}
