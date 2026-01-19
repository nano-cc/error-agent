// WebSearchTool.ts
import axios from "axios";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 泛化增强版 WebSearchTool
 */
export const duckDuckGoSearch = tool(
  async ({ query, maxResults = 3 }) => {
    try {
      const encodedQuery = encodeURIComponent(query.trim());
      // 使用 API 端点获取结构化数据
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1&t=vscode-agent-pro`;

      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (VSCode; AgentPro)",
        },
        timeout: 8000,
      });

      const data = response.data;
      const results: string[] = [];

      // 提取即时答案 (Answer)
      if (data.Answer) {
        results.push(`【即时答案】: ${data.Answer}`);
      }

      // 提取百科/官方摘要 (Abstract)
      if (data.AbstractText) {
        results.push(
          `【摘要】: ${data.AbstractText}\n来源: ${data.AbstractURL || "N/A"}`,
        );
      }

      // 处理相关链接 (RelatedTopics)
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        const topics = data.RelatedTopics.filter(
          (t: any) => t.Text && t.FirstURL,
        ).slice(0, maxResults);

        topics.forEach((topic: any, index: number) => {
          results.push(
            `【结果 ${index + 1}】: ${topic.Text}\n链接: ${topic.FirstURL}`,
          );
        });
      }

      if (results.length === 0) {
        return `未找到关于 "${query}" 的有效搜索结果。`;
      }

      return `--- 网络搜索结果: "${query}" ---\n\n` + results.join("\n\n");
    } catch (error: any) {
      return `网络搜索执行失败: ${error.message}`;
    }
  },
  {
    name: "duckduckgo_search",
    // 💡 泛化描述：强调能力和高级语法的兼容性，而不是列举具体指令
    description:
      "通过网络搜索获取外部知识、技术文档或解决代码报错。支持高级搜索语法（如 site:、引号精确匹配等）以提升搜索精度。",
    schema: z.object({
      query: z.string().describe("搜索关键词或组合搜索指令"),
      maxResults: z
        .number()
        .optional()
        .default(3)
        .describe("返回结果的最大数量"),
    }),
  },
);
