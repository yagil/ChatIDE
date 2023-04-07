# ChatIDE - Converse with ChatGPT inside VS Code

🤖 Launch ChatIDE with `Cmd + Shift + i`.<br>
💬 Use it just like you would use ChatGPT in the browser.
<br>

![GitHub Repo stars](https://img.shields.io/github/stars/yagil/ChatIDE?style=social)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


### Demo (sped up 4x)
[![Demo video](https://chatide.dev/assets/example.png)](https://user-images.githubusercontent.com/3611042/230437890-2b9870b8-1bfb-404a-abe4-8457b782e709.mp4)

## Installation

Grab the latest ChatIDE version from the Extensions Marketplace:

https://marketplace.visualstudio.com/items?itemName=ChatIDE.chatide

## Usage

1. Bring up ChatIDE with `Cmd + Shift + i`.
2. On first launch, you'll be prompted to enter your OpenAI API key (stored in VSCode `secretStorage`).
3. Enjoy!

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
