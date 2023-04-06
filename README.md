<h1 align="center">
  💬🤖 ChatIDE
  <h3 align='center'>
    Converse with ChatGPT inside VS Code
  </h3>
<h1>
<p align="center">
  <img width="1024" alt="image" src="https://user-images.githubusercontent.com/3611042/229839944-e632e394-76fe-427a-8c85-216481302526.png">
</p>

## Usage

1. Bring up ChatIDE with `Cmd + Shift + i`
2. Enjoy a trusty assistant by your side in all of your vscode projects

## Installation

1. Download the latest `.vsix` file from the releases page
2. Open VS Code and launch the Extensions pane (`Shift + Cmd + X`)
3. Click the "..." menu item on the far right
<img width="293" alt="image" src="https://user-images.githubusercontent.com/3611042/229850263-41e2be2e-d4aa-43d9-ad97-f6d84c9ab74c.png">
4. Choose "Install from VSIX"
<img width="293" alt="image" src="https://user-images.githubusercontent.com/3611042/229669541-9a36ff37-2506-4209-99e7-de9f08491436.png">

## Configuration

- Use the `Cmd + Shift + P` keychord and type `>Open ChatIDE Settings`
  - Choose your preferred `model`, `max_tokens`, and `temperature`.
  - If you don't have access to `gpt-4`, choose another chat model e.g. `gpt-3.5-turbo` (only Chat models are supported)
  - Adjust the system prompt to your liking
  - Note: settings will auto save
- Run ChatIDE with `Cmd + Shift + i`. You'll be asked for your OpenAI API key on first time you launch it.
  - Note: your API key will be stored in [VS Code's `secretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
<p align="center">
   <img width="1024" alt="image" src="https://user-images.githubusercontent.com/3611042/230432480-71859aec-d54a-48fb-a113-2ca9d28ae3ce.png">
</p>

## Known issues

1. There's currently no way to stop the model from generating. You need to wait until it's done.
2. Closing the ChatIDE pane while the model is generating will lead to a non-recoverable error. You'll need to restart VS Code to use ChatIDE again.
3. Closing / re-opening the ChatIDE pane does not reset the messages history. You can reset the message history by clicking the "Reset Chat" button (don't do this while the model is generating!)

## Warning

⚠️ This is an early prototype, use at your own peril.
🧐 Remember to keep an eye on your OpenAI billing.

## Credits

ChatIDE was built using ChatIDE.
