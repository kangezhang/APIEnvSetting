import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Code2,
  DollarSign,
  Gauge,
  Search,
  Timer,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

type RankedModel = {
  model: string;
  provider: string;
  intelligence: number;
  coding: number;
  inputUsd: number;
  outputUsd: number;
  inputCny: number;
  outputCny: number;
  speed: number;
  ttft: number;
  firstAnswer: number;
  releaseDate: string;
  slug: string;
};

const dataSnapshotDate = "2026-07-24";
const dataSourceUrl =
  "https://llmrank.oss-rg-china-mainland.aliyuncs.com/data/2026-07-24/models.json";

const rankedModels: RankedModel[] = [
  { model: "GPT-5.6 Sol (xhigh)", provider: "OpenAI", intelligence: 57.7, coding: 78.3, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 60.485, ttft: 38.088, firstAnswer: 38.088, releaseDate: "2026-07-09", slug: "gpt-5-6-sol-xhigh" },
  { model: "GPT-5.6 Sol (max)", provider: "OpenAI", intelligence: 58.9, coding: 77.4, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 63.716, ttft: 87.94, firstAnswer: 87.94, releaseDate: "2026-07-09", slug: "gpt-5-6-sol" },
  { model: "GPT-5.6 Sol (high)", provider: "OpenAI", intelligence: 55.9, coding: 77.2, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 56.058, ttft: 13.522, firstAnswer: 13.522, releaseDate: "2026-07-09", slug: "gpt-5-6-sol-high" },
  { model: "GPT-5.6 Terra (max)", provider: "OpenAI", intelligence: 55, coding: 76.7, inputUsd: 2.5, outputUsd: 15, inputCny: 18, outputCny: 108, speed: 134.382, ttft: 100.446, firstAnswer: 100.446, releaseDate: "2026-07-09", slug: "gpt-5-6-terra" },
  { model: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)", provider: "Anthropic", intelligence: 59.9, coding: 76.5, inputUsd: 10, outputUsd: 50, inputCny: 72, outputCny: 360, speed: 69.473, ttft: 59.379, firstAnswer: 59.379, releaseDate: "2026-06-09", slug: "claude-fable-5" },
  { model: "GPT-5.6 Sol (medium)", provider: "OpenAI", intelligence: 53.6, coding: 76.3, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 55.469, ttft: 4.882, firstAnswer: 4.882, releaseDate: "2026-07-09", slug: "gpt-5-6-sol-medium" },
  { model: "Kimi K3", provider: "Kimi", intelligence: 57.1, coding: 76.2, inputUsd: 3, outputUsd: 15, inputCny: 21.6, outputCny: 108, speed: 36.9, ttft: 5.786, firstAnswer: 59.986, releaseDate: "2026-07-16", slug: "kimi-k3" },
  { model: "GPT-5.5 (xhigh)", provider: "OpenAI", intelligence: 54.8, coding: 74.9, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 92.625, ttft: 40.648, firstAnswer: 40.648, releaseDate: "2026-04-23", slug: "gpt-5-5" },
  { model: "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)", provider: "Anthropic", intelligence: 55.7, coding: 74.3, inputUsd: 5, outputUsd: 25, inputCny: 36, outputCny: 180, speed: 64.041, ttft: 39.258, firstAnswer: 39.258, releaseDate: "2026-05-28", slug: "claude-opus-4-8" },
  { model: "Claude Opus 4.7 (Adaptive Reasoning, Max Effort)", provider: "Anthropic", intelligence: 53.5, coding: 73.6, inputUsd: 5, outputUsd: 25, inputCny: 36, outputCny: 180, speed: 61.279, ttft: 16.853, firstAnswer: 16.853, releaseDate: "2026-04-16", slug: "claude-opus-4-7" },
  { model: "Grok 4.5 (high)", provider: "SpaceXAI", intelligence: 53.8, coding: 72.4, inputUsd: 2, outputUsd: 6, inputCny: 14.4, outputCny: 43.2, speed: 64.007, ttft: 12.627, firstAnswer: 12.627, releaseDate: "2026-07-08", slug: "grok-4-5" },
  { model: "GPT-5.5 (high)", provider: "OpenAI", intelligence: 53.1, coding: 71.6, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 78.74, ttft: 23.609, firstAnswer: 23.609, releaseDate: "2026-04-23", slug: "gpt-5-5-high" },
  { model: "Claude Sonnet 5 (Adaptive Reasoning, Max Effort)", provider: "Anthropic", intelligence: 53.4, coding: 71.5, inputUsd: 2, outputUsd: 10, inputCny: 14.4, outputCny: 72, speed: 83.493, ttft: 90.617, firstAnswer: 90.617, releaseDate: "2026-06-30", slug: "claude-sonnet-5" },
  { model: "GPT-5.5 (medium)", provider: "OpenAI", intelligence: 50.4, coding: 71.5, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 70.274, ttft: 7.734, firstAnswer: 7.734, releaseDate: "2026-04-23", slug: "gpt-5-5-medium" },
  { model: "GPT-5.6 Luna (max)", provider: "OpenAI", intelligence: 51.2, coding: 71.4, inputUsd: 1, outputUsd: 6, inputCny: 7.2, outputCny: 43.2, speed: 199.863, ttft: 94.121, firstAnswer: 94.121, releaseDate: "2026-07-09", slug: "gpt-5-6-luna" },
  { model: "Muse Spark 1.1 (xhigh)", provider: "Meta", intelligence: 50.6, coding: 71.3, inputUsd: 1.25, outputUsd: 4.25, inputCny: 9, outputCny: 30.6, speed: 124.622, ttft: 0.883, firstAnswer: 16.931, releaseDate: "2026-07-09", slug: "muse-spark-1-1" },
  { model: "GPT-5.4 (xhigh)", provider: "OpenAI", intelligence: 51.4, coding: 71.1, inputUsd: 2.5, outputUsd: 15, inputCny: 18, outputCny: 108, speed: 149.399, ttft: 116.447, firstAnswer: 116.447, releaseDate: "2026-03-05", slug: "gpt-5-4" },
  { model: "GPT-5.6 Terra (xhigh)", provider: "OpenAI", intelligence: 51.6, coding: 70.6, inputUsd: 2.5, outputUsd: 15, inputCny: 18, outputCny: 108, speed: 110.832, ttft: 7.667, firstAnswer: 7.667, releaseDate: "2026-07-09", slug: "gpt-5-6-terra-xhigh" },
  { model: "Gemini 3.5 Flash (high)", provider: "Google", intelligence: 50.2, coding: 70.1, inputUsd: 1.5, outputUsd: 9, inputCny: 10.8, outputCny: 64.8, speed: 276.05, ttft: 14.026, firstAnswer: 14.026, releaseDate: "2026-05-19", slug: "gemini-3-5-flash" },
  { model: "GPT-5.6 Sol (low)", provider: "OpenAI", intelligence: 49.4, coding: 69.7, inputUsd: 5, outputUsd: 30, inputCny: 36, outputCny: 216, speed: 54.387, ttft: 2.654, firstAnswer: 2.654, releaseDate: "2026-07-09", slug: "gpt-5-6-sol-low" },
  { model: "Gemini 3.6 Flash (high)", provider: "Google", intelligence: 50.1, coding: 69.2, inputUsd: 1.5, outputUsd: 7.5, inputCny: 10.8, outputCny: 54, speed: 255.545, ttft: 12.799, firstAnswer: 12.799, releaseDate: "2026-07-21", slug: "gemini-3-6-flash" },
  { model: "GLM-5.2 (max)", provider: "Z AI", intelligence: 51.1, coding: 68.8, inputUsd: 1.4, outputUsd: 4.4, inputCny: 10.08, outputCny: 31.68, speed: 167.424, ttft: 0.877, firstAnswer: 12.822, releaseDate: "2026-06-16", slug: "glm-5-2" },
  { model: "Gemini 3.1 Pro Preview", provider: "Google", intelligence: 46.5, coding: 68.8, inputUsd: 2, outputUsd: 12, inputCny: 14.4, outputCny: 86.4, speed: 130.538, ttft: 17.502, firstAnswer: 17.502, releaseDate: "2026-02-19", slug: "gemini-3-1-pro-preview" },
  { model: "GPT-5.6 Luna (xhigh)", provider: "OpenAI", intelligence: 49.1, coding: 68.6, inputUsd: 1, outputUsd: 6, inputCny: 7.2, outputCny: 43.2, speed: 173.215, ttft: 31.932, firstAnswer: 31.932, releaseDate: "2026-07-09", slug: "gpt-5-6-luna-xhigh" },
];

export function ModelRankPage() {
  const [providerFilter, setProviderFilter] = useState("all");
  const [query, setQuery] = useState("");

  const providers = useMemo(
    () => ["all", ...Array.from(new Set(rankedModels.map((model) => model.provider))).sort()],
    [],
  );

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rankedModels.filter((model) => {
      const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
      const matchesQuery =
        !normalizedQuery ||
        model.model.toLowerCase().includes(normalizedQuery) ||
        model.provider.toLowerCase().includes(normalizedQuery);
      return matchesProvider && matchesQuery;
    });
  }, [providerFilter, query]);

  const bestCoding = rankedModels[0];
  const cheapestOutput = rankedModels.reduce((best, model) =>
    model.outputCny < best.outputCny ? model : best,
  );
  const fastest = rankedModels.reduce((best, model) => (model.speed > best.speed ? model : best));

  return (
    <main className="app-shell rank-page">
      <section className="rank-topbar">
        <div>
          <a className="back-link" href="#/" title="返回配置器">
            <ArrowLeft size={18} />
            返回配置器
          </a>
          <p className="eyebrow">LLMRank.cn 快照</p>
          <h1>高编码能力模型筛选榜单</h1>
        </div>
        <a className="icon-text-button" href={dataSourceUrl} target="_blank" rel="noreferrer" title="打开原始数据源">
          <BarChart3 size={18} />
          数据源
        </a>
      </section>

      <section className="rank-filter-strip" aria-label="筛选条件">
        <RankStat icon={<Code2 size={19} />} label="收集条件" value="Intelligence > 45 / Coding > 68" />
        <RankStat icon={<CalendarDays size={19} />} label="数据日期" value={dataSnapshotDate} />
        <RankStat icon={<Gauge size={19} />} label="入选模型" value={`${rankedModels.length} 个`} />
        <RankStat icon={<DollarSign size={19} />} label="价格单位" value="每 1M tokens" />
      </section>

      <section className="rank-summary-grid" aria-label="关键摘要">
        <SummaryCard title="Coding 最高" model={bestCoding.model} provider={bestCoding.provider} value={bestCoding.coding.toFixed(1)} suffix="Coding" />
        <SummaryCard title="输出最便宜" model={cheapestOutput.model} provider={cheapestOutput.provider} value={`¥${formatMoney(cheapestOutput.outputCny)}`} suffix="/ 1M 输出" />
        <SummaryCard title="输出最快" model={fastest.model} provider={fastest.provider} value={formatNumber(fastest.speed)} suffix="tokens/s" />
      </section>

      <section className="rank-controls" aria-label="榜单控制">
        <label className="rank-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型或供应商" />
        </label>
        <label className="rank-provider-filter">
          <span>供应商</span>
          <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider === "all" ? "全部" : provider}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rank-table-panel" aria-label="筛选后的模型榜单">
        <div className="rank-table-header">
          <div>
            <h2>仅展示达标模型</h2>
            <p>价格同时展示原始美元和按 7.2 汇率换算的人民币；速度和延迟为榜单提供的中位数。</p>
          </div>
          <span>{filteredModels.length} / {rankedModels.length}</span>
        </div>
        <div className="rank-table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>供应商</th>
                <th>Intelligence</th>
                <th>Coding</th>
                <th>输入价格</th>
                <th>输出价格</th>
                <th>输出速度</th>
                <th>首 token</th>
                <th>首答案 token</th>
                <th>发布日</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.map((model) => (
                <tr key={model.slug}>
                  <td>
                    <strong>{model.model}</strong>
                  </td>
                  <td>{model.provider}</td>
                  <td>{model.intelligence.toFixed(1)}</td>
                  <td>
                    <span className="score-pill">{model.coding.toFixed(1)}</span>
                  </td>
                  <td>
                    <PriceCell usd={model.inputUsd} cny={model.inputCny} />
                  </td>
                  <td>
                    <PriceCell usd={model.outputUsd} cny={model.outputCny} />
                  </td>
                  <td>{formatNumber(model.speed)} tok/s</td>
                  <td>{formatSeconds(model.ttft)}</td>
                  <td>{formatSeconds(model.firstAnswer)}</td>
                  <td>{model.releaseDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rank-note" aria-label="数据说明">
        <Timer size={18} />
        <p>
          本页只收集 `Intelligence Index &gt; 45` 且 `Coding Index &gt; 68` 的文本模型；没有达标的模型不会进入本地快照。
        </p>
      </section>
    </main>
  );
}

function RankStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rank-stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({
  title,
  model,
  provider,
  value,
  suffix,
}: {
  title: string;
  model: string;
  provider: string;
  value: string;
  suffix: string;
}) {
  return (
    <article className="rank-summary-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{suffix}</small>
      <p>{model}</p>
      <em>{provider}</em>
    </article>
  );
}

function PriceCell({ usd, cny }: { usd: number; cny: number }) {
  return (
    <div className="price-cell">
      <strong>${formatMoney(usd)}</strong>
      <span>¥{formatMoney(cny)}</span>
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 1,
  });
}

function formatSeconds(value: number) {
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 3 })}s`;
}
