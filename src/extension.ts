import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';
import * as fs from 'fs';
import * as os from 'os';

import { getProviderErrorMsg, promptForApiKey, providerFromModel } from './utils';

import { ChatCompletionRequestMessage } from "openai";

import { APIProvider } from "./apiProvider";
import { AnthropicProvider, AnthropicParams } from "./anthropic";
import { OpenAIProvider, OpenAIParams } from "./openai";
import { CustomLLMProvider } from './custom';

interface ResourcePaths {
    htmlPath: string;
    chatideJsPath: string;
    chatideCssPath: string;
    iconPath: string;
    highlightJsCssPath: string;
    highlightJsScriptPath: string;
}

interface Preferences {
    pressEnterToSend: boolean;
    autoSaveEnabled: boolean;
    includeFileTreeInContext: boolean;
    ignoredDirectories: string[];
    fileTreeWidth: number;
}

console.log("Node.js version:", process.version);

const isMac = process.platform === "darwin";

const OS_LOCALIZED_KEY_CHORD = isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P";
const NO_SELECTION_COPY = "No code is highlighted. Highlight code to include it in the message to ChatGPT.";
const SELECTION_AWARENESS_OFF_COPY = `Code selection awareness is turned off. To turn it on, go to settings (${OS_LOCALIZED_KEY_CHORD}).`;

let globalContext: vscode.ExtensionContext;
let apiProvider: APIProvider | undefined;
let messages: ChatCompletionRequestMessage[] = [];

let selectedCode: string = '';
let selectedCodeSentToGpt: string = '';
let selectedFiles: string[] = [];

let highlightedCodeAwareness: boolean = vscode.workspace.getConfiguration('chatide').get('highlightedCodeAwareness') || false;
let customServerUrl: string | undefined = vscode.workspace.getConfiguration('chatide').get('customServerUrl') || undefined;
let pressEnterToSend: boolean = vscode.workspace.getConfiguration('chatide').get('pressEnterToSend') || false;
let autoSaveEnabled: boolean = vscode.workspace.getConfiguration('chatide').get('autoSaveEnabled') || true;
let includeFileTreeInContext: boolean = vscode.workspace.getConfiguration('chatide').get('includeFileTreeInContext') || false;
let ignoredDirectories: string[] = vscode.workspace.getConfiguration('chatide').get('ignoredDirectories') || [".git", "node_modules", "dist", "build"];
let fileTreeWidth: number = vscode.workspace.getConfiguration('chatide').get('fileTreeWidth') || 250;
let currentSessionName: string|undefined = undefined;

let chatIdePanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log("activate chatide");
    globalContext = context;

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.openSettings', openSettings)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.updateOpenAiApiKey', async () => {
            await promptForApiKey("openAi", context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.updateAnthropicApiKey', async () => {
            await promptForApiKey("anthropic", context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('chatide.toggleFileTree', () => {
            if (chatIdePanel) {
                chatIdePanel.webview.postMessage({ command: 'toggleFileTree' });
            }
        })
    );

    const secretStorage = context.secrets;
    const secretChangeListener = secretStorage.onDidChange(async (e: vscode.SecretStorageChangeEvent) => {
        const forceReinit = true;

        if (e.key === "chatide.anthropicApiKey" || e.key === "chatide.openAiApiKey") {
            await initApiProviderIfNeeded(globalContext, forceReinit);
        }
    });

    context.subscriptions.push(secretChangeListener);

    let disposable = vscode.commands.registerCommand('chatide.start', async () => {
        chatIdePanel = vscode.window.createWebviewPanel(
            'chatIde',
            'ChatIDE',
            vscode.ViewColumn.Beside,
            {
                localResourceRoots: [vscode.Uri.file(path.join(__dirname, '..'))],
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );

        const resourcePaths = getResourcePaths(context, chatIdePanel);
        const model = vscode.workspace.getConfiguration('chatide').get('model') || "No model configured";
        const configDetails = model.toString();

        chatIdePanel.webview.html = getWebviewContent(resourcePaths, configDetails);

        const preferences = gatherPreferences();
        console.log("preferences", preferences);
        chatIdePanel.webview.postMessage({
            command: 'updatePreferences',
            preferences
        });

        resetChat();

        chatIdePanel.webview.onDidReceiveMessage(handleWebviewMessage(context, chatIdePanel), null, context.subscriptions);

        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((event) => handleSelectionChange(event, chatIdePanel!))
        );

        setupConfigurationListeners(chatIdePanel);

        chatIdePanel.onDidDispose(
            () => {
                console.log('WebView closed');
                chatIdePanel = undefined;
            },
            null,
            context.subscriptions
        );

        // Send initial file tree data
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            const fileTree = await getFileTree(workspaceFolders[0].uri.fsPath);
            chatIdePanel.webview.postMessage({ command: 'updateFileTree', fileTree });
        }
    });

    context.subscriptions.push(disposable);
}

function getResourcePaths(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): ResourcePaths {
    const htmlPathUri = vscode.Uri.file(path.join(context.extensionPath, 'src', 'chatide.html'));
    const htmlPath = htmlPathUri.with({ scheme: 'vscode-resource' });

    let jsPathUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "chatide.js")));
    const jsPath = panel.webview.asWebviewUri(jsPathUri).toString();

    let cssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "chatide.css")));
    const cssPath = panel.webview.asWebviewUri(cssUri).toString();

    let highlightJsCssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "atom-one-dark.min.css")));
    const highlightJsCssPath = panel.webview.asWebviewUri(highlightJsCssUri).toString();

    let highlightJsScriptUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "highlight.min.js")));
    const highlightJsScriptPath = panel.webview.asWebviewUri(highlightJsScriptUri).toString();

    let iconUri = vscode.Uri.file(context.asAbsolutePath(path.join('assets', "icon.jpg")));
    const iconPath = panel.webview.asWebviewUri(iconUri).toString();

    return {
        htmlPath: htmlPath.fsPath,
        chatideJsPath: jsPath,
        chatideCssPath: cssPath,
        iconPath: iconPath,
        highlightJsCssPath: highlightJsCssPath,
        highlightJsScriptPath: highlightJsScriptPath,
    };
}

function handleWebviewMessage(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
    return async (message: any) => {
        switch (message.command) {
        case "getGptResponse":
            await handleGetGptResponse(message, panel, context);
            break;
        case "resetChat":
            resetChat();
            panel.webview.postMessage({ command: "resetChatComplete" });
            break;
        case "exportChat":
            await exportChat();
            break;
        case "importChat":
            const success = await importChat();
            if (success) {
                panel.webview.postMessage({ command: "loadChatComplete", messages });
            } else {
                console.error("Failed to import chat");
            }
            break;
        case "navigateToHighlightedCode":
            navigateToHighlightedCode();
            break;
        case "insertCode":
            insertCode(message.code);
            break;
        case "openSettings":
            vscode.commands.executeCommand('workbench.action.openSettings', 'chatide');
            break;
        case "toggleAutoSave":
            autoSaveEnabled = message.enabled;
            break;
        case "updateSelectedFiles":
            selectedFiles = message.selectedFiles.map((file: string) => {
                return vscode.Uri.file(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, file)).fsPath;
            });
            break;
        case "updateFileTreeWidth":
            fileTreeWidth = message.width;
            await vscode.workspace.getConfiguration('chatide').update('fileTreeWidth', fileTreeWidth, vscode.ConfigurationTarget.Global);
            break;
        }
    };
}

async function handleGetGptResponse(message: any, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const userMessageMarkdown = marked.marked(message.userMessage);
    panel.webview.postMessage({ command: "sentUserMessage", userMessageMarkdown });

    await initApiProviderIfNeeded(context);

    await getGptResponse(
        message.userMessage,
        (token) => {
            panel.webview.postMessage({ command: "gptResponse", token });
        },
        (error) => {
            console.error('Error fetching stream:', error);
            const errorMessage = error.message;
            const provider = providerFromModel(vscode.workspace.getConfiguration('chatide').get('model')!.toString());
            const humanRedableError = getProviderErrorMsg(provider.toString(), errorMessage);
            panel.webview.postMessage({ command: "openAiError", error: humanRedableError });
        }
    );
}

function setupConfigurationListeners(panel: vscode.WebviewPanel) {
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('chatide.highlightedCodeAwareness')) {
            highlightedCodeAwareness = vscode.workspace.getConfiguration('chatide').get('highlightedCodeAwareness') || false;
            panel.webview.postMessage({
                command: 'updateHighlightedCodeStatus',
                status: !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY,
                showButton: false
            });
        }
        if (e.affectsConfiguration('chatide.pressEnterToSend')) {
            pressEnterToSend = vscode.workspace.getConfiguration('chatide').get('pressEnterToSend') || false;
            panel.webview.postMessage({
                command: 'updatePreferences',
                preferences: gatherPreferences(),
            });
        }
        if (e.affectsConfiguration('chatide.customServerUrl')) {
            customServerUrl = vscode.workspace.getConfiguration('chatide').get('customServerUrl');
            initApiProviderIfNeeded(globalContext, true);
        }
        if (e.affectsConfiguration('chatide.model')) {
            initApiProviderIfNeeded(globalContext, true);
            panel.webview.postMessage({
                command: 'updateModelConfigDetails',
                modelConfigDetails: vscode.workspace.getConfiguration('chatide').get('model')!,
            });
        }
        if (e.affectsConfiguration('chatide.includeFileTreeInContext')) {
            includeFileTreeInContext = vscode.workspace.getConfiguration('chatide').get('includeFileTreeInContext') || false;
            panel.webview.postMessage({
                command: 'updatePreferences',
                preferences: gatherPreferences(),
            });
        }
        if (e.affectsConfiguration('chatide.ignoredDirectories')) {
            ignoredDirectories = vscode.workspace.getConfiguration('chatide').get('ignoredDirectories') || [".git", "node_modules", "dist", "build"];
            updateFileTree(panel);
        }
        if (e.affectsConfiguration('chatide.fileTreeWidth')) {
            fileTreeWidth = vscode.workspace.getConfiguration('chatide').get('fileTreeWidth') || 250;
            panel.webview.postMessage({
                command: 'updateFileTreeWidth',
                width: fileTreeWidth
            });
        }
    });
}

function openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'chatide');
}

function getWebviewContent(paths: ResourcePaths, modelConfigDetails: string) {
    const codeHighlightStatusCopy = !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY;

    console.log(`Loading webview content from ${paths.htmlPath}`);

    const html = fs.readFileSync(paths.htmlPath, 'utf8');
    const variables = {
        paths,
        modelConfigDetails,
        codeHighlightStatusCopy,
        autoSaveEnabled
    };

    const webviewHtml = (new Function("variables", `with (variables) { return \`${html}\`; }`))(variables);

    return webviewHtml;
}

function resetChat() {
    console.log("Resetting chat");
    let systemPrompt: any = vscode.workspace.getConfiguration('chatide').get('systemPrompt');
    if (!systemPrompt) {
        vscode.window.showErrorMessage('No system prompt found in the ChatIDE settings. Please add your system prompt using the "Open ChatIDE Settings" command and restart the extension.');
        return;
    }

    currentSessionName = undefined;
    messages = [];
    messages.push({ "role": "system", "content": systemPrompt.toString() });
}

async function getGptResponse(userMessage: string, completionCallback: (completion: string) => void, errorCallback?: (error: any) => void) {
    if (!apiProvider) {
        throw new Error("API provider is not initialized.");
    }

    let contextMessage = "";

    if (highlightedCodeAwareness && selectedCodeSentToGpt !== selectedCode) {
        console.log("Including highlighted text in API request.");
        contextMessage += prepareSelectedCodeContext();
        selectedCodeSentToGpt = selectedCode;
    }

    if (includeFileTreeInContext && selectedFiles.length > 0) {
        console.log("Including selected files in API request.");
        contextMessage += await prepareSelectedFilesContext();
    }

    userMessage = `${contextMessage}${userMessage}`;
    messages.push({ role: "user", content: userMessage });

    const maxTokens = vscode.workspace.getConfiguration("chatide").get("maxLength");
    const model = vscode.workspace.getConfiguration("chatide").get("model")!;
    let provider = providerFromModel(model.toString());
    const temperature = vscode.workspace.getConfiguration("chatide").get("temperature");

    if (!maxTokens) {
        vscode.window.showErrorMessage(
            'Missing maxLength in the ChatIDE settings. Please add them using the "Open ChatIDE Settings" command and restart the extension.'
        );
        return;
    }

    let params: OpenAIParams | AnthropicParams;

    if (provider === "openai" || provider === "custom") {
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
            messages,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            max_tokens: Number(maxTokens),
            model: model.toString(),
            temperature: Number(temperature),
            stream: true
        };
    }
    else {
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
                        completionCallback(marked.marked(completion ?? "<no completion>"));
                    }
                },
                onComplete: (message: string) => {
                    messages.push({ "role": "assistant", "content": message });
                    autoSaveMessages();
                }
            }
        );
    } catch (error: any) {
        if (errorCallback) {
            errorCallback(error);
        }
    }
}

async function autoSaveMessages() {
    if (!autoSaveEnabled) {
        return;
    }

    const autoSaveDirectory = vscode.workspace.getConfiguration('chatide').get('autoSaveDirectory') as string;
    if (!autoSaveDirectory) {
        return;
    }

    const fullPath = autoSaveDirectory.startsWith('~')
        ? path.join(os.homedir(), autoSaveDirectory.slice(1))
        : autoSaveDirectory;

    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }

    if (!currentSessionName) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        currentSessionName = `chatide-chat-${timestamp}.json`;
    }

    const filePath = path.join(fullPath, currentSessionName);

    const content = JSON.stringify(messages, null, 2);
    fs.writeFile(filePath, content, (err) => {
        if (err) {
            console.error('Failed to auto-save messages:', err);
        } else {
            console.log('Messages auto-saved successfully!');
        }
    });
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
        console.log("Initializing Anthropic provider...");
        apiProvider = new AnthropicProvider(context);
    } else if (providerType === "openai") {
        console.log("Initializing OpenAI provider...");
        apiProvider = new OpenAIProvider(context);
    }
    else if (providerType === "custom") {
        console.log("Initializing custom provider...");
        apiProvider = new CustomLLMProvider(context, customServerUrl);
    } else {
        vscode.window.showErrorMessage(
            `Invalid provider "${providerType}" in the ChatIDE settings. Please use a valid provider and restart the extension.`
        );
        return;
    }try {
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

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent, chatIdePanel: vscode.WebviewPanel) {
    selectedCode = event.textEditor.document.getText(event.selections[0]);
    if (selectedCode && highlightedCodeAwareness) {
        const numCharacters = selectedCode.length;
        chatIdePanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: `${numCharacters} characters (${getTokenEstimateString(numCharacters)}) are highlighted. This code will be included in your message to the assistant.`,
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

function getTokenEstimateString(numCharacters: number): string {
    const estimate = Math.round(numCharacters / 4);
    if (estimate === 1) {
        return `~${estimate} token`;
    }
    return `~${estimate} tokens`;
}

function prepareSelectedCodeContext() {
    return `
    CONTEXT:
    =========================
    In my question I am referring to the following code:
    ${selectedCode}
    =========================\n`;
}

async function prepareSelectedFilesContext() {
    let context = "CONTEXT:\n=========================\n";
    context += "The following files are relevant to my question:\n";

    for (const filePath of selectedFiles) {
        context += `${filePath}\n`;
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            context += `\nContent of ${filePath}:\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            context += `Error reading file ${filePath}\n`;
        }
    }

    context += "=========================\n";
    return context;
}

async function getFileTree(rootPath: string): Promise<any> {
    const fileTree: any = {};

    async function traverseDirectory(currentPath: string, currentNode: any) {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            if (ignoredDirectories.includes(entry.name)) {
                continue;
            }

            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                currentNode[entry.name] = {};
                await traverseDirectory(fullPath, currentNode[entry.name]);
                // Remove empty directories
                if (Object.keys(currentNode[entry.name]).length === 0) {
                    delete currentNode[entry.name];
                }
            } else {
                currentNode[entry.name] = null;
            }
        }
    }

    await traverseDirectory(rootPath, fileTree);
    return fileTree;
}

async function updateFileTree(panel: vscode.WebviewPanel) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const fileTree = await getFileTree(workspaceFolders[0].uri.fsPath);
        panel.webview.postMessage({ command: 'updateFileTree', fileTree });
    }
}

function insertCode(code: string) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const position = activeEditor.selection.active;
        activeEditor.edit((editBuilder) => {
            editBuilder.insert(position, code);
        });
    }
}

function gatherPreferences(): Preferences {
    const pressEnterToSend = vscode.workspace.getConfiguration('chatide').get('pressEnterToSend') || false;
    const autoSaveEnabled = vscode.workspace.getConfiguration('chatide').get('autoSaveEnabled') || false;
    const includeFileTreeInContext = vscode.workspace.getConfiguration('chatide').get('includeFileTreeInContext') || false;
    const ignoredDirectories = vscode.workspace.getConfiguration('chatide').get('ignoredDirectories') || [".git", "node_modules", "dist", "build"];
    const fileTreeWidth = vscode.workspace.getConfiguration('chatide').get('fileTreeWidth') || 250;
    return {
        pressEnterToSend,
        autoSaveEnabled,
        includeFileTreeInContext,
        ignoredDirectories,
        fileTreeWidth
    } as Preferences;
}

export function deactivate() {
    console.log("deactivate chatide");
}