<br>
<p align="center">
  <a href="https://chatide.dev" target="_blank">
    <img width="350" alt="image" src="https://user-images.githubusercontent.com/3611042/232338632-9c49eb40-f52b-40bc-87af-d6ffd3befc8c.png" alt="ChatIDE logo" >
  </a>
</p>
<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ChatIDE.chatide" target="_blank">
    <img src="https://img.shields.io/visual-studio-marketplace/d/chatide.chatide?logo=visual-studio-code&style=social" alt="Installs">
  </a>
  <span> </span>
  <a href="https://github.com/yagil/ChatIDE" target="_blank">
      <img src="https://img.shields.io/github/stars/yagil/ChatIDE?style=social" alt="Github repo stars">
  </a>
</p>
<p align="center">
    <b>ChatIDE - AI assistant in your IDE</b><br/>
  Converse with <a href="https://openai.com/blog/openai-api" target="_blank">OpenAI's ChatGPT</a> or <a href="https://console.anthropic.com/docs/api" target="_blank">Anthropic's Claude</a> in VSCode
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ChatIDE.chatide" target="_blank">
    <img width="309" alt="image" src="https://user-images.githubusercontent.com/3611042/232336724-71df6bf8-94e0-4b08-93fc-089ed70ad8ed.png">
  </a>
</p>

<p align="center">
  <a href="https://github.com/yagil/ChatIDE/blob/main/LICENSE" target="_blank">
      <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  </a>
</p>

[![Video demo](https://chatide.dev/assets/example.png)](https://user-images.githubusercontent.com/3611042/232339222-c0532f49-6772-46c5-b29e-be00f77c1c1c.mov) 

## Build and run from source

1. Clone this repository and install the npm dependencies
2. Open the project in VS Code
3. Press `F5` to launch the extension in debug mode

## Installation

Grab the latest ChatIDE version from the Extensions Marketplace:<br>
https://marketplace.visualstudio.com/items?itemName=ChatIDE.chatide

## Bring Your Own API keys

To use ChatGPT / Claude in ChatIDE, you need to procure API Keys from OpenAI / Anthropic.
- **OpenAI**: https://openai.com/product#made-for-developers
- **Anthropic**: https://console.anthropic.com/docs/api

## Usage

1. Bring up ChatIDE with `Cmd + Shift + i` (or `Ctrl + Shift + i` on non-Apple platforms).
2. Choose your AI model. Currently supported: 
    - `'gpt-4'`, `'gpt-4-0613'`,`'gpt-3.5-turbo'`,`'gpt-3.5-turbo-16k'`  (OpenAI)
    - `'claude-v1.3'` (Anthropic)
4. On first usage, you'll be prompted to enter your API key for your chosen AI providers (will be stored in VSCode `secretStorage`).
5. Enjoy!

## Configuration

- Use the `Cmd + Shift + P` keychord and type `>Open ChatIDE Settings`
  - Choose your preferred `model`, `max_tokens`, and `temperature`.
  - Adjust the system prompt to your liking
  - Note: settings will auto save
- Run ChatIDE with `Cmd + Shift + i`. You'll be asked for your OpenAI / Anthropic API key on first time you use the model.
  - Note: your API keys will be stored in [VS Code's `secretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
<p align="center">
  <img width="891" alt="image" src="https://github.com/yagil/ChatIDE/assets/3611042/ff80113a-018e-4576-bab2-3dec1dbc2b49">
</p>

### Updating your API key

1. Run `cmd + shift + P` (or `ctrl + shift + P`)
2. Start typing `>ChatIDE`

#### OpenAI
3. Select `>Update your OpenAI API Key for ChatIDE`.

#### Anthropic
3. Select `>Update your Anthropic API Key for ChatIDE`.

## Known issues

1. There's currently no way to stop the model from generating. You need to wait until it's done.
2. Closing the ChatIDE pane while the model is generating might lead to a non-recoverable error. You'll need to restart VS Code to use ChatIDE again.

## Warning

⚠️ This is an early prototype, use at your own peril.

🧐 Remember to keep an eye on your OpenAI / Anthropic billing.

## Credits

ChatIDE continues to be built using ChatIDE.
