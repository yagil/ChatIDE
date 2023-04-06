// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';
import * as fs from 'fs';

import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

let openai: OpenAIApi;
let openAiApiKey: string;
let messages: ChatCompletionRequestMessage[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  
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
  
  let disposable = vscode.commands.registerCommand('chatide.start', async () => {
      const chatIdePanel = vscode.window.createWebviewPanel(
          'chatIde',
          'ChatIDE',
          vscode.ViewColumn.Beside,
          {
            // allow the extension to reach chatide.js
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

      const model = vscode.workspace.getConfiguration('chatide').get('model') || "No model configured";

      const configDetails = `Model: ${model.toString()}`;
      chatIdePanel.webview.html = getWebviewContent(jsPath.toString(), cssPath.toString(), configDetails);
      chatIdePanel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "getGptResponse":
                for await (const token of getGptResponse(message.userMessage)) {
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
            }
          },
          null,
          context.subscriptions
      );

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

function getWebviewContent(chatideJsPath: string, chatideCssPath: string, configDetails: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ChatIDE</title>
        <link rel="stylesheet" href="${chatideCssPath}">
    </head>
    <body>
        <div id="chat-container">
            <div id="chat-header">
              <div id="chat-control">
                <h1 id="chat-title">ChatIDE</h1>
                <button id="reset-button" class="control-btn">Reset Chat</button>
                <button id="export-button" class="control-btn">Export Messages</button>
              </div>
              <p id="config-details">${configDetails}</p>
            </div>
            <div id="messages"></div>
            <div class="chat-bar">
              <textarea id="message-input" spellcheck="true" oninput="autoResize(this)" placeholder="Type your question here..."></textarea>
              <button id="send-button">Send</button>
            </div>
        </div>
        <script src="${chatideJsPath}"></script>
     </body>
  </html>
  `;
}

function resetChat() {
  let systemPrompt: any = vscode.workspace.getConfiguration('chatide').get('systemPrompt');
  if (!systemPrompt) {
    vscode.window.showErrorMessage('No system prompt found in the ChatIDE settings. Please add your system prompt using the "Open ChatIDE Settings" command and restart the extension.');
    return;
  }

  messages = [];
  messages.push({"role": "system", "content": systemPrompt.toString()});
}

async function* getGptResponse(userMessage: string) {
  initGptIfNeeded();

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

    for await (const token of streamToTokens(res)) {
      yield token;
    }
  } catch (error: any) {
    console.error('Error fetching stream:', error);
  }
}

async function* streamToTokens(stream: any) {
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
  } catch (error) {
      console.error("Error in streamToTokens:", error);
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

async function initGptIfNeeded() {
  if (openai !== undefined) {
    return;
  }

  if (!openAiApiKey) {
    vscode.window.showErrorMessage('No API key found in the secret storage. Please add your API key using the "Open ChatIDE Settings" command and restart the extension.');
    return;
  }
  
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
    vscode.window.showInformationMessage('API key stored successfully. Restart the extension to apply changes.');
  } else {
    vscode.window.showErrorMessage('No API key entered. Please add your API key using the "Open ChatIDE Settings" command and restart the extension.');
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
