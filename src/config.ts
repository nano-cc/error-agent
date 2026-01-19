export const CONFIG = {
  // Agent 默认配置
  agent: {
    defaultApiUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "deepseek-v3-2-251201",
    defaultTemperature: 0,
  },

  // 终端工具配置
  terminal: {
    maxOutputLength: 500, // 最大保留字符数
    defaultTimeout: 30000, // 默认超时 30秒
  },

  // 安全配置
  security: {
    // 需要人工审批的高风险工具列表
    dangerousTools: ["terminal"],
  },
};
