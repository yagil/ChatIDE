/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { APIProvider } from "./apiProvider";

import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from "@anthropic-ai/sdk/resources";

export interface AnthropicParams {
    messages: Array<MessageParam>;
    max_tokens: number;
    model: string;
    stream: boolean;
    temperature?: number;
}

export class AnthropicProvider extends APIProvider {
    private client: Anthropic | undefined;
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
  
        this.client = new Anthropic({
            apiKey
        });
    }

    async completeStream(params: AnthropicParams, callbacks: any) {
        if (!this.client) {
            throw new Error("Anthropic API client is not initialized.");
        }

        let anthropicMessage = "";
        // @ts-ignore
        const systemMessage = params.messages.find((message) => message.role === "system");
        // @ts-ignore
        const messagesWithoutSystem = params.messages.filter((message) => message.role !== "system");
        try {
            const stream = await this.client.messages.create({
                max_tokens: params.max_tokens,
                system: systemMessage?.content as string|undefined,
                messages: messagesWithoutSystem,
                model: params.model,
                stream: params.stream,
            });
            if (callbacks.onComplete) {
                // @ts-ignore
                for await (const messageStreamEvent of stream) {
                    const { type, delta } = messageStreamEvent;
                    if (type === "content_block_delta") {
                        anthropicMessage += delta.text;
                        callbacks.onUpdate(anthropicMessage);
                    } else if (type === "message_stop") {
                        console.log("MessageStreamEvent:", messageStreamEvent);
                        callbacks.onComplete(anthropicMessage);
                    }
                }
            }
        } catch (error: any) {
            console.error("Error fetching stream:", error);
            throw error;
        }
    }
}