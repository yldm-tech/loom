# loom

> 把三股线织成一块布：LLM 写的文案、Jev 做的判断、代码定的规则。

一句话描述你的生意，得到一个能用的落地页。

```
「我在杭州开了家咖啡店，主打手冲单品豆」

0.7s   整页骨架（区块、顺序、配色全部就位）
4.5s   首屏和页脚填入真实文案
13s    全部区块落地
```

区别不在于「又一个 AI 建站」，而在于**三层各司其职**，每一层只做自己擅长的事。

## 为什么要分三层

生成式模型什么都能写，但你没法保证它写出来的结构合法。约束式模型永远合法，但它一个字都造不出来。把两者混着用，或者只用其中一个，都会在某个地方塌掉。

这个项目把决策按**信息来源**切开：

| 层 | 负责 | 因为 |
|---|---|---|
| **LLM** | 文案 + 业务事实（几条卖点、几档价格、有没有界面截图） | 这些系统里不存在，只能生成 |
| **[Jev](https://typesafe.ai)** | 页面原型、视觉主题、要不要某个区块、哪种社会证明 | 答案在用户那句话里，是判断 |
| **代码** | 排版规则、区块顺序、必需区块、就绪度门控 | 这些是规则，不该问模型 |

判据很简单：**置信度持续偏低，说明问错了对象**——要么输入里没有答案，要么这件事根本不需要判断。

开发过程中这条规律出现了三次，每次都靠「把问题换成一个事实问题 + 一条代码规则」解决：

```
问 jev「功能区用网格还是列表」   → 0.16  ← 用户那句话里没有答案
改成 LLM 报告「有几条卖点」     → 代码：>= 5 条用网格          确定性

问 jev「首屏用居中还是分栏」     → 0.28  ← 同上
改成 LLM 报告「有没有界面截图」  → 代码：有截图才用分栏        确定性

问 jev「用哪套视觉主题」         → 0.99  ← 「活泼」「金融客户」就在那句话里
保留                                                      判断
```

## Jev 实测表现

| 判断 | 置信度 |
|---|---|
| 视觉主题（6 选 1） | 0.98 – 1.00 |
| 页面原型（6 选 1） | 0.62 – 1.00 |
| 修改意图（6 选 1） | 0.98 – 1.00 |
| 哪种社会证明（3 选 1） | 0.70 – 0.97 |

```
咖啡店   → 线下门店页@1.00  warm@0.99   → Nav HeroCentered Testimonials Gallery Pricing Contact FAQ Footer
摄影师   → 线下门店页@0.62  ink@1.00    → Nav HeroCentered Testimonials Gallery Pricing Contact Footer
合规SaaS → 完整落地页@1.00  corporate@1 → Nav HeroSplit Testimonials FeatureGrid Steps Pricing FAQ CTABand Footer
```

全部是**互斥单选**——概率必须和为 1，干扰项要赢就得抢走概率质量。换成「每个候选一个独立 yes/no」，40 个选项时就会有约 5% 的假阳性混进结果。这个差别是结构性的，不是调提示词能解决的。

jev 全程约 3 次调用、不到 1 秒、$0.001 量级。**瓶颈始终是 LLM 写文案**。

## 跑起来

```bash
git clone https://github.com/yldm-tech/loom
cd loom
npm install
cp .env.example .env.local   # 填 JEV_TOKEN 和 LLM_TOKEN
npm run dev
```

`JEV_TOKEN` 从 [typesafe.ai](https://typesafe.ai) 拿。`LLM_TOKEN` 可以是任何 OpenAI 兼容端点——OpenAI、OpenRouter、网关、本地 llama.cpp 都行，改 `LLM_BASE_URL` 和 `LLM_MODEL` 即可。

## 能改什么

生成完之后直接用大白话改，每次一个请求、200–400ms、**不重新生成任何文案**：

| 你说 | 结果 |
|---|---|
| 不要定价了 | `remove` → pricing `1.00` |
| 换个更活泼的配色 | `theme` → coral `1.00` |
| 导航条居中 | `restyle` → nav_centered `1.00` |
| 换个nav样式 | `restyle` → 任取一个不同的（`0.34`，三个都行） |
| 功能区改成列表 | `restyle` → features_list `1.00` |
| 帮我部署上线 | `unclear` `1.00` |

最后一条是重点：**做不到的事就说做不到**，不硬凑成某个修改。

这里用的是[投机扇出](https://docs.typesafe.ai/patterns/fan-out.md)——「删哪个」「加哪个」「换哪个主题」「哪个区块换版式」全部在同一个请求里问，代码只读赢的那个分支。多花 token，省掉往返。

### 同一个 0.34，有时要拦有时不用

```
换个nav样式   → restyle@1.00  variant=nav_centered@0.34   执行（任取）
换个导航栏样式 → theme@0.87    theme_target=coral@0.15     拦截
```

「换一个」本来就不指定换成哪个，排除当前变体后三个都可以，概率均分是**正确答案**。而「换个导航栏样式」被误判成换整站配色时，0.15 说明它压根不知道换成什么——那个必须拦。

**阈值不是全局常数，取决于选错的代价。**

## 导出

「导出 HTML」出的是一个自包含文件：渲染结果 + 它**真正用到的那些 CSS 规则**。

```
页面全部 CSS   22 KB      ← 生产构建下 Tailwind 已经 tree-shake 过
实际导出       29 KB      ← 含 HTML
编辑器自身样式  已剔除      ← 输入框、按钮、决策日志一条不带
```

过滤靠 `root.matches()` / `root.querySelector()` 逐条试选择器，伪类剥掉后用基础选择器试，`@media` 递归处理且内部为空则整条丢，`:root` 和 `@font-face` 无条件保留，**解析不了的选择器保留而不是丢弃**——文件大一点好过悄悄坏掉。

体积上只省 16%（Tailwind 本来就不大），真正的收获是导出的网站里不再混进编辑器自己的样式。实现见 `lib/export.ts`，**没有第二套渲染器**，区块布局只有 `app/registry.tsx` 一份。

## 主题即数据

6 套主题，每套是一组完整的设计 token。`app/registry.tsx` 里**没有任何十六进制色值**，全部走 CSS 变量：

| 主题 | 特征 | 适合 |
|---|---|---|
| `forest` | 墨绿 + 米白 | 工具、开源、户外 |
| `corporate` | 藏蓝 + 6px 小圆角 | 金融、法务、企业 |
| `warm` | 焦糖棕 + 衬线字 + 16px 圆角 | 餐饮、手作、民宿 |
| `ink` | 纯黑白 + 零圆角 + 大留白 | 摄影、作品集、出版 |
| `terminal` | 深色底 + 等宽字 + 青绿 | 开发者工具、基础设施 |
| `coral` | 明亮橙 + 20px 大圆角 | 消费、教育、社交 |

所以换主题是纯客户端的一个 prop 改动：不调模型、不动文案、瞬间完成。内容、结构、外观三者彻底解耦。

## 11 个区块，6 种页面原型

区块：导航（4 个变体）、首屏（2）、社会证明（3）、功能区（2）、作品展示、流程、价格（2）、联系信息、常见问题、转化条、页脚。

原型决定哪些区块是**必需**的——模型无权删掉落地页的首屏，也无权删掉门店页的联系方式：

| 原型 | 必需 | 可选 |
|---|---|---|
| 完整落地页 | nav hero features cta footer | social pricing faq gallery steps |
| 线下门店页 | nav hero **contact** footer | gallery steps social faq pricing |
| 工程向详情页 | nav hero features footer | faq social steps |
| 定价页 | nav pricing faq cta footer | social hero |
| 开源项目主页 | nav hero features footer | faq social pricing |
| 极简单页 | hero | nav footer |

## 结构

```
lib/
  catalog.ts           组件契约：允许出现的区块和它们的 props
  themes.ts            6 套设计 token + 给 jev 的选择依据
  plan.ts              页面原型、槽位变体、代码规则 layoutRules()
  content.ts           文案的形状 + 把文案填进区块
  content-parallel.ts  四块并行生成 + 重试 + 形状校验 + 就绪度
  compose.ts           三层编排，流式吐出
  edit.ts              修改意图识别（投机扇出）
  export.ts            自包含 HTML 导出，只带用到的 CSS
app/
  page.tsx             界面、流式消费、客户端改主题和版式
  registry.tsx         区块长什么样，全部读 CSS 变量
  api/generate         生成
  api/edit             改
```

## 已知边界

- **LLM 会吐非法 JSON。** 实测两次里错过一次。已有重试和形状校验兜底，但这是生成式模型的固有属性——jev 那一侧从头到尾没出过一次格式错误。
- **13 秒不算快**，而且全在 LLM 写文案上。骨架屏让首屏 0.7 秒可见，但总时长没变。
- **区块类型 11 种**，还缺团队介绍、对比表、联系表单。`Gallery` 只出占位色块加文字说明，不生成图片。
- **导出的是渲染结果，不是源码。** 一个 29 KB 的自包含 HTML，双击就开，但不是可维护的 React 工程。真要接着开发还得自己写代码导出器。
- **文案质量取决于模型。** 换更强的模型会明显变好，也会明显变慢。

## 许可

Apache-2.0。基于 [json-render](https://github.com/vercel-labs/json-render)（Vercel Labs，Apache-2.0）的已发布 npm 包，未内嵌其源码。判断由 [TypeSafe](https://typesafe.ai) 的 Jev 模型提供。详见 `NOTICE`。
