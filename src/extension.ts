// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';
import * as fs from 'fs';

import { getProviderErrorMsg, promptForApiKey, providerFromModel } from './utils';

import { ChatCompletionRequestMessage } from "openai";

import { APIProvider } from "./apiProvider";
import { AnthropicProvider, AnthropicParams, convertOpenAIMessagesToAnthropicMessages } from "./anthropic";
import { OpenAIProvider, OpenAIParams } from "./openai";

interface ResourcePaths {
    htmlPath: string;
    chatideJsPath: string;
    chatideCssPath: string;
    iconPath: string;
    highlightJsCssPath: string;
    highlightJsScriptPath: string;
}

console.log("Node.js version:", process.version);

const isMac = process.platform === "darwin";

const OS_LOCALIZED_KEY_CHORD = isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P";
const NO_SELECTION_COPY = "No code is highlighted. Highlight code to include it in the message to ChatGPT.";
const SELECTION_AWARENESS_OFF_COPY = `Code selection awareness is turned off. To turn it on, go to settings (${OS_LOCALIZED_KEY_CHORD}).`;

let apiProvider: APIProvider | undefined;
let messages: ChatCompletionRequestMessage[] = [];

let selectedCode: string;
let selectedCodeSentToGpt: string;

let highlightedCodeAwareness: boolean = vscode.workspace.getConfiguration('chatide').get('highlightedCodeAwareness') || false;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log("activate chatide");
      
    resetChat();

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.openSettings', openSettings)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.updateOpenAiApiKey', async () => {
            await promptForApiKey("openai", context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.updateAnthropicApiKey', async () => {
            await promptForApiKey("anthropic", context);
        })
    );

    const secretStorage = context.secrets;
    const secretChangeListener = secretStorage.onDidChange(async (e: vscode.SecretStorageChangeEvent) => {
        const forceReinit = true;
      
        if (e.key === "chatide.anthropicApiKey") {
            const key = await context.secrets.get("chatide.anthropicApiKey");
            if (!key) {
                return;
            }
            // Reinitialize the API provider if the Anthropic API key changes
            await initApiProviderIfNeeded(context, forceReinit);
        } else if (e.key === "chatide.openAiApiKey") {
            const key = await context.secrets.get("chatide.openAiApiKey");
            if (!key) {
                return;
            }
            // Reinitialize the API provider if the OpenAI API key changes
            await initApiProviderIfNeeded(context, forceReinit);
        }
    });
  
    context.subscriptions.push(secretChangeListener);

    let disposable = vscode.commands.registerCommand('chatide.start', async () => {
        const chatIdePanel = vscode.window.createWebviewPanel(
            'chatIde',
            'ChatIDE',
            vscode.ViewColumn.Beside,
            {
                // allow the extension to reach files in the bundle
                localResourceRoots: [vscode.Uri.file(path.join(__dirname, '..'))],
                enableScripts: true,
                // Retain the context when the webview becomes hidden
                retainContextWhenHidden: true,
            },
        );

        const htmlPathUri = vscode.Uri.file(path.join(context.extensionPath, 'src' ,'chatide.html'));
        const htmlPath = htmlPathUri.with({scheme: 'vscode-resource'});   

        let jsPathUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "chatide.js")));
        const jsPath = chatIdePanel.webview.asWebviewUri(jsPathUri).toString();

        let cssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "chatide.css")));
        const cssPath = chatIdePanel.webview.asWebviewUri(cssUri).toString();

        let highlightJsCssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "atom-one-dark.min.css")));
        const highlightJsCssPath = chatIdePanel.webview.asWebviewUri(highlightJsCssUri).toString();

        let highlightJsScriptUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "highlight.min.js")));
        const highlightJsScriptPath = chatIdePanel.webview.asWebviewUri(highlightJsScriptUri).toString();

        let iconUri = vscode.Uri.file(context.asAbsolutePath(path.join('assets', "icon.jpg")));
        const iconPath = chatIdePanel.webview.asWebviewUri(iconUri).toString();

        const model = vscode.workspace.getConfiguration('chatide').get('model') || "No model configured";
        const provider = providerFromModel(model.toString());

        const errorCallback = (error: any) => {
            console.error('Error fetching stream:', error);
            const errorMessage = error.message;
            const humanRedableError = getProviderErrorMsg(provider.toString(), errorMessage);
            chatIdePanel.webview.postMessage({ command: "openAiError", error: humanRedableError });
        };
        
        const configDetails = model.toString();
        const resourcePaths = {
            htmlPath: htmlPath.fsPath,
            chatideJsPath: jsPath.toString(),
            chatideCssPath: cssPath.toString(),
            iconPath: iconPath.toString(),
            highlightJsCssPath: highlightJsCssPath,
            highlightJsScriptPath: highlightJsScriptPath,
        };

        chatIdePanel.webview.html = getWebviewContent(resourcePaths, configDetails);

        chatIdePanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                case "getGptResponse":
                    // Turn the user's message to Markdown and echo it back
                    const userMessageMarkdown = marked.marked(message.userMessage);
                    chatIdePanel.webview.postMessage({ command: "sentUserMessage", userMessageMarkdown });
                    
                    // Proceed to query OpenAI API and stream back the generated tokens.
                    await initApiProviderIfNeeded(context);

                    await getGptResponse(
                        message.userMessage,
                        (token) => {
                            chatIdePanel.webview.postMessage({ command: "gptResponse", token });
                        },
                        errorCallback
                    );
                    return;
                case "resetChat":
                    resetChat();
                    chatIdePanel.webview.postMessage({ command: "resetChatComplete" });
                    return;
                case "exportChat":
                    await exportChat();
                    return;
                case "importChat":
                    const success = await importChat();
                    if (success) {
                        chatIdePanel.webview.postMessage({ command: "loadChatComplete", messages });
                    } else {
                        console.error("Failed to import chat");
                    }
                    return;
                case "navigateToHighlightedCode":
                    navigateToHighlightedCode();
                    return;
                case "insertCode": // used for drag and drop
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        const position = activeEditor.selection.active;
                        activeEditor.edit((editBuilder) => {
                            editBuilder.insert(position, message.code);
                        });
                    }
                    return;
                case "openSettings":
                    vscode.commands.executeCommand('workbench.action.openSettings', 'chatide');
                    break;
                }

            },
            null,
            context.subscriptions
        );

        // Add an event listener for selection changes
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((event) => handleSelectionChange(event, chatIdePanel))
        );

        // listen for changes in highlightedCodeAwareness
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('chatide.highlightedCodeAwareness')) {
                highlightedCodeAwareness = vscode.workspace.getConfiguration('chatide').get('highlightedCodeAwareness') || false;
                
                // This is imperfect because if there's code selected while the setting is changed
                // the status copy will be 'wrong'. 
                chatIdePanel.webview.postMessage({
                    command: 'updateHighlightedCodeStatus',
                    status: !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY,
                    showButton: false
                });
            }

            if (e.affectsConfiguration('chatide.model')) {
                initApiProviderIfNeeded(context, true);
                chatIdePanel.webview.postMessage({
                    command: 'updateModelConfigDetails',
                    modelConfigDetails: vscode.workspace.getConfiguration('chatide').get('model')!,
                });
            }
        });
        
        chatIdePanel.onDidDispose(
            () => {
                console.log('WebView closed');
            },
            null,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

function openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'chatide');
}

function getWebviewContent(
    paths: ResourcePaths,
    modelConfigDetails: string) {
    const codeHighlightStatusCopy = !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY;

    console.log(`Loading webview content from ${paths.htmlPath}`);

    const html = fs.readFileSync(paths.htmlPath, 'utf8');
    const variables = { 
        paths,
        modelConfigDetails,
        codeHighlightStatusCopy
    };

    const webviewHtml = (new Function("variables", `with (variables) { return \`${html}\`; }`))(variables);

    return webviewHtml;
}

function resetChat() {
    // Load the sytem prompt and clear the chat history.
    let systemPrompt: any = vscode.workspace.getConfiguration('chatide').get('systemPrompt');
    if (!systemPrompt) {
        vscode.window.showErrorMessage('No system prompt found in the ChatIDE settings. Please add your system prompt using the "Open ChatIDE Settings" command and restart the extension.');
        return;
    }

    messages = [];
    messages.push({"role": "system", "content": systemPrompt.toString()});
}

async function getGptResponse(userMessage: string, completionCallback: (completion: string) => void ,errorCallback?: (error: any) => void) {
    if (!apiProvider) {
        throw new Error("API provider is not initialized.");
    }
    
    if (highlightedCodeAwareness && selectedCodeSentToGpt !== selectedCode) {
        console.log("Including highlighted text in API request.");
        userMessage = `${prepareSelectedCodeContext()} ${userMessage}`;
        selectedCodeSentToGpt = selectedCode;
    } else {
        console.log("Not including highlighted text in API request because it's already been sent");
    }
  
    messages.push({ role: "user", content: userMessage });
  
    const maxTokens = vscode.workspace.getConfiguration("chatide").get("maxLength");
    const model = vscode.workspace.getConfiguration("chatide").get("model")!;
    const provider = providerFromModel(model.toString());
    const temperature = vscode.workspace.getConfiguration("chatide").get("temperature");
  
    if (!maxTokens) {
        vscode.window.showErrorMessage(
            'Missing maxLength in the ChatIDE settings. Please add them using the "Open ChatIDE Settings" command and restart the extension.'
        );
        return;
    }

    let params: OpenAIParams | AnthropicParams;

    if (provider === "openai") {
        params = {
            model: model.toString(),
            messages: messages,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            max_tokens: Number(maxTokens),
            temperature: Number(temperature),
            stream: true,
        };
    } else if (provider === "anthropic") {
        params = {
            prompt: convertOpenAIMessagesToAnthropicMessages(messages),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            max_tokens: Number(maxTokens),
            model: model.toString(),
        };
    } else {
        vscode.window.showErrorMessage(
            'Unsupported AI provider in the ChatIDE settings. Please add it using the "Open ChatIDE Settings" command and restart the extension.'
        );
        return;
    }
  
    try {
        await apiProvider.completeStream(
            params,
            {
                onUpdate: (completion: string) => {
                    if (completion) {
                        completionCallback(marked.marked(completion));
                    }
                },
                onComplete: (message: string) => {
                    messages.push({"role": "assistant", "content":  marked.marked(message)});
                }
            }
        );
    } catch (error: any) {
        if (errorCallback) {
            errorCallback(error);
        }
    }
}

async function exportChat() {
    const options: vscode.SaveDialogOptions = {
        defaultUri: vscode.Uri.file('chatIDE-history-'),
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'JSON': ['json']
        }
    };

    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
        const content = JSON.stringify(messages, null, 2);
        fs.writeFile(fileUri.fsPath, content, (err) => {
            if (err) {
                vscode.window.showErrorMessage('Failed to export messages: ' + err.message);
            } else {
                vscode.window.showInformationMessage('Messages exported successfully!');
            }
        });
    }
}

// Import chat history from a JSON file
async function importChat() {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Chat History': ['json']
        }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
        try {
            const data = await fs.promises.readFile(fileUri[0].fsPath, 'utf8');
            const importedMessages = JSON.parse(data);

            messages = importedMessages.map((message: any) => {
                return {
                    "role": message.role,
                    "content": marked.marked(message.content)
                };
            });
            vscode.window.showInformationMessage('Messages imported successfully!');
            return true;
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                vscode.window.showErrorMessage('Failed to import messages: ' + e.message);
            } else {
                vscode.window.showErrorMessage('Failed to parse JSON: ' + e.message);
            }
        }
    }

    return false;
}

async function initApiProviderIfNeeded(context: vscode.ExtensionContext, force: boolean = false) {
    console.log("Initializing API provider...");
    if (apiProvider !== undefined && !force) {
        console.log("API provider already initialized.");
        return;
    }
  
    const model = vscode.workspace.getConfiguration("chatide").get("model")!;
    const providerType = providerFromModel(model.toString());
    if (!providerType) {
        vscode.window.showErrorMessage(
            'No provider found in the ChatIDE settings. Please add your provider using the "Open ChatIDE Settings" command and restart the extension.'
        );
        return;
    }
  
    if (providerType === "anthropic") {
        apiProvider = new AnthropicProvider(context);
    } else if (providerType === "openai") {
        apiProvider = new OpenAIProvider(context);
    } else {
        vscode.window.showErrorMessage(
            `Invalid provider "${providerType}" in the ChatIDE settings. Please use a valid provider and restart the extension.`
        );
        return;
    }
  
    try {
        console.log("Calling init()");
        await apiProvider.init();
        console.log("init() returned.");
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error initializing provider: ${error.message}`);
    }
}

function navigateToHighlightedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const selection = editor.selection;
    if (!selection.isEmpty) {
        editor.revealRange(selection, vscode.TextEditorRevealType.Default);
    }
}

function getTokenEstimateString(numCharacters: number): string {
    const estimate = Math.round(numCharacters / 4);
    if (estimate === 1) {
        return `~${estimate} token`;
    }
    return `~${estimate} tokens`;
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent, chatIdePanel: vscode.WebviewPanel) {
    selectedCode = event.textEditor.document.getText(event.selections[0]);
    if (selectedCode && highlightedCodeAwareness) {
        const numCharacters = selectedCode.length;
        chatIdePanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: `${numCharacters} characters (${getTokenEstimateString(numCharacters)}) are highlighted. This code will be included in your message to GPT.`,
            showButton: true
        });
    } else if (!highlightedCodeAwareness) {
        chatIdePanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: SELECTION_AWARENESS_OFF_COPY,
            showButton: false
        });
    } else {
        chatIdePanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: NO_SELECTION_COPY,
            showButton: false
        });
    }
}

function prepareSelectedCodeContext() {
    return `
    CONTEXT:
    =========================
    In my question I am referring to the following code:
    ${selectedCode}
    =========================\n`;
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log("deactivate chatide");
}
