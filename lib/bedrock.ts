import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const AWS_REGION = process.env.AWS_REGION || "ap-southeast-3";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0";

console.log("[Bedrock] Model yang dipakai:", BEDROCK_MODEL_ID);

const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

type AskNovaParams = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
};

export async function askNova({
  systemPrompt,
  userPrompt,
  maxTokens = 1500,
}: AskNovaParams): Promise<string> {
  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: [
      {
        role: "user",
        content: [{ text: userPrompt }],
      },
    ],
    inferenceConfig: {
      maxTokens,
      temperature: 0.2,
      topP: 0.9,
    },
  });
  const response = await bedrockClient.send(command);
  return (
    response?.output?.message?.content?.[0]?.text ||
    "Saya tidak menemukan data pendukung di file Excel yang tersedia."
  );
}

// ===== LLM TAHAP 1 — return JSON =====
export type LLMInstruction = {
  operation:
    | "filter"
    | "sum"
    | "count"
    | "lookup"
    | "list"
    | "most_frequent"
    | "date_filter"
    | "average"
    | "general";
  file?: string;
  column?: string;
  value?: string;
  entity?: string;
  groupBy?: string;
  reasoning?: string;
};

export async function askNovaJSON(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMInstruction> {
  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: [
      {
        role: "user",
        content: [{ text: userPrompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 500,
      temperature: 0.1,
      topP: 0.9,
    },
  });

  const response = await bedrockClient.send(command);
  const rawText = response?.output?.message?.content?.[0]?.text || "{}";

  try {
    let jsonText = rawText;
    const jsonMarker = rawText.indexOf("JSON:");
    if (jsonMarker !== -1) {
      jsonText = rawText.substring(jsonMarker + 5).trim();
    }
    const cleaned = jsonText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned) as LLMInstruction;
  } catch {
    console.warn("[Bedrock] Gagal parse JSON, fallback ke general:", rawText);
    return { operation: "general" };
  }
}