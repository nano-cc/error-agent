import { ChatOpenAI } from "@langchain/openai";
import * as vscode from "vscode";
import { CONFIG } from "../config";

/**
 * 配置项接口定义
 */
interface ChatConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  temperature: number;
}

/**
 * 创建并返回一个 LangChain ChatOpenAI 实例
 */
export function createChatModel(config: ChatConfig): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: {
      baseURL: config.apiUrl,
    },
    modelName: config.model, // 注意：LangChain 中通常使用 modelName 属性
    temperature: config.temperature,
  });
}

/**
 * 获取 ChatOpenAI 实例（从 VSCode 配置中读取）
 */
export function getChatOpenAI(): ChatOpenAI {
  const config = vscode.workspace.getConfiguration("errorAgent");
  const apiKey = config.get<string>("apiKey");
  const apiUrl = config.get<string>("apiUrl");
  const model = config.get<string>("model");
  const temperature = config.get<number>("temperature") ?? CONFIG.agent.defaultTemperature;

  return createChatModel({
    apiKey: apiKey || "",
    apiUrl: apiUrl || CONFIG.agent.defaultApiUrl,
    model: model || CONFIG.agent.defaultModel,
    temperature: temperature,
  });
}
