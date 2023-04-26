import * as vscode from "vscode";
import { Configuration, OpenAIApi } from "openai";
import { APIProvider } from "./apiProvider";

export interface OpenAIParams {
    model: string;
    messages: any[];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    max_tokens: number;
    temperature: number;
    stream: boolean;
}

export class OpenAIProvider extends APIProvider {
    private openai: OpenAIApi | undefined;
    private context: vscode.ExtensionContext;
  
    constructor(context: vscode.ExtensionContext) {
        super();
        this.context = context;
    }
  
    async init() {
        let openAiApiKey = await this.context.secrets.get("chatide.openAiApiKey");

        if (!openAiApiKey) {
            openAiApiKey = await vscode.window.showInputBox({
                prompt: "Enter your OpenAI API key:",
                ignoreFocusOut: true,
            });
            if (openAiApiKey) {
                await this.context.secrets.store("chatide.openAiApiKey", openAiApiKey);
            } else {
                throw new Error("No API key provided. Please add your API key and restart the extension.");
            }
        }
  
        const configuration = new Configuration({
            apiKey: openAiApiKey,
        });
        this.openai = new OpenAIApi(configuration);
    }

    async completeStream(params: OpenAIParams, callbacks: any) {
        if (!this.openai) {
            throw new Error("OpenAI API is not initialized.");
        }

        try {
            const res: any = await this.openai.createChatCompletion(params, { responseType: 'stream' });
      
            let buffer = "";
            let gptMessage = "";

            for await (const chunk of res.data) {
                
                buffer += chunk.toString("utf8");
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    const message = line.replace(/^data: /, "");
                    if (message === "[DONE]") {
                        if (callbacks.onComplete) {
                            callbacks.onComplete(gptMessage);
                        }
                        return;
                    }
                    if (message.length === 0) {
                        continue;
                    }
                    
                    try {
                        const json = JSON.parse(message);
                        const token = json.choices[0].delta.content;
                        if (token) {
                            gptMessage += token;
                            if (callbacks.onUpdate) {
                                callbacks.onUpdate(gptMessage);
                            }
                        }
                    } catch (error) {
                        console.error("Error parsing message:", error);
                        continue;
                    }
                }
            }
        } catch (error: any) {
            console.error("Error fetching stream:", error);
            throw error;
        }
    }
}