import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class GroqProvider extends BaseProvider {
  name = 'Groq';
  getApiKeyLink = 'https://console.groq.com/keys';

  config = {
    apiTokenKey: 'GROQ_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Keep this list to models that are actually served on Groq's developer plan.
     * The previous entries (llama-3.1-8b-instant, llama-3.3-70b-versatile) are now marked
     * Enterprise / Contact Sales, so requests against them fail with "does not exist or you
     * do not have access to it". Context and completion ceilings below are taken from
     * https://console.groq.com/docs/models
     */

    // GPT-OSS 120B: OpenAI's flagship open-weight model, reasoning + code execution
    {
      name: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },

    // GPT-OSS 20B: same 131k context, roughly twice the throughput
    {
      name: 'openai/gpt-oss-20b',
      label: 'GPT-OSS 20B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },

    // Qwen3.8 27B: preview model, smaller output ceiling
    {
      name: 'qwen/qwen3.8-27b',
      label: 'Qwen3.8 27B',
      provider: 'Groq',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 16384,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GROQ_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.groq.com/openai/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const res = (await response.json()) as any;

    const data = res.data.filter(
      (model: any) => model.object === 'model' && model.active && model.context_window > 8000,
    );

    return data.map((m: any) => ({
      name: m.id,
      label: `${m.id} - context ${m.context_window ? Math.floor(m.context_window / 1000) + 'k' : 'N/A'} [ by ${m.owned_by}]`,
      provider: this.name,
      maxTokenAllowed: Math.min(m.context_window || 8192, 16384),
      maxCompletionTokens: 8192,
    }));
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GROQ_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    });

    return openai(model);
  }
}
