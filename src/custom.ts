import * as vscode from "vscode";
import { Configuration, OpenAIApi } from "openai";
import { APIProvider } from "./apiProvider";
import { OpenAIParams } from "./openai";

// Here we assume tha the custom LLM provider conform to the same API contract as OpenAI
export class CustomLLMProvider extends APIProvider {
    private openaiCompatibleProvider: OpenAIApi | undefined;
    private context: vscode.ExtensionContext;
    private serverUrl: string|undefined;
  
    constructor(context: vscode.ExtensionContext, serverUrl: string|undefined) {
        super();
        this.context = context;
        this.serverUrl = serverUrl;

        console.log(`Custom LLM provider initialized with base path: ${this.serverUrl}`);
    }
  
    async init() {
        // Get BasePath from the regular extension settings (not secret storage). If there isn't one, show an error message and return.
        if (!this.serverUrl || this.serverUrl === undefined) {
            vscode.window.showErrorMessage("No LLM base path configured. Please configure a base path and restart the extension.");
            return;
        }

        const configuration = new Configuration({
            basePath: this.serverUrl,
        });
        this.openaiCompatibleProvider = new OpenAIApi(configuration);
    }

    async completeStream(params: OpenAIParams, callbacks: any) {
        if (!this.openaiCompatibleProvider) {
            throw new Error("OpenAI API is not initialized.");
        }

        try {
            const res: any = await this.openaiCompatibleProvider.createChatCompletion(params, { responseType: 'stream' });
      
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