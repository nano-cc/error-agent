import { z } from "zod";
import { BaseTool } from "../base-tool";
import {
  DangerLevel,
  ToolCategory,
  ToolExecutionResult,
} from "../types";

export const WebSearchSchema = z.object({
  query: z.string().describe("搜索关键词或问题"),
  limit: z.number().optional().describe("返回的最大结果数量，默认 5"),
});

export class WebSearchTool extends BaseTool<typeof WebSearchSchema> {
  constructor() {
    super({
      name: "web_search",
      description: "使用 DuckDuckGo 搜索引擎进行网络搜索",
      schema: WebSearchSchema,
      meta: {
        category: ToolCategory.NETWORK,
        dangerLevel: DangerLevel.SAFE,
        isPrivileged: false,
      },
    });
  }

  async _call(args: z.infer<typeof WebSearchSchema>): Promise<ToolExecutionResult> {
    const { query, limit = 5 } = args;
    const startTime = Date.now();
    const timestamp = startTime;

    try {
      const axios = require("axios");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await axios.get("https://api.duckduckgo.com/", {
        params: {
          q: query,
          format: "json",
          no_html: 1,
          skip_disambig: 1,
        },
        signal: controller.signal,
        timeout: 10000,
        headers: {
          Accept: "application/json",
          "User-Agent": "Error-Agent/1.0",
        },
      });

      clearTimeout(timeoutId);
      const data = response.data;
      const results: any[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.AbstractSource,
          snippet: data.AbstractText,
          url: data.AbstractURL,
        });
      }

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, limit)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0],
              snippet: topic.Text,
              url: topic.FirstURL,
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          results,
          query,
        },
        metadata: {
          duration,
          timestamp,
          toolName: "web_search",
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Failed to search web",
        metadata: {
          duration,
          timestamp,
          toolName: "web_search",
        },
      };
    }
  }
}
