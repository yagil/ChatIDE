/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { Client, HUMAN_PROMPT, AI_PROMPT, CompletionResponse } from "./anthropic-sdk-simple";
import { APIProvider } from "./apiProvider";

export interface AnthropicParams {
    prompt: string;
    max_tokens: number;
    model: string;
}

const PROMPT_SUFFIX = "IMPORTANT: Please respond in Markdown format when appropriate.";

/*
* A function to convert from OpenAI format message array to Anthropic format message blob
* 
* Example openAI messages:
*   messages = [{"role":"user", "content": "hi"}, {"role":"assistant", "content": "hello"}]
*
* Example anthropic messages:
*   message = "\n\nHuman: Hello .\n\nAssistant: Hi! How are you?"
*/
export function convertOpenAIMessagesToAnthropicMessages(messages: any) {
    let message = "";
    for (let i = 0; i < messages.length; i++) {
        const role = messages[i].role;
        const content = messages[i].content;
        if (role === "system") {
            message += `\n\nHuman: ${content}. ${PROMPT_SUFFIX}`;
        }
        else if (role === "user") {
            message += `\n\nHuman: ${content}`;
        } else if (role === "assistant") {
            message += `\n\nAssistant: ${content}`;
        }

    }
    return message+`${AI_PROMPT}`;
}

export class AnthropicProvider extends APIProvider {
    private client: Client | undefined;
    private context: vscode.ExtensionContext;
  
    constructor(context: vscode.ExtensionContext) {
        super();
        this.context = context;
    }
  
    async init() {
        let apiKey = await this.context.secrets.get("chatide.anthropicApiKey");
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: "Enter your Anthropic API key:",
                ignoreFocusOut: true,
            });
            if (apiKey) {
                await this.context.secrets.store("chatide.anthropicApiKey", apiKey);
            } else {
                throw new Error("No API key provided. Please add your API key and restart the extension.");
            }
        }
  
        this.client = new Client(apiKey);
    }

    async completeStream(params: AnthropicParams, callbacks: any) {
        if (!this.client) {
            throw new Error("Anthropic API client is not initialized.");
        }

        try {
            const completeMessage = await this.client.completeStream(
                {
                    prompt: `${HUMAN_PROMPT} ${params.prompt}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    stop_sequences: [HUMAN_PROMPT],
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    max_tokens_to_sample: params.max_tokens,
                    model: params.model,
                },
                {
                    onOpen: callbacks.onOpen,
                    onUpdate: (completion: CompletionResponse) => {
                        if (completion.completion) {
                            callbacks.onUpdate(completion.completion);
                        }   
                    },
                }
            );
            if (callbacks.onComplete) {
                callbacks.onComplete(completeMessage.completion);
            }
        } catch (error: any) {
            console.error("Error fetching stream:", error);
            throw error;
        }
    }
}