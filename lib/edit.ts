import { SLOTS, type SlotKey } from "@/lib/plan";
import { THEME_CRITERIA } from "@/lib/themes";

type Answer = { choice: string; confidence?: number; noul?: number };

const ACTIONS: Record<string, string> = {
  remove:
    "把页面上某个已有的区块整个去掉，比如「不要定价了」「删掉评价」「去掉常见问题」。注意是删掉整块，不是改它。",
  add: "在页面上加一个现在没有的区块，比如「加个 FAQ」「补一段用户评价」。",
  theme:
    "换掉**整站**的视觉风格——配色、字体、圆角全部一起变，比如「换个更活泼的配色」「太花了，素一点」「弄成深色的」「看着太严肃了」。只有当用户说的是整个页面的观感时才算，针对某一个区块的样式调整不属于这一类。",
  restyle:
    "换掉**某一个区块自己**的版式，其它区块和整站配色都不动，比如「换个导航栏样式」「nav 换一个」「首屏换个版式」「功能区改成列表」「导航条居中」。只针对单个区块时选它。",
  rewrite: "重写文案，结构和外观都不变，比如「标题再有力一点」「文案太正式了」。",
  unclear:
    "这句话这套系统做不到，或者指向不明。包括：要求部署或上线、要求加系统里没有的区块类型、要求改具体的颜色值或字号、以及任何看不出想干什么的话。",
};

const SLOT_LABELS: Record<SlotKey, string> = {
  nav: "顶部导航条",
  hero: "首屏",
  social: "社会证明区（用户评价 / 数据 / 平台标识）",
  features: "功能介绍区",
  pricing: "价格区",
  faq: "常见问题区",
  cta: "底部转化区",
  footer: "页脚",
};

/**
 * Speculative fan-out: every branch's question goes out in one request, and code
 * reads only the answers the chosen action actually needs. The unused branches
 * cost tokens but no extra round trip, which is the whole point of the pattern.
 */
export async function editPlan(
  apiKey: string,
  request: string,
  present: SlotKey[],
  currentTheme: string,
  signal: AbortSignal,
  currentVariants: Partial<Record<SlotKey, string>> = {},
) {
  const absent = (Object.keys(SLOTS) as SlotKey[]).filter(
    (slot) => !present.includes(slot),
  );

  const questions: Record<string, unknown> = {
    action: {
      type: "choice",
      instructions: { role: "判断用户这次要做哪一种修改", request },
      criteria: ACTIONS,
    },
  };

  if (present.length > 0) {
    questions.remove_target = {
      type: "choice",
      instructions: {
        role: "假设用户要删掉一个区块，判断是哪一个",
        request,
        note: "只在用户确实要删东西时才会用到这个答案",
      },
      criteria: Object.fromEntries(present.map((slot) => [slot, SLOT_LABELS[slot]])),
    };
  }
  if (absent.length > 0) {
    questions.add_target = {
      type: "choice",
      instructions: {
        role: "假设用户要加一个区块，判断是哪一个",
        request,
        note: "只在用户确实要加东西时才会用到这个答案",
      },
      criteria: Object.fromEntries(absent.map((slot) => [slot, SLOT_LABELS[slot]])),
    };
  }
  const restylable = present.filter(
    (slot) => Object.keys(SLOTS[slot].variants).length > 1,
  );
  if (restylable.length > 0) {
    questions.restyle_target = {
      type: "choice",
      instructions: {
        role: "假设用户要换某个区块的版式，判断是哪个区块",
        request,
        note: "只在用户确实针对单个区块时才会用到这个答案",
      },
      criteria: Object.fromEntries(
        restylable.map((slot) => [slot, SLOT_LABELS[slot]]),
      ),
    };
    for (const slot of restylable) {
      // "换一个" cannot mean the one already on screen, so the current variant
      // is removed from the option set rather than left for the model to avoid.
      const all = SLOTS[slot].variants as Record<string, string>;
      const current = currentVariants[slot];
      const options = Object.fromEntries(
        Object.entries(all).filter(([id]) => id !== current),
      );
      if (Object.keys(options).length === 0) continue;
      questions[`variant_${slot}`] = {
        type: "choice",
        instructions: {
          role: `假设用户要换${SLOT_LABELS[slot]}的版式，判断换成哪一种`,
          request,
          ...(current ? { current: `现在用的是 ${current}，已从候选中排除` } : {}),
          note: "只在这个区块确实是目标时才会用到这个答案",
        },
        criteria: options,
      };
    }
  }

  questions.theme_target = {
    type: "choice",
    instructions: {
      role: "假设用户要换视觉风格，判断换成哪一套",
      request,
      current: `当前是 ${currentTheme}`,
      note: "只在用户确实要改外观时才会用到这个答案",
    },
    criteria: THEME_CRITERIA,
  };

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: { present, currentTheme },
      model: "jev-latest",
      questions,
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`TypeSafe ${response.status}: ${await response.text()}`);

  const body = (await response.json()) as {
    answers: Record<string, Answer>;
    usage?: { input_tokens?: number };
  };
  const answers = body.answers;
  const action = answers.action?.choice ?? "unclear";
  const TARGET_FLOOR = 0.5;

  // Only the branch that won gets read; the rest are discarded unexamined.
  const result: {
    action: string;
    confidence: number | null;
    slot?: SlotKey;
    theme?: string;
    variant?: string;
    arbitrary?: boolean;
    targetConfidence?: number | null;
    inputTokens: number;
    blockedBy?: string;
    speculative: Record<string, string>;
  } = {
    action,
    confidence: answers.action?.confidence ?? null,
    inputTokens: body.usage?.input_tokens ?? 0,
    speculative: Object.fromEntries(
      Object.entries(answers)
        .filter(([key]) => key !== "action")
        .map(([key, a]) => [
          key,
          `${a.choice}@${(a.confidence ?? 0).toFixed(2)}`,
        ]),
    ),
  };

  // An action is only worth executing when the branch that won also knows what
  // to act on. Jev reports that separately, and a confident action paired with
  // an unsure target means the request did not actually name one.
  const targetOf = (key: string) => ({
    choice: answers[key]?.choice,
    confidence: answers[key]?.confidence ?? null,
  });

  let target: { choice?: string; confidence: number | null } | null = null;
  if (action === "remove") target = targetOf("remove_target");
  else if (action === "add") target = targetOf("add_target");
  else if (action === "theme") target = targetOf("theme_target");
  else if (action === "restyle") {
    const slotPick = targetOf("restyle_target");
    if (!slotPick.choice || (slotPick.confidence ?? 0) < 0.5) {
      result.action = "unclear";
      result.targetConfidence = slotPick.confidence;
      result.blockedBy = `restyle 没认出改哪个区块（${(slotPick.confidence ?? 0).toFixed(2)}）`;
      return result;
    }
    result.slot = slotPick.choice as SlotKey;
    const slot = slotPick.choice as SlotKey;
    const variantPick = targetOf(`variant_${slot}`);
    result.targetConfidence = variantPick.confidence;

    // "换一个" names no destination, so probability spreads evenly over the
    // remaining variants. That is not a failed judgement — every option is
    // acceptable — so code picks one instead of refusing.
    if ((variantPick.confidence ?? 0) < TARGET_FLOOR) {
      const current = currentVariants[slot];
      const options = Object.keys(SLOTS[slot].variants).filter((id) => id !== current);
      result.variant = variantPick.choice ?? options[0];
      result.arbitrary = true;
      result.blockedBy = `没指定换成哪个（${(variantPick.confidence ?? 0).toFixed(2)}），按目录顺序取了一个`;
    } else {
      result.variant = variantPick.choice;
    }
    return result;
  }

  if (target) {
    result.targetConfidence = target.confidence;
    if (!target.choice || (target.confidence ?? 0) < TARGET_FLOOR) {
      result.action = "unclear";
      result.blockedBy = `${action} 的目标只有 ${(target.confidence ?? 0).toFixed(2)} 置信度，没有执行`;
      return result;
    }
    if (action === "theme") result.theme = target.choice;
    else if (action === "restyle") result.variant = target.choice;
    else result.slot = target.choice as SlotKey;
  }
  return result;
}
