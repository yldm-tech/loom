[English](../CONTRIBUTING.md) · **简体中文**

# 参与 loom

先跑一遍，确认环境是通的：

```bash
npm install
npm test                     # 70 个，约 3 秒，不碰网络
npm run dev                  # 演示模式，不需要 key
```

测试不需要任何 key，改纯逻辑的话连 `.env.local` 都不用配。

## 提 PR 之前

```bash
npx tsc --noEmit && npm test && npm run build
```

CI 跑的就是这三条。

## 加一个区块

四处，缺一处 TypeScript 会直接报错——`catalog.ts` 声明的组件，`registry.tsx` 必须全部实现。

1. `lib/catalog.ts` — 声明组件和它的 props（zod）
2. `lib/content.ts` — 在 `SiteContent` 加字段，在 `elementsFor()` 里把字段填进去
3. `lib/content-parallel.ts` — 在某个 chunk 的 prompt 里要求 LLM 产出这些字段，并在 `SLOT_NEEDS` 声明就绪条件
4. `app/registry.tsx` — 写组件本体，颜色和圆角**只能走 CSS 变量**，不要出现十六进制

然后在 `lib/plan.ts` 的 `SLOTS` 加槽位、在 `SLOT_ORDER` 里排位置、挂到合适原型的 `required` 或 `optional` 上。`lib/compose.ts` 的 `SKELETON_KIND` 里指一个骨架形状，`lib/edit.ts` 的 `SLOT_LABELS` 里给个中文名。

## 加一套主题

只改 `lib/themes.ts`。一套主题是一组完整 token：配色、字体、圆角、渐变。

`description` 字段是**给 jev 看的选择依据**，写「适合什么业务、什么气质」，不要写「这个颜色好看」。实测表明描述里有没有可判定的规则，直接决定置信度是 0.98 还是 0.63。

## 加一种界面语言

1. 复制 `locales/zh.json`，逐条翻译
2. 在 `lib/i18n.ts` 的 `UI_LOCALES`、`LOCALE_LABELS`、`DICTS` 各加一行
3. `detectLocale()` 里加一条前缀匹配

`zh.json` 是界面翻译的基准（注意：README 的基准是英文，这是两件独立的事）。测试会断言 key 完全一致、没有空串、例子条数相同，而且每种语言的例子真的用那种文字写。半拉翻译会让 CI 红，不会在运行时静默回落。

## 加一种站点文案语言

`lib/plan.ts` 的 `LANGUAGES`（给 jev 的判断依据）和 `lib/content-parallel.ts` 的 `LANGUAGE_RULE` / `LENGTH_RULE`（给 LLM 的写作指令）。字数约束是按中文写的，其它语言要附一条换算提示。

## 关于「该不该问模型」

这是这个项目唯一有主张的地方，改动时请按这条判断：

| 问题类型 | 交给谁 |
|---|---|
| 答案在用户那句话里 | **jev**，一个互斥 Choice |
| 系统里不存在，只能生成 | **LLM** |
| 从已有数据能推出来 | **代码**，一条规则 |

**置信度持续偏低不是模型的问题，是问错了对象。** 历史上有三次这样的改造，都在 README 里写着。

如果你发现某个判断的置信度长期在 0.3 以下，优先考虑「能不能换成一个事实问题加一条代码规则」，而不是改提示词。

## 关于 fixture

`fixtures/*.jsonl` 是**真实录制的运行**，不是手写的。靠编造输出撑场面的 demo 比没有 demo 更糟。要更新的话，配上真 key 跑一遍，把 `/api/generate` 的流存下来。

## 关于测试

新加的纯逻辑请配测试，并且**写完之后做一次变异验证**——手动改坏它测的那个东西，确认测试真的会红。第一次写就全过的测试不足以说明问题。

不要写需要网络的测试。所有现有测试加起来 2.5 秒，这条值得守住。

## 文档

README 有八份：`README.md`（英文，基准）和 `docs/README.{zh,ja,ko,es,fr,de,pt}.md`。

其中四份有自己语言的截图，其余回落到英文那套。测试会强制：有自己截图的必须用自己的，没有的统一用英文的，不许混搭。要给某种语言配自己的截图，就用那个界面语言录一次，补三张图。

测试还会检查八份的标题大纲逐级一致、引用的实测数字相同。小数点分隔符各语言不同，比对前会归一，所以 `0,16` 和 `0.16` 算同一个数。

改了实质内容请八份都改。如果你只会其中一两种语言，改你会的那几份并在 PR 里说明，剩下的可以后续补——**宁可有一份暂时落后，也不要机翻**。

## 行为准则

就事论事，对事不对人。技术分歧拿数据说话——这个项目里的每个结论都有可复现的测量支撑，你的也应该有。
