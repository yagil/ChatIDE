// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';

import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

let openai: OpenAIApi;

var messages: ChatCompletionRequestMessage[] = [
  {"role": "system", "content": "You are a helpful coding assistant running inside VS Code."}
];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('chatide.openSettings', openSettings)
  );
  
  const apiKey = vscode.workspace.getConfiguration('chatide').get('apiKey');
  if (!apiKey) {
    vscode.window.showErrorMessage('No API key found in the ChatIDE settings. Please add your API key using the "Open ChatIDE Settings" command and restart the extension.');
    return;
  }
  
  const configuration = new Configuration({
    apiKey: apiKey.toString(),
  });
  
  openai = new OpenAIApi(configuration);

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

      chatIdePanel.webview.html = getWebviewContent(jsPath.toString(), cssPath.toString());
      chatIdePanel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "getGptResponse":
                for await (const token of getGptResponse(message.userMessage)) {
                  chatIdePanel.webview.postMessage({ command: "gptResponse", token });
                }
                return;
            }
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

function getWebviewContent(chatideJsPath: string, chatideCssPath: string) {
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
            <h1 id="chat-title">ChatIDE</h1>
            <div id="messages"></div>
            <div class="chat-bar">
              <textarea id="message-input" spellcheck="true" oninput="autoResize(this)" placeholder="Type your question here..."></textarea>
              <button id="send-button">Send</button>
            </div>
        </div>
        <script src="${chatideJsPath}"></script>
        <script>
          function autoResize(textarea) {
              textarea.style.height = 'auto';
              textarea.style.height = textarea.scrollHeight + 'px';
          }
        </script>
     </body>
  </html>
  `;
}

async function* getGptResponse(userMessage: string) {
    messages.push({"role": "user", "content": userMessage});


    const maxTokens = vscode.workspace.getConfiguration('chatide').get('maxLength');
    if (!maxTokens) {
      vscode.window.showErrorMessage('No max length found in the ChatIDE settings. Please add your max length using the "Open ChatIDE Settings" command and restart the extension.');
      return;
    }

    const temperature = vscode.workspace.getConfiguration('chatide').get('temperature');
    if (!temperature) {
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

    const res = await openai.createChatCompletion({
        model: modelString,
        messages: messages,
        max_tokens: maxTokensNumber,
        temperature: temperatureNumber,
        stream: true,
    }, { responseType: 'stream' });

    for await (const token of streamToTokens(res)) {
      yield token;
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
                  return
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

// This method is called when your extension is deactivated
export function deactivate() {}
