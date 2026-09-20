[English](../CONTRIBUTING.md) · **简体中文**

# 参与 loom

先跑一遍，确认环境是通的：

```bash
npm install
npm test                     # 347 个，约 1.5 秒，不碰网络
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

对比度没有商量余地：`npm test` 会从你写的 token 值重算 WCAG 比值，承载正文的配色低于 4.5:1 直接红。之后 `npm run audit:a11y` 再查浏览器实际渲染出来的结果。一套按钮看不清的主题是生成器的缺陷，不是审美问题。

`description` 字段是**给 jev 看的选择依据**，写「适合什么业务、什么气质」，不要写「这个颜色好看」。实测表明描述里有没有可判定的规则，直接决定置信度是 0.98 还是 0.63。

## 加一种界面语言

1. 复制 `locales/zh.json`，逐条翻译
2. 在 `lib/i18n.ts` 的 `UI_LOCALES`、`LOCALE_LABELS`、`DICTS` 各加一行
3. `detectLocale()` 里加一条前缀匹配

`zh.json` 是界面翻译的基准（注意：README 的基准是英文，这是两件独立的事）。测试会断言 key 完全一致、没有空串、例子条数相同，而且每种语言的例子真的用那种文字写。半拉翻译会让 CI 红，不会在运行时静默回落。

## 加一种站点文案语言

`lib/plan.ts` 的 `LANGUAGES`（给 jev 的判断依据）和 `lib/content-parallel.ts` 的 `LANGUAGE_RULE` / `LENGTH_RULE`（给 LLM 的写作指令）。字数约束是按中文写的，其它语言要附一条换算提示。

## 加一个组件源

只动 `lib/sources.ts`。一个源就是一行：名字、网址、role、一句陈述事实的介绍、授权、Agent 应该执行的那条安装命令（只能靠浏览器拿到代码的写 `null`）、实测答得出来的机器可读端点、它能改进哪些槽位，以及不读就会踩的那条 caveat。

先抓再写。那张表里每个网址、端点和命令都是抓下来核对过的，不是回忆的——大部分 caveat 正是核对过程中冒出来的：beui.dev 的 `/r/index.json` 是 404，ui.shadcn.com 的 `/registry.json` 也是 404，Beautiful UI 干脆没有任何机器可读接口。`npm run sources` 会把这些检查重跑一遍，有端点不答就非零退出；它要联网，所以永远是 script，不会变成测试。

`role` 比 `blocks` 重要。这五个源没有一个提供营销页区块，所以一个源是改进 loom 已经渲染的 block，而不是替换它；`summary` 要是写得像区块目录，Agent 就会去找一个根本不存在的 hero。授权顺手一起查：五个里有一个禁止再分发其集合的实质部分，用它做站没问题，vendor 进本仓库就不行。

## 加一个 MCP 工具

只动 `lib/mcp.ts`。`scripts/mcp.mjs` 是 stdio 管道，通常不需要碰。一个工具就是 `TOOLS` 里的一项：名字、标题、一段写给「正在决定要不要调用它的模型」看的描述、参数的 JSON Schema，以及返回 `ok(payload)` 或 `badArgument(message)` 的 `run`。

答案要在调用到达时现从 `lib/plan.ts`、`lib/themes.ts`、`lib/catalog.ts` 或 `lib/sources.ts` 里读。工具自己存一份区块列表的话，列表变了它还会照样自信地答，而另一头的 Agent 没有任何办法察觉。有一条测试会把服务端声明的每个工具都真调一遍，所以光加名字不加 handler 会在那里红，而不是在 Agent 面前红。

没查到就说没查到。不认识的参数返回空结果加一句解释，绝不猜；兜底要标成兜底——`themeVars()` 对不认识的主题会返回 `forest`，把这组值不加说明递给 Agent，它会以为自己拿到的是 `terminal`，然后贴进去一个绿色按钮。JSON-RPC 的帧处理就写在同一个文件里，并且要保持这样：这一整套没有加任何依赖，以后也不要加。

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

`fixtures/*.jsonl` 是**真实录制的运行**，不是手写的。靠编造输出撑场面的 demo 比没有 demo 更糟。

配上真 key 起服务，跑 `npm run record`（只录一部分就 `npm run record -- fr de`）。prompt 写在 `scripts/record-fixture.mjs` 里，录制因此是可复现的，而不是某个人手动做过一次。脚本会拒绝写入这几种结果：跑失败的、语言和要求的不一致的、文案跑到别的文字系统去的——正是因为以前没有这道检查，德语和法语的 fixture 里带着中文在仓库里躺了一阵子。

## 关于测试

新加的纯逻辑请配测试，并且**写完之后做一次变异验证**——手动改坏它测的那个东西，确认测试真的会红。第一次写就全过的测试不足以说明问题。

不要写需要网络的测试。所有现有测试加起来 1.5 秒，这条值得守住。

## 文档

README 有八份：`README.md`（英文，基准）和 `docs/README.{zh,ja,ko,es,fr,de,pt}.md`。

八份都有自己语言的截图。测试会强制：有自己截图的必须用自己的，没有的统一用英文的，不许混搭——所以新语言可以先用英文那套，之后再补自己的。

要重拍：先录好 fixture，再在 3300 端口起一个**演示模式**（不带 key）的服务，跑 `npm run capture`。需要 PATH 上有 `magick`、`cwebp`、`webpmux`；不能用 ffmpeg，macOS 上分发的那个构建能解 WebP 但不能编。

文件名带代次——`themes-ko-2.jpg`。GitHub 按 URL 缓存 README 图片，同名重拍可能还一直给读者旧图。改 `scripts/capture-docs.mjs` 里的 `GEN`，重跑，再把八份 README 的 `<img src>` 一起改；有测试保证八份停在同一代，不会有人看到和别人不一样的那次运行。

测试还会检查八份的标题大纲逐级一致、引用的实测数字相同。小数点分隔符各语言不同，比对前会归一，所以 `0,16` 和 `0.16` 算同一个数。

改了实质内容请八份都改。如果你只会其中一两种语言，改你会的那几份并在 PR 里说明，剩下的可以后续补——**宁可有一份暂时落后，也不要机翻**。

## 行为准则

就事论事，对事不对人。技术分歧拿数据说话——这个项目里的每个结论都有可复现的测量支撑，你的也应该有。
