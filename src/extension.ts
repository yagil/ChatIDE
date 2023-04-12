// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';
import * as fs from 'fs';

import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

interface ResourcePaths {
    chatideJsPath: string;
    chatideCssPath: string;
    iconPath: string;
    highlightJsCssPath: string;
    highlightJsScriptPath: string;
}

const isMac = process.platform === "darwin";

const OS_LOCALIZED_KEY_CHORD = isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P";
const NO_SELECTION_COPY = "No code is highlighted. Highlight code to include it in the message to ChatGPT.";
const SELECTION_AWARENESS_OFF_COPY = `Code selection awareness is turned off. To turn it on, go to settings (${OS_LOCALIZED_KEY_CHORD}).`;

let openai: OpenAIApi;
let openAiApiKey: string;
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
        vscode.commands.registerCommand('chatide.updateApiKey', async () => {
            await promptForApiKey(context);
        })
    );
  
    context.secrets.get('chatide.apiKey').then(async (value) => {
        if (!value) {
            await promptForApiKey(context);
        } else {
            openAiApiKey = value;
        }
    });

    const secretStorage = context.secrets;
    const secretChangeListener = secretStorage.onDidChange(async (e: vscode.SecretStorageChangeEvent) => {
        if (e.key === 'chatide.apiKey') {
            const key = await context.secrets.get('chatide.apiKey');
            if (!key) {
                return;
            }   
            openAiApiKey = key;
            const forceReinit = true;
            initGptIfNeeded(forceReinit);
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

        const errorCallback = (error: any) => {
            console.error('Error fetching stream:', error);
            const errorMessage = error.message;
            const humanRedableError = `
            <b>You're hitting an OpenAI API error.</b><br><br>
            <b>Error message</b>: <i>'${errorMessage}'</i>.<br><br>
            <u>Common reasons for OpenAI Errors</u>:<br><br>
            \t • <b>OpenAI might be having issues</b>: check the <a href="https://status.openai.com/">OpenAI system status page</a>.<br>
            \t • <b>Invalid API Key</b>: make sure you entered it correctly (Need help? See <a href="https://github.com/yagil/ChatIDE#configuration">Setting your OpenAI API key</a>).<br>
            \t • <b>Exceeded quota</b>: make sure your OpenAI billing is setup correctly.<br>
            \t • <b>Invalid Model name</b>: make sure you chose a supported model.<br>
            \t • <b>Model not compatible with your API Key</b>: you might not have access to one of the newer models.<br>
            \t • <b>Chat history too long</b>: ChatGPT has a limited context window. Export your current history to file and start a new chat.<br>
            <br>
            Double check your configuration and restart VS Code to try again.<br><br>
            If the issue persists, please <a href="https://github.com/yagil/chatIDE/issues">open an issue on GitHub</a> or contact us on <a href="https://twitter.com/aichatide">Twitter</a>.
            `;

            chatIdePanel.webview.postMessage({ command: "openAiError", error: humanRedableError });
        };
        
        const configDetails = `Model: ${model.toString()}`;
        const resourcePaths = {
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
                    for await (const token of getGptResponse(message.userMessage, errorCallback)) {
                        chatIdePanel.webview.postMessage({ command: "gptResponse", token });
                    }
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
                case 'navigateToHighlightedCode':
                    navigateToHighlightedCode();
                    return;
                case 'insertCode': // used for drag and drop
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        const position = activeEditor.selection.active;
                        activeEditor.edit((editBuilder) => {
                            editBuilder.insert(position, message.code);
                        });
                    }
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
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ChatIDE</title>
        <link rel="stylesheet" href="${paths.chatideCssPath}">
    </head>
    <body>
        <div id="chat-container">
            <div id="chat-header">
              <div id="logo-container">
                <img id="chat-logo" src="${paths.iconPath}">
                <h1 id="chat-title">ChatIDE</h1>
              </div>
              <div id="chat-control">
                <button id="reset-button" class="control-btn">Reset</button>
                <button id="export-button" class="control-btn">Export Messages</button>
                <button id="import-button" class="control-btn">Load Chat History</button>
              </div>
              <p id="config-details">${modelConfigDetails}</p>
            </div>
            <div id="messages"></div>
            <div class="chat-bar">
              <textarea id="message-input" spellcheck="true" oninput="autoResize(this)" placeholder="Type your question here..."></textarea>
              <button id="send-button">Send</button>
            </div>
            <div id="status-bar">
              <span id="highlighted-code-status">${codeHighlightStatusCopy}</span>
              <button id="show-code" style="display:none;">Show code</button>
            </div>
        </div>
        <link rel="stylesheet" href="${paths.highlightJsCssPath}">
        <script src="${paths.highlightJsScriptPath}"></script>
        <script src="${paths.chatideJsPath}"></script>
     </body>
  </html>
  `;
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

async function* getGptResponse(userMessage: string, errorCallback?: (error: any) => void) {
    initGptIfNeeded();

    if (highlightedCodeAwareness && selectedCodeSentToGpt !== selectedCode) {
        console.log("Including highlighted text in GPT request.");
        userMessage = `${prepareSelectedCodeContext()} ${userMessage}`;
        selectedCodeSentToGpt = selectedCode;
    } else {
        console.log("Not including highlighted text in GPT request because it's already been sent");
    }

    messages.push({"role": "user", "content": userMessage});

    const maxTokens = vscode.workspace.getConfiguration('chatide').get('maxLength');
    if (!maxTokens) {
        vscode.window.showErrorMessage('No max length found in the ChatIDE settings. Please add your max length using the "Open ChatIDE Settings" command and restart the extension.');
        return;
    }

    const temperature = vscode.workspace.getConfiguration('chatide').get('temperature');
    if (temperature === undefined) {
        vscode.window.showErrorMessage('No temperature found in the ChatIDE settings. Please add your temperature using the "Open ChatIDE Settings" command and restart the extension.');
        return;
    }

    const model = vscode.workspace.getConfiguration('chatide').get('model');
    if (!model) {
        vscode.window.showErrorMessage("No model found in the ChatIDE settings. Please add your model using the 'Open ChatIDE Settings' command and restart the extension.");
        return;
    }

    const maxTokensNumber = Number(maxTokens);
    const temperatureNumber = Number(temperature);
    const modelString = model.toString();

    try {
        const res = await openai.createChatCompletion({
            model: modelString,
            messages: messages,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            max_tokens: maxTokensNumber,
            temperature: temperatureNumber,
            stream: true,
        }, { responseType: 'stream' });

        for await (const token of streamToTokens(res, errorCallback)) {
            yield token;
        }
    } catch (error: any) {
        if (errorCallback) {
            errorCallback(error);
        }
    }
}

async function* streamToTokens(stream: any, errorCallback?: (error: any) => void) {
    let buffer = '';
    let gptMessage = '';

    try {
        for await (const chunk of stream.data) {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const message = line.replace(/^data: /, '');
                if (message === '[DONE]') {
                    messages.push({"role": "assistant", "content": gptMessage});
                    return;
                }
                try {
                    const json = JSON.parse(message);
                    const token = json.choices[0].delta.content;
                    if (token) {
                        gptMessage += token;
                        yield marked.marked(gptMessage);
                    }  
                } catch (error) {
                    // Dunno why yet, but parsing the message can result in "SyntaxError: Unexpected end of JSON input"
                    continue;
                }
            }
        }
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

async function initGptIfNeeded(force: boolean = false) {
    // If the API is already initialized, don't do anything
    // unless we're forcing a re-initialization.
    if (openai !== undefined && !force) {
        return;
    }
    
    // We should have the API key at this stage.
    if (!openAiApiKey) {
        vscode.window.showErrorMessage('No API key found in the secret storage. Please add your API key using the "Open ChatIDE Settings" command and restart the extension.');
        return;
    }
  
    console.log("Initializating OpenAI API");
    const configuration = new Configuration({
        apiKey: openAiApiKey,
    });
    openai = new OpenAIApi(configuration);
}

async function promptForApiKey(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: '[First time only]: Enter your Open API key to use ChatIDE. Your API key will be stored in VS Code\'s SecretStorage.',
        ignoreFocusOut: true,
        password: true,
    });

    if (apiKey) {
        await context.secrets.store('chatide.apiKey', apiKey);
        vscode.window.showInformationMessage('API key stored successfully.');
    } else {
        vscode.window.showErrorMessage('No API key entered. Please add your API key using the "Open ChatIDE Settings" command and restart the extension.');
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
