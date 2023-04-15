/* eslint-disable @typescript-eslint/naming-convention */
import { IncomingMessage } from 'http';
import * as https from 'https';

export type SamplingParameters = {
  prompt: string;
  temperature?: number;
  max_tokens_to_sample: number;
  stop_sequences: string[];
  top_k?: number;
  top_p?: number;
  model: string;
  tags?: { [key: string]: string };
};

export type OnOpen = (response: IncomingMessage) => void | Promise<void>;
export type OnUpdate = (completion: CompletionResponse) => void | Promise<void>;

export const HUMAN_PROMPT = "\n\nHuman:";
export const AI_PROMPT = "\n\nAssistant:";

const CLIENT_ID = "anthropic-typescript/0.4.3";
const DEFAULT_API_URL = "https://api.anthropic.com";

const DONE_MESSAGE = "[DONE]";

export type CompletionResponse = {
  completion: string;
  stop: string | null;
  stop_reason: "stop_sequence" | "max_tokens";
  truncated: boolean;
  exception: string | null;
  log_id: string;
};

export class Client {
    private apiUrl: string;

    constructor(private apiKey: string, options?: { apiUrl?: string }) {
        this.apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
    }

    completeStream(
        params: SamplingParameters,
        {
            onOpen,
            onUpdate,
        }: { onOpen?: OnOpen; onUpdate?: OnUpdate; }
    ): Promise<CompletionResponse> {
        const url = new URL(`${this.apiUrl}/v1/complete`);
        const postData = JSON.stringify({ ...params, stream: true });
        const options = {
            method: 'POST',
            headers: {
                Accept: 'text/event-stream',
                'Content-Type': 'application/json',
                Client: CLIENT_ID,
                'X-API-Key': this.apiKey,
            },
        };
      
        return new Promise((resolve, reject) => {
            const req = https.request(url, options, (res: IncomingMessage) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Sampling error: ${res.statusCode} ${res.statusMessage}`));
                    return;
                }
                
                if (onOpen) {
                    onOpen(res);
                }
      
                let buffer = '';
      
                res.on('data', (chunk: any) => {
                    buffer += chunk.toString();
      
                    let index;
                    let resolved = false;

                    while ((index = buffer.indexOf('\n')) > -1) {
                        const line = buffer.slice(0, index);
                        buffer = buffer.slice(index + 1);
      
                        if (line.startsWith('data: ')) {
                            const msgRaw = line.slice(6);

                            if (msgRaw === DONE_MESSAGE) {
                                console.error(
                                    "Unexpected done message before stop_reason has been issued"
                                );
                                return;
                            }

                            const completion = JSON.parse(msgRaw) as CompletionResponse;
                            if (onUpdate) {
                                Promise.resolve(onUpdate(completion)).catch((error) => {
                                    reject(error);
                                });
                            }
      
                            if (completion.stop_reason !== null) {
                                resolved = true;
                                resolve(completion);
                                break;
                            }
                        }
                    }
                    
                    if (resolved) {
                        res.removeAllListeners('data');
                    }
                });
      
                res.on('error', (error) => {
                    reject(error);
                });
            });
      
            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }
}